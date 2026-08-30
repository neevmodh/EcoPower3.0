// Device push-token registration for the mobile app (#43/#45).
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const { token } = (await request.json()) as { token?: string };
  if (!token) return Response.json({ error: "token required" }, { status: 400 });

  // Persistence lands with the device_tokens table in #43.
  return Response.json({ registered: true });
}
