import type { Session } from "@supabase/supabase-js";

// Same shape as apps/web/lib/landing.ts, trimmed to the two personas this
// binary actually ships (#43): field technician, or everything else lands
// on the consumer/society-member home. A discom/resco/admin account
// authenticating here has no mobile home yet — that's a real product
// decision (build it, or block it explicitly), not something to paper
// over with a guess.
export function rolesFromSession(session: Session | null): string[] {
  const roles = session?.user.app_metadata?.roles;
  return Array.isArray(roles)
    ? roles.filter((r): r is string => typeof r === "string")
    : [];
}

export function personaFor(roles: string[]): "field" | "consumer" {
  return roles.includes("field_technician") ? "field" : "consumer";
}
