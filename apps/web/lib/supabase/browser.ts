// Browser-side Supabase client — Realtime needs a live WebSocket, which
// only exists client-side. Server Components (lib/supabase/server.ts) never
// need this; components using it must be "use client".

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  );
}
