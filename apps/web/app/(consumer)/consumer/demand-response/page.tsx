import { DemandResponseOptInButton } from "@/components/DemandResponseOptInButton";
import { PanelShell } from "@/components/PanelShell";
import { getScope } from "@/lib/auth";
import { getT } from "@/lib/i18n.server";
import { consumerNav } from "@/lib/panelNav";
import { createClient } from "@/lib/supabase/server";
import { formatInrFromPaise } from "@ecopower/shared";
import { redirect } from "next/navigation";

// Issue #33 — opt into a DISCOM-declared peak event; the credit shown here
// is only ever what sweep_demand_response_events() (0059) measured from a
// real meter read after the event ended, never a number this page computed
// itself.

type EventRow = {
  id: string;
  event_type: string;
  starts_at: string;
  ends_at: string;
  target_kw_reduction: number;
  incentive_paise_per_kwh: number;
  status: string;
};

type ParticipationRow = {
  event_id: string;
  achieved_reduction_kwh: number | null;
  incentive_paise: number | null;
  verified_by_meter: boolean;
};

export default async function ConsumerDemandResponsePage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;
  const t = await getT();

  const [{ data: eventsRaw }, { data: myParticipationsRaw }] =
    await Promise.all([
      supabase
        .from("demand_response_events")
        .select(
          "id, event_type, starts_at, ends_at, target_kw_reduction, incentive_paise_per_kwh, status",
        )
        .order("starts_at", { ascending: false }),
      supabase
        .from("dr_participations")
        .select(
          "event_id, achieved_reduction_kwh, incentive_paise, verified_by_meter",
        ),
    ]);
  const events = (eventsRaw ?? []) as EventRow[];
  const myParticipationByEvent = new Map<string, ParticipationRow>();
  for (const p of (myParticipationsRaw ?? []) as ParticipationRow[]) {
    myParticipationByEvent.set(p.event_id, p);
  }

  return (
    <PanelShell
      panel="consumer"
      email={user.email ?? ""}
      nav={consumerNav("/consumer/demand-response", t)}
    >
      <h1 className="text-2xl font-semibold mb-1">Demand response</h1>
      <p
        className="text-sm mb-6"
        style={{ color: "var(--color-text-secondary)" }}
      >
        Opt into a peak event before it starts. Your reduction is measured
        against your own recent usage from your real meter reads — never
        something you report yourself.
      </p>

      {events.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          No demand response events right now.
        </p>
      ) : (
        <div className="space-y-3">
          {events.map((e) => {
            const mine = myParticipationByEvent.get(e.id);
            const canOptIn =
              e.status === "scheduled" &&
              new Date(e.starts_at).getTime() > Date.now();
            return (
              <div
                key={e.id}
                className="rounded-card border card-shadow p-5"
                style={{ borderColor: "var(--color-border)" }}
              >
                <div className="font-medium text-sm mb-1">
                  {e.event_type.replace("_", " ")}
                </div>
                <div
                  className="text-xs mb-2"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {new Date(e.starts_at).toLocaleString("en-IN")} –{" "}
                  {new Date(e.ends_at).toLocaleString("en-IN")} ·{" "}
                  {formatInrFromPaise(BigInt(e.incentive_paise_per_kwh))}/kWh
                  reduced
                </div>
                {mine ? (
                  mine.achieved_reduction_kwh != null ? (
                    <p
                      className="text-sm"
                      style={{ color: "var(--color-status-good)" }}
                    >
                      You reduced{" "}
                      {Number(mine.achieved_reduction_kwh).toFixed(2)} kWh —
                      earned{" "}
                      {formatInrFromPaise(
                        BigInt(Math.round(Number(mine.incentive_paise ?? 0))),
                      )}
                      {mine.verified_by_meter ? " (meter-verified)" : ""}
                    </p>
                  ) : (
                    <p
                      className="text-xs"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      You&apos;re opted in
                      {e.status === "completed"
                        ? " — not enough meter data to settle yet"
                        : ""}
                      .
                    </p>
                  )
                ) : canOptIn ? (
                  <DemandResponseOptInButton eventId={e.id} />
                ) : (
                  <p
                    className="text-xs"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    {e.status === "cancelled"
                      ? "Event cancelled."
                      : "Opt-in window closed."}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PanelShell>
  );
}
