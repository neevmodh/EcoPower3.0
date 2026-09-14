// Consumer opt-in into a demand response event (#33). RLS
// (dr_participations_consumer_insert, 0059) confines this to the caller's
// own service_connection regardless of what's requested — serviceConnectionId
// still has to belong to them or the insert is rejected, this route just
// picks a sensible default (their first connection) so the client doesn't
// have to know its id.
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
    const { data: connection } = await supabase
      .from("service_connections")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (!connection) {
      return Response.json(
        { error: "no service connection on this account" },
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
