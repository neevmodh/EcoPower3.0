// Reading scope claims correctly is subtle, so it lives in one place.
//
// getUser() revalidates the token against the auth server — that is the
// authenticity check and must not be skipped. But it returns the *stored*
// user row, whose app_metadata is only { provider, providers }. The scope
// claims injected by the custom access token hook (#4) exist only in the
// JWT. So: authenticate with getUser(), then read claims from the access
// token, which getUser() has already proven valid.

import type { SupabaseClient, User } from "@supabase/supabase-js";

export type Scope = {
  user: User;
  roles: string[];
  orgIds: string[];
  divisionIds: string[];
};

export function decodeClaims(accessToken: string): Record<string, unknown> {
  const payload = accessToken.split(".")[1];
  if (!payload) return {};
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  try {
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return {};
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export function scopeFromToken(user: User, accessToken: string | undefined): Scope {
  const claims = accessToken ? decodeClaims(accessToken) : {};
  const appMetadata = (claims.app_metadata ?? {}) as Record<string, unknown>;
  return {
    user,
    roles: stringArray(appMetadata.roles),
    orgIds: stringArray(appMetadata.org_ids),
    divisionIds: stringArray(appMetadata.division_ids),
  };
}

// Returns null when unauthenticated. Callers redirect.
export async function getScope(supabase: SupabaseClient): Promise<Scope | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  return scopeFromToken(user, session?.access_token);
}
