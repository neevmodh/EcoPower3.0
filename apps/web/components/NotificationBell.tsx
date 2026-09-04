"use client";

// Real notifications (#86), not a decorative badge. Polls every 30s (2.0's
// own NotificationCenter used the same interval, and it's the honest
// choice here too — Realtime Broadcast is reserved for meter data, #18).
// Empty inbox renders "No notifications", never a hidden/absent badge that
// could be mistaken for "definitely nothing new."

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { PanelIcon } from "./Icon";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[] | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("notifications")
      .select("id, type, title, body, link, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    setNotifications(data ?? []);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const unreadCount = notifications?.filter((n) => !n.read_at).length ?? 0;

  async function markAllRead() {
    const supabase = createClient();
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    load();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex items-center justify-center rounded-control border transition-colors duration-state"
        style={{ width: 36, height: 36, borderColor: "var(--color-border)" }}
        aria-label="Notifications"
      >
        <span style={{ color: "var(--color-text-secondary)" }}>
          <PanelIcon name="bell" size={17} />
        </span>
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full on-accent font-semibold tabular"
            style={{ minWidth: 16, height: 16, fontSize: 10, padding: "0 3px", background: "var(--color-status-critical)" }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 rounded-card border z-20"
          style={{
            width: 320,
            background: "var(--color-surface-card)",
            borderColor: "var(--color-border)",
            boxShadow: "var(--shadow-card-hover)",
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
            <span className="text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <button type="button" onClick={markAllRead} className="text-xs" style={{ color: "var(--color-categorical-third)" }}>
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications === null ? (
              <div className="px-4 py-6 text-sm text-center" style={{ color: "var(--color-text-secondary)" }}>
                Loading…
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-6 text-sm text-center" style={{ color: "var(--color-text-secondary)" }}>
                No notifications
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className="px-4 py-3 border-b last:border-b-0"
                  style={{
                    borderColor: "var(--color-border)",
                    background: n.read_at ? "transparent" : "color-mix(in oklab, var(--color-categorical-third) 6%, transparent)",
                  }}
                >
                  <div className="text-sm font-medium">{n.title}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                    {n.body}
                  </div>
                  <div className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
                    {new Date(n.created_at).toLocaleString("en-IN")}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
