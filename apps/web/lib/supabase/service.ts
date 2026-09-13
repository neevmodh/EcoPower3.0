// service_role client — bypasses RLS entirely. Only for routes that have no
// user session to scope against (Razorpay's webhook) or that re-apply a
// terminal state transition the write guards deliberately reject from an
// authenticated session (admin reconciliation, #41). Never import this into
// anything reachable from a plain authenticated request without its own
// authorization check first.
import { createClient } from "@supabase/supabase-js";

export function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
}
