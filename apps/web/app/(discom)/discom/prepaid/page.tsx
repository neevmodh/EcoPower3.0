import { redirect } from "next/navigation";
import { formatInrFromPaise } from "@ecopower/shared";
import { PanelShell } from "@/components/PanelShell";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Row = {
  service_connection_id: string;
  balance_paise: number;
  low_balance_threshold_paise: number;
  disconnect_pending: boolean;
  last_settled_on: string | null;
  service_connections: { consumer_number: string } | null;
};

const NAV = [
  { href: "/discom", label: "Overview" },
  { href: "/discom/connections", label: "Connections" },
  { href: "/discom/losses", label: "AT&C losses" },
  { href: "/discom/netmetering", label: "Net-metering" },
  { href: "/discom/prepaid", label: "Prepaid", active: true },
  { href: "/discom/audit", label: "Audit log" },
];

export default async function DiscomPrepaidPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  const { data } = await supabase
    .from("prepaid_accounts")
    .select("service_connection_id, balance_paise, low_balance_threshold_paise, disconnect_pending, last_settled_on, service_connections(consumer_number)")
    .order("balance_paise", { ascending: true });
  const rows = (data ?? []) as unknown as Row[];

  const pending = rows.filter((r) => r.disconnect_pending);

  return (
    <PanelShell panel="discom" email={user.email ?? ""} nav={NAV}>
      <h1 className="text-2xl font-semibold mb-1">Prepaid oversight</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Prepaid connections in your division, lowest balance first. Balance is drawn down daily against metered
        consumption at each account's vend rate; an account at or below its threshold is flagged for the disconnection
        queue. Disconnection itself is a separate two-person action (#32) — this is the watch list.
      </p>

      {rows.length === 0 ? (
        <p style={{ color: "var(--color-text-secondary)" }}>No prepaid connections in this division.</p>
      ) : (
        <>
          <div className="mb-4 text-sm">
            <span className="font-semibold tabular" style={{ color: pending.length > 0 ? "var(--color-status-serious)" : "var(--color-status-good)" }}>
              {pending.length}
            </span>{" "}
            <span style={{ color: "var(--color-text-secondary)" }}>
              account{pending.length === 1 ? "" : "s"} on the disconnection watch list
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b" style={{ borderColor: "var(--color-border)" }}>
                  {["Consumer", "Balance", "Threshold", "Last settled", "Status"].map((h) => (
                    <th key={h} className="py-2 pr-4 font-medium" style={{ color: "var(--color-text-secondary)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.service_connection_id} className="border-b last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
                    <td className="py-3 pr-4 font-medium">{r.service_connections?.consumer_number ?? "—"}</td>
                    <td
                      className="py-3 pr-4 tabular font-semibold"
                      style={{ color: r.disconnect_pending ? "var(--color-status-serious)" : "var(--color-text-primary)" }}
                    >
                      {formatInrFromPaise(BigInt(Math.round(r.balance_paise)))}
                    </td>
                    <td className="py-3 pr-4 tabular" style={{ color: "var(--color-text-secondary)" }}>
                      {formatInrFromPaise(BigInt(Math.round(r.low_balance_threshold_paise)))}
                    </td>
                    <td className="py-3 pr-4 tabular" style={{ color: "var(--color-text-secondary)" }}>
                      {r.last_settled_on ?? "—"}
                    </td>
                    <td className="py-3">
                      {r.disconnect_pending ? (
                        <span className="text-xs font-semibold" style={{ color: "var(--color-status-serious)" }}>
                          On watch list
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--color-status-good)" }}>
                          OK
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </PanelShell>
  );
}
