import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { NetMeteringDecisionForm } from "@/components/NetMeteringDecisionForm";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Issue #28, closed for real this time — PS1 §7 names net-metering
// approval explicitly as the DISCOM-integration example. Deliberately
// minimal: submitted -> approved/rejected, division-scoped like every
// other DISCOM read in this schema (0004's own pattern).

const STATUS_COLOR: Record<string, string> = {
  submitted: "var(--color-status-warning)",
  under_review: "var(--color-categorical-consumption)",
  approved: "var(--color-status-good)",
  rejected: "var(--color-status-critical)",
};

export default async function NetMeteringPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user, divisionIds } = scope;

  const { data: applications } = await supabase
    .from("netmetering_applications")
    .select("id, capacity_kw, status, applicant_notes, decision_notes, created_at, decided_at, service_connections(consumer_number)")
    .order("created_at", { ascending: false });

  const pendingCount = (applications ?? []).filter((a) => a.status === "submitted" || a.status === "under_review").length;

  return (
    <PanelShell
      scopeNote={`division_ids · ${divisionIds.length} claim${divisionIds.length === 1 ? "" : "s"}`}
      panel="discom"
      email={user.email ?? ""}
      nav={[
        { href: "/discom", label: "Overview" },
        { href: "/discom/connections", label: "Connections" },
        { href: "/discom/losses", label: "AT&C losses" },
        { href: "/discom/netmetering", label: "Net-metering", active: true },
        { href: "/discom/prepaid", label: "Prepaid" },
        { href: "/discom/audit", label: "Audit log" },
      ]}
    >
      <h1 className="text-2xl font-semibold mb-1">Net-metering applications</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Division-scoped, same as every other read here — RLS confines this to Division A regardless of what
        this query asks for.
      </p>

      <div className="mb-6">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
        >
          {pendingCount} pending decision
        </span>
      </div>

      {(applications ?? []).length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          No applications in this division.
        </p>
      ) : (
        <div className="space-y-3">
          {(applications ?? []).map((a) => {
            const sc = a.service_connections as unknown as { consumer_number: string } | null;
            const decided = a.status === "approved" || a.status === "rejected";
            return (
              <div key={a.id} className="rounded-card border card-shadow p-5" style={{ borderColor: "var(--color-border)" }}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="font-medium text-sm tabular mb-0.5">{sc?.consumer_number ?? "—"}</div>
                    <div className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                      {a.capacity_kw} kW rooftop array
                    </div>
                  </div>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium on-accent shrink-0"
                    style={{ background: STATUS_COLOR[a.status] }}
                  >
                    {a.status.replace("_", " ")}
                  </span>
                </div>
                {a.applicant_notes && (
                  <p className="text-sm mb-2" style={{ color: "var(--color-text-secondary)" }}>
                    {a.applicant_notes}
                  </p>
                )}
                {decided ? (
                  <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                    Decided {a.decided_at ? new Date(a.decided_at).toLocaleString("en-IN") : ""}
                    {a.decision_notes ? ` — ${a.decision_notes}` : ""}
                  </p>
                ) : (
                  <NetMeteringDecisionForm applicationId={a.id} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </PanelShell>
  );
}
