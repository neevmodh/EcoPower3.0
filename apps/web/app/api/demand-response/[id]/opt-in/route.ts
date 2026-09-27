// Consumer opt-in into a demand response event (#33). RLS
// (dr_participations_consumer_insert, 0059) confines this to the caller's
// own service_connection regardless of what's requested — serviceConnectionId
// still has to belong to them, be in the event's own division, and the
// event still has to be scheduled and not yet started, or the insert is
// rejected. This route only picks a sensible default (a connection of
// theirs in the event's division) so the client doesn't have to know a
// connection id, since DemandResponseOptInButton never sends one.
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: eventId } = await params;

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }

  let body: { serviceConnectionId?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  let serviceConnectionId = body.serviceConnectionId;
  if (!serviceConnectionId) {
    const { data: event, error: eventError } = await supabase
      .from("demand_response_events")
      .select("division_id, feeder_id")
      .eq("id", eventId)
      .single();
    if (eventError || !event) {
      return Response.json({ error: "event not found" }, { status: 404 });
    }
    // A consumer with connections in more than one division must have a
    // connection matching THIS event's division picked, not an arbitrary
    // one of theirs — otherwise the insert below fails the RLS division
    // check with an opaque 500 for no reason visible to the caller. Same
    // reasoning extends to feeder_id (0060): a feeder-targeted event needs
    // a connection whose distribution_transformers.feeder_id actually
    // matches, or the insert fails the RLS feeder check just as opaquely.
    // owner_user_id is explicit here rather than relying solely on
    // service_connections' own SELECT policies: a caller who also holds a
    // broader-visibility role (discom_officer, a society role) could
    // otherwise have this pick a real connection that isn't theirs.
    const { data: candidates } = await supabase
      .from("service_connections")
      .select("id, dt_id")
      .eq("division_id", event.division_id)
      .eq("owner_user_id", userData.user.id);

    let connection: { id: string; dt_id: string } | null =
      (candidates ?? [])[0] ?? null;
    if (event.feeder_id && candidates?.length) {
      const dtIds = [...new Set(candidates.map((c) => c.dt_id))];
      const { data: dts } = await supabase
        .from("distribution_transformers")
        .select("id, feeder_id")
        .in("id", dtIds);
      const feederByDt = new Map((dts ?? []).map((d) => [d.id, d.feeder_id]));
      connection =
        candidates.find((c) => feederByDt.get(c.dt_id) === event.feeder_id) ??
        null;
    }
    if (!connection) {
      return Response.json(
        {
          error: event.feeder_id
            ? "no service connection of yours is on this event's targeted feeder"
            : "no service connection of yours is in this event's division",
        },
        { status: 404 },
      );
    }
    serviceConnectionId = connection.id;
  }

  const { error: insertError } = await supabase
    .from("dr_participations")
    .insert({
      event_id: eventId,
      service_connection_id: serviceConnectionId,
    });
  if (insertError) {
    // unique_violation — already opted in. Idempotent, not an error.
    if (insertError.code === "23505") {
      return Response.json({ ok: true, alreadyOptedIn: true });
    }
    return Response.json({ error: insertError.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
