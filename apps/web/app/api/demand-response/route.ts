// Declares a demand response event (#33). RLS (dr_events_discom, 0059)
// confines the insert to the caller's own division regardless of what's
// requested here — division_id is only ever taken from the caller's scope
// claim, never trusted from the request body.
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (
    !scope ||
    !(
      scope.roles.includes("discom_officer") ||
      scope.roles.includes("discom_admin")
    )
  ) {
    return Response.json({ error: "not authorised" }, { status: 403 });
  }
  const divisionId = scope.divisionIds[0];
  if (!divisionId) {
    return Response.json(
      { error: "no division claim on this session" },
      { status: 403 },
    );
  }

  let body: {
    startsAt?: string;
    endsAt?: string;
    targetKwReduction?: number;
    incentivePaisePerKwh?: number;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (
    !body.startsAt ||
    !body.endsAt ||
    !body.targetKwReduction ||
    body.incentivePaisePerKwh == null
  ) {
    return Response.json(
      {
        error:
          "startsAt, endsAt, targetKwReduction and incentivePaisePerKwh are required",
      },
      { status: 400 },
    );
  }
  // The DB only checks ends_at > starts_at, not that starts_at is still in
  // the future — an event created with a past starts_at would insert fine
  // and then get flipped straight to 'completed' by the next sweep tick
  // with zero participants, since the opt-in policy requires starts_at >
  // now(). Catch it here instead of shipping a dead, unusable event.
  if (new Date(body.startsAt).getTime() <= Date.now()) {
    return Response.json(
      { error: "startsAt must be in the future" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("demand_response_events")
    .insert({
      division_id: divisionId,
      starts_at: body.startsAt,
      ends_at: body.endsAt,
      target_kw_reduction: body.targetKwReduction,
      incentive_paise_per_kwh: body.incentivePaisePerKwh,
      created_by_user_id: scope.user.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    return Response.json(
      { error: error?.message ?? "failed to create event" },
      { status: 500 },
    );
  }

  return Response.json({ id: data.id });
}
