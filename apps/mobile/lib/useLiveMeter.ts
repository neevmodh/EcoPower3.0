// Mobile's live-data hook (#44) — same channel shape, same connection
// states, and the same 5s poll fallback as web's useLiveMeter
// (apps/web/lib/useLiveMeter.ts), plus the one thing native needs that web
// doesn't: an AppState listener. Android kills the websocket when the app
// backgrounds; without explicitly tearing the channel down on background
// and resubscribing on foreground, the UI silently shows stale data with
// no error on return — numbers frozen at whatever they were two minutes
// ago while everything *looks* live. That's the actual bug this hook
// exists to prevent, not a hypothetical.
import { useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { supabase } from "./supabase";

export type ConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "polling";

export interface LiveMeterReading {
  meterId: string;
  readingTs: string;
  kwhImport: number | null;
  kwhExport: number | null;
}

const RENDER_THROTTLE_MS = 250; // 4Hz
const POLL_INTERVAL_MS = 5000;
const RECONNECT_GRACE_MS = 8000; // how long to sit in "reconnecting" before falling back to polling

export function useLiveMeter(
  meterId: string,
  initial: LiveMeterReading | null,
) {
  const [reading, setReading] = useState<LiveMeterReading | null>(initial);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");

  const lastAppliedAt = useRef(0);
  const pending = useRef<LiveMeterReading | null>(null);
  const throttleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectGrace: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    // biome-ignore lint/suspicious/noExplicitAny: supabase-js's RealtimeChannel type isn't imported just for this local variable
    let channel: any = null;

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

    function teardownChannel() {
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
      if (reconnectGrace) {
        clearTimeout(reconnectGrace);
        reconnectGrace = null;
      }
    }

    function subscribeChannel() {
      if (cancelled || channel) return;
      setConnectionState("connecting");
      channel = supabase
        .channel(`meter:${meterId}`, { config: { private: true } })
        .on(
          "broadcast",
          { event: "reading" },
          ({ payload }: { payload: unknown }) => {
            if (cancelled) return;
            stopPolling();
            setConnectionState("connected");
            if (reconnectGrace) {
              clearTimeout(reconnectGrace);
              reconnectGrace = null;
            }
            applyThrottled(payload as LiveMeterReading);
          },
        )
        .subscribe((status: string) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            setConnectionState("connected");
            stopPolling();
          } else if (
            status === "CLOSED" ||
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT"
          ) {
            setConnectionState("reconnecting");
            if (!reconnectGrace) {
              reconnectGrace = setTimeout(() => {
                if (!cancelled) startPolling();
              }, RECONNECT_GRACE_MS);
            }
          }
        });
    }

    subscribeChannel();

    // The mobile-specific half of #44: background kills the socket on
    // Android without a trace, so tear the channel down explicitly rather
    // than let it die silently, and rebuild it fresh on foreground rather
    // than trust a socket that's been asleep for an unknown length of time.
    function handleAppStateChange(next: AppStateStatus) {
      if (next === "background" || next === "inactive") {
        stopPolling();
        teardownChannel();
      } else if (next === "active") {
        subscribeChannel();
      }
    }
    const appStateSub = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => {
      cancelled = true;
      stopPolling();
      teardownChannel();
      if (throttleTimer.current) clearTimeout(throttleTimer.current);
      appStateSub.remove();
    };
  }, [meterId]);

  return { reading, connectionState };
}
