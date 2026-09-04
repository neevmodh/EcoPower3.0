import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type AuditRow = {
  id: string;
  occurred_at: string;
  actor_user_id: string | null;
  entity_type: string;
  entity_id: string;
  from_state: string | null;
  to_state: string | null;
  detail: Record<string, string> | null;
};

const ENTITY_LABEL: Record<string, string> = {
  netmetering_application: "Net-metering application",
  work_order: "Work order",
};

export default async function DiscomAuditPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user, divisionIds } = scope;

  // RLS scopes this to the officer's division. audit_log is append-only in
  // the database — see 0023.
  const { data } = await supabase
    .from("audit_log")
    .select("id, occurred_at, actor_user_id, entity_type, entity_id, from_state, to_state, detail")
    .order("occurred_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as AuditRow[];

  return (
    <PanelShell
      scopeNote={`division_ids · ${divisionIds.length} claim${divisionIds.length === 1 ? "" : "s"}`}
      panel="discom"
      email={user.email ?? ""}
      nav={[
        { href: "/discom", label: "Overview" },
        { href: "/discom/connections", label: "Connections" },
        { href: "/discom/losses", label: "AT&C losses" },
        { href: "/discom/netmetering", label: "Net-metering" },
        { href: "/discom/prepaid", label: "Prepaid" },
        { href: "/discom/outages", label: "Outages" },
        { href: "/discom/p2p", label: "P2P market" },
        { href: "/discom/audit", label: "Audit log", active: true },
      ]}
    >
      <h1 className="text-2xl font-semibold mb-1">Audit log</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Every state change on a net-metering application or work order in your division, written by a database trigger
        and append-only — no row here can be edited or deleted, by anyone.
      </p>

      {rows.length === 0 ? (
        <p style={{ color: "var(--color-text-secondary)" }}>
          No recorded state changes yet. Approving or rejecting a net-metering application will appear here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b" style={{ borderColor: "var(--color-border)" }}>
                {["When", "What", "Change", "Note"].map((h) => (
                  <th key={h} className="py-2 pr-4 font-medium" style={{ color: "var(--color-text-secondary)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
                  <td className="py-3 pr-4 tabular whitespace-nowrap" style={{ color: "var(--color-text-secondary)" }}>
                    {new Date(r.occurred_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                  <td className="py-3 pr-4">
                    {ENTITY_LABEL[r.entity_type] ?? r.entity_type}
                    {r.detail?.consumer_number && (
                      <span style={{ color: "var(--color-text-secondary)" }}> · {r.detail.consumer_number}</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 tabular">
                    {r.from_state ? (
                      <>
                        <span style={{ color: "var(--color-text-secondary)" }}>{r.from_state}</span>
                        {" → "}
                        <span className="font-medium">{r.to_state}</span>
                      </>
                    ) : (
                      <span className="font-medium">{r.to_state}</span>
                    )}
                  </td>
                  <td className="py-3" style={{ color: "var(--color-text-secondary)" }}>
                    {r.detail?.decision_notes ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PanelShell>
  );
}
