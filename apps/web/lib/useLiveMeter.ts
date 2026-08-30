"use client";

// The live-data hook for #18. Subscribes to a PRIVATE Realtime Broadcast
// channel (RLS-gated by 0007's meter_broadcast_authorization policy — a
// consumer can only join their own meter's channel, DISCOM staff only
// their division's). Falls back to a 5s poll if the socket drops, and
// never lies about which state it's in — the explicit antithesis of 2.0's
// hardcoded "LIVE" dot that never actually refreshed.

import { useEffect, useRef, useState } from "react";
import { createClient } from "./supabase/browser";

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "polling";

export interface LiveMeterReading {
  meterId: string;
  readingTs: string;
  kwhImport: number | null;
  kwhExport: number | null;
}

const RENDER_THROTTLE_MS = 250; // 4Hz
const POLL_INTERVAL_MS = 5000;
const RECONNECT_GRACE_MS = 8000; // how long to sit in "reconnecting" before falling back to polling

export function useLiveMeter(meterId: string, initial: LiveMeterReading | null) {
  const [reading, setReading] = useState<LiveMeterReading | null>(initial);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");

  const lastAppliedAt = useRef(0);
  const pending = useRef<LiveMeterReading | null>(null);
  const throttleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectGrace: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function applyThrottled(next: LiveMeterReading) {
      const now = Date.now();
      const elapsed = now - lastAppliedAt.current;
      if (elapsed >= RENDER_THROTTLE_MS) {
        lastAppliedAt.current = now;
        setReading(next);
        return;
      }
      pending.current = next;
      if (!throttleTimer.current) {
        throttleTimer.current = setTimeout(() => {
          throttleTimer.current = null;
          if (pending.current) {
            lastAppliedAt.current = Date.now();
            setReading(pending.current);
            pending.current = null;
          }
        }, RENDER_THROTTLE_MS - elapsed);
      }
    }

    function startPolling() {
      if (pollTimer) return;
      setConnectionState("polling");
      pollTimer = setInterval(async () => {
        const { data } = await supabase
          .from("meter_live_state")
          .select("meter_id, last_reading_ts, kwh_import, kwh_export")
          .eq("meter_id", meterId)
          .maybeSingle();
        if (data && !cancelled) {
          applyThrottled({
            meterId: data.meter_id,
            readingTs: data.last_reading_ts,
            kwhImport: data.kwh_import,
            kwhExport: data.kwh_export,
          });
        }
      }, POLL_INTERVAL_MS);
    }

    function stopPolling() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }

    const channel = supabase
      .channel(`meter:${meterId}`, { config: { private: true } })
      .on("broadcast", { event: "reading" }, ({ payload }) => {
        if (cancelled) return;
        stopPolling();
        setConnectionState("connected");
        if (reconnectGrace) {
          clearTimeout(reconnectGrace);
          reconnectGrace = null;
        }
        applyThrottled(payload as LiveMeterReading);
      })
      .subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          setConnectionState("connected");
          stopPolling();
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnectionState("reconnecting");
          // Realtime client retries the socket on its own; if it hasn't
          // recovered within the grace window, don't leave the user
          // staring at a stale "reconnecting" — fall back to polling.
          if (!reconnectGrace) {
            reconnectGrace = setTimeout(() => {
              if (!cancelled) startPolling();
            }, RECONNECT_GRACE_MS);
          }
        }
      });

    return () => {
      cancelled = true;
      stopPolling();
      if (reconnectGrace) clearTimeout(reconnectGrace);
      if (throttleTimer.current) clearTimeout(throttleTimer.current);
      supabase.removeChannel(channel);
    };
  }, [meterId]);

  return { reading, connectionState };
}
