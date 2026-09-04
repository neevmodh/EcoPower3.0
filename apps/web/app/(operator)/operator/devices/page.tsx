import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const STATUS_COLOR: Record<string, string> = {
  active: "var(--color-status-good)",
  inactive: "var(--color-text-secondary)",
  faulty: "var(--color-status-serious)",
  decommissioned: "var(--color-text-secondary)",
};

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default async function OperatorDevicesPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  // meters_resco_scope (#18) confines this to meters behind an asset your
  // org actually installed — the RLS policy, not this query, is what
  // makes "no WHERE clause on org" still return the right rows.
  const { data: meters } = await supabase
    .from("meters")
    .select("id, serial, make, model, firmware, comm_protocol, status, last_seen_at, service_connections(consumer_number)")
    .order("serial");

  const statusCounts = (meters ?? []).reduce<Record<string, number>>((acc, m) => {
    acc[m.status] = (acc[m.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <PanelShell
      panel="operator"
      email={user.email ?? ""}
      nav={[
        { href: "/operator", label: "Fleet" },
        { href: "/operator/devices", label: "Devices", active: true },
        { href: "/operator/guarantee", label: "Guarantees" },
        { href: "/operator/esg", label: "ESG report" },
      ]}
    >
      <h1 className="text-2xl font-semibold mb-1">Device health</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Meters behind the sites your org services. Status and last-seen are real columns, not a decorative dot.
      </p>

      <div className="flex gap-3 mb-6">
        {Object.entries(statusCounts).map(([status, count]) => (
          <span
            key={status}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
            style={{ borderColor: "var(--color-border)" }}
          >
            <span className="inline-block rounded-full" style={{ width: 6, height: 6, background: STATUS_COLOR[status] ?? "var(--color-text-secondary)" }} />
            {count} {status}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--color-border)" }}>
              <th className="py-2 pr-4 font-medium" style={{ color: "var(--color-text-secondary)" }}>Serial</th>
              <th className="py-2 pr-4 font-medium" style={{ color: "var(--color-text-secondary)" }}>Site</th>
              <th className="py-2 pr-4 font-medium" style={{ color: "var(--color-text-secondary)" }}>Make/model</th>
              <th className="py-2 pr-4 font-medium" style={{ color: "var(--color-text-secondary)" }}>Status</th>
              <th className="py-2 font-medium" style={{ color: "var(--color-text-secondary)" }}>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {(meters ?? []).map((m) => {
              const sc = m.service_connections as unknown as { consumer_number: string } | null;
              return (
                <tr key={m.id} className="border-b last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
                  <td className="py-2.5 pr-4 tabular font-medium">{m.serial}</td>
                  <td className="py-2.5 pr-4 tabular" style={{ color: "var(--color-text-secondary)" }}>{sc?.consumer_number ?? "—"}</td>
                  <td className="py-2.5 pr-4" style={{ color: "var(--color-text-secondary)" }}>
                    {m.make || m.model ? `${m.make ?? ""} ${m.model ?? ""}`.trim() : "—"}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: STATUS_COLOR[m.status] }}>
                      <span className="inline-block rounded-full" style={{ width: 6, height: 6, background: STATUS_COLOR[m.status] }} />
                      {m.status}
                    </span>
                  </td>
                  <td className="py-2.5 tabular" style={{ color: "var(--color-text-secondary)" }}>{relativeTime(m.last_seen_at)}</td>
                </tr>
              );
            })}
            {(meters ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center" style={{ color: "var(--color-text-secondary)" }}>
                  No devices visible to this account.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </PanelShell>
  );
}
