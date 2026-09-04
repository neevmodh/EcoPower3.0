"use client";

// Full-page notification centre (design canvas screen 10). The bell in the
// header is the glance; this is the archive: filter by type, mark one or all
// read, delete. Same `notifications` table and 30s poll as NotificationBell —
// Realtime Broadcast stays reserved for meter data (#18).

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { PanelIcon, type IconName } from "./Icon";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

const TYPE_ICON: Record<string, IconName> = {
  billing: "receipt",
  payment: "receipt",
  outage: "bolt",
  grid: "bolt",
  solar: "sun",
  netmetering: "plug",
  ticket: "chat",
  prepaid: "leaf",
};

function iconFor(type: string): IconName {
  return TYPE_ICON[type] ?? "bell";
}

export function NotificationsPanel({ initial }: { initial: Notification[] }) {
  const [items, setItems] = useState<Notification[]>(initial);
  const [filter, setFilter] = useState<string>("all");

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("notifications")
      .select("id, type, title, body, link, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data) setItems(data);
  }, []);

  useEffect(() => {
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const types = useMemo(() => Array.from(new Set(items.map((n) => n.type))).sort(), [items]);
  const shown = filter === "all" ? items : items.filter((n) => n.type === filter);
  const unread = items.filter((n) => !n.read_at).length;

  async function markAll() {
    const supabase = createClient();
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    load();
  }

  async function markOne(id: string) {
    const supabase = createClient();
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    load();
  }

  async function remove(id: string) {
    const supabase = createClient();
    await supabase.from("notifications").delete().eq("id", id);
    load();
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">Notifications</h1>
          {unread > 0 && (
            <span
              className="mono text-xs on-accent rounded-full px-2 py-0.5 font-semibold"
              style={{ background: "var(--color-categorical-third)" }}
            >
              {unread} new
            </span>
          )}
        </div>
        {unread > 0 && (
          <button
            type="button"
            onClick={markAll}
            className="text-xs rounded-control border px-3 py-1.5"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
          >
            Mark all read
          </button>
        )}
      </div>

      <div className="flex gap-2 flex-wrap mb-4">
        {["all", ...types].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setFilter(t)}
            className="mono text-xs rounded-full px-3 h-7"
            style={{
              background: filter === t ? "var(--color-categorical-third)" : "var(--color-surface-sunken)",
              color: filter === t ? "#04140b" : "var(--color-text-secondary)",
            }}
          >
            {t === "all" ? "All" : t}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Nothing here. Outage, tamper and payment events are raised automatically — you never have to report those.
        </p>
      ) : (
        <div
          className="rounded-card border card-shadow divide-y"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
        >
          {shown.map((n) => (
            <div
              key={n.id}
              className="flex gap-3 p-4"
              style={{
                borderColor: "var(--color-border)",
                background: n.read_at ? "transparent" : "color-mix(in oklab, var(--color-categorical-third) 5%, transparent)",
              }}
            >
              <span
                className="inline-flex items-center justify-center rounded-control shrink-0"
                style={{ width: 32, height: 32, background: "var(--color-surface-sunken)", color: "var(--color-text-secondary)" }}
              >
                <PanelIcon name={iconFor(n.type)} size={15} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{n.title}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                  {n.body}
                </div>
                <div className="mono text-[10px] mt-1.5" style={{ color: "var(--color-text-tertiary)" }} suppressHydrationWarning>
                  {new Date(n.created_at).toLocaleString("en-GB")}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                {!n.read_at && (
                  <button
                    type="button"
                    onClick={() => markOne(n.id)}
                    className="text-[10px] rounded-control border px-2 py-1"
                    style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
                  >
                    Read
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(n.id)}
                  className="text-[10px] rounded-control border px-2 py-1"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-text-tertiary)" }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
