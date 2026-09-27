import { DemandResponseEventForm } from "@/components/DemandResponseEventForm";
import { PanelShell } from "@/components/PanelShell";
import { getScope } from "@/lib/auth";
import { discomNav } from "@/lib/panelNav";
import { createClient } from "@/lib/supabase/server";
import { formatInrFromPaise } from "@ecopower/shared";
import { redirect } from "next/navigation";

// Issue #33 — meter-verified, not a button. Settlement (baseline, achieved
// reduction, incentive) is computed by sweep_demand_response_events() (0059)
// once an event ends; this page only ever displays what that sweep wrote,
// never a self-reported number.

const STATUS_COLOR: Record<string, string> = {
  scheduled: "var(--color-categorical-consumption)",
  active: "var(--color-status-warning)",
  completed: "var(--color-status-good)",
  cancelled: "var(--color-text-tertiary)",
};

type EventRow = {
  id: string;
  event_type: string;
  starts_at: string;
  ends_at: string;
  target_kw_reduction: number;
  incentive_paise_per_kwh: number;
  status: string;
  feeder_id: string | null;
};

type ParticipationRow = {
  event_id: string;
  opted_in: boolean;
  achieved_reduction_kwh: number | null;
  incentive_paise: number | null;
  verified_by_meter: boolean;
};

export default async function DemandResponsePage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user, divisionIds } = scope;

  const [{ data: eventsRaw }, { data: feedersRaw }] = await Promise.all([
    supabase
      .from("demand_response_events")
      .select(
        "id, event_type, starts_at, ends_at, target_kw_reduction, incentive_paise_per_kwh, status, feeder_id",
      )
      .order("starts_at", { ascending: false }),
    // feeders_division_scope (0004) already confines this to the caller's
    // own division — no explicit filter needed.
    supabase.from("feeders").select("id, name").order("name"),
  ]);
  const events = (eventsRaw ?? []) as EventRow[];
  const feeders = (feedersRaw ?? []) as { id: string; name: string }[];
  const feederNameById = new Map(feeders.map((f) => [f.id, f.name]));

  const eventIds = events.map((e) => e.id);
  const { data: participationsRaw } = eventIds.length
    ? await supabase
        .from("dr_participations")
        .select(
          "event_id, opted_in, achieved_reduction_kwh, incentive_paise, verified_by_meter",
        )
        .in("event_id", eventIds)
    : { data: [] as never[] };
  const participations = (participationsRaw ?? []) as ParticipationRow[];

  const byEvent = new Map<string, ParticipationRow[]>();
  for (const p of participations) {
    if (!byEvent.has(p.event_id)) byEvent.set(p.event_id, []);
    byEvent.get(p.event_id)?.push(p);
  }

  return (
    <PanelShell
      scopeNote={`division_ids · ${divisionIds.length} claim${divisionIds.length === 1 ? "" : "s"}`}
      panel="discom"
      email={user.email ?? ""}
      nav={discomNav("/discom/demand-response")}
    >
      <h1 className="text-2xl font-semibold mb-1">Demand response</h1>
      <p
        className="text-sm mb-6"
        style={{ color: "var(--color-text-secondary)" }}
      >
        Declare a peak event; opted-in consumers get a baseline computed from
        their own historical load shape, and achieved reduction is measured from
        their real meter reads once the event ends — never self-reported.
      </p>

      <DemandResponseEventForm feeders={feeders} />

      {events.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          No demand response events in this division yet.
        </p>
      ) : (
        <div className="space-y-3">
          {events.map((e) => {
            const parts = byEvent.get(e.id) ?? [];
            const optedIn = parts.filter((p) => p.opted_in);
            // The sweep only ever sets achieved_reduction_kwh alongside
            // verified_by_meter=true, together, in its one "real data"
            // branch — a settled-but-unverified row can't exist, so this is
            // one set, not two.
            const verified = optedIn.filter(
              (p) => p.achieved_reduction_kwh != null,
            );
            const totalReductionKwh = verified.reduce(
              (s, p) => s + Number(p.achieved_reduction_kwh ?? 0),
              0,
            );
            const totalIncentivePaise = verified.reduce(
              (s, p) => s + Number(p.incentive_paise ?? 0),
              0,
            );
            return (
              <div
                key={e.id}
                className="rounded-card border card-shadow p-5"
                style={{ borderColor: "var(--color-border)" }}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="font-medium text-sm">
                      {e.event_type.replace("_", " ")}
                    </div>
                    <div
                      className="text-xs"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {new Date(e.starts_at).toLocaleString("en-IN")} –{" "}
                      {new Date(e.ends_at).toLocaleString("en-IN")}
                    </div>
                  </div>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium on-accent shrink-0"
                    style={{ background: STATUS_COLOR[e.status] }}
                  >
                    {e.status}
                  </span>
                </div>
                <p
                  className="text-xs mb-2"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  Target {e.target_kw_reduction} kW ·{" "}
                  {formatInrFromPaise(BigInt(e.incentive_paise_per_kwh))}/kWh
                  incentive · {optedIn.length} opted in ·{" "}
                  {e.feeder_id
                    ? (feederNameById.get(e.feeder_id) ?? "feeder")
                    : "division-wide"}
                </p>
                {e.status === "completed" && (
                  <p
                    className="text-sm"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {verified.length}/{optedIn.length} settled with real meter
                    data — <strong>{totalReductionKwh.toFixed(2)} kWh</strong>{" "}
                    achieved reduction,{" "}
                    <strong>
                      {formatInrFromPaise(
                        BigInt(Math.round(totalIncentivePaise)),
                      )}
                    </strong>{" "}
                    credited.
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
