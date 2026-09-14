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
      .select("division_id")
      .eq("id", eventId)
      .single();
    if (eventError || !event) {
      return Response.json({ error: "event not found" }, { status: 404 });
    }
    // A consumer with connections in more than one division must have a
    // connection matching THIS event's division picked, not an arbitrary
    // one of theirs — otherwise the insert below fails the RLS division
    // check with an opaque 500 for no reason visible to the caller.
    // owner_user_id is explicit here rather than relying solely on
    // service_connections' own SELECT policies: a caller who also holds a
    // broader-visibility role (discom_officer, a society role) could
    // otherwise have this pick a real connection that isn't theirs.
    const { data: connection } = await supabase
      .from("service_connections")
      .select("id")
      .eq("division_id", event.division_id)
      .eq("owner_user_id", userData.user.id)
      .limit(1)
      .maybeSingle();
    if (!connection) {
      return Response.json(
        { error: "no service connection of yours is in this event's division" },
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
