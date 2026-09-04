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
//
// This project's tokens are ES256 (asymmetric), so getClaims() verifies the
// JWT signature locally against the project JWKS — a fetch that is cached, not
// a round trip per request the way getUser() is. That authenticity check is
// what getUser() also does; the claims it returns are the same verified
// payload the custom access-token hook (#4) wrote the scope into. On a legacy
// HS256 project getClaims() falls back to a getUser() call, so this stays
// correct either way.
export async function getScope(supabase: SupabaseClient): Promise<Scope | null> {
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims as Record<string, unknown> | undefined;
  if (error || !claims || typeof claims.sub !== "string") return null;

  const appMetadata = (claims.app_metadata ?? {}) as Record<string, unknown>;
  const user = {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
    app_metadata: appMetadata,
    user_metadata: (claims.user_metadata ?? {}) as Record<string, unknown>,
    aud: typeof claims.aud === "string" ? claims.aud : "authenticated",
    created_at: "",
  } as unknown as User;

  return {
    user,
    roles: stringArray(appMetadata.roles),
    orgIds: stringArray(appMetadata.org_ids),
    divisionIds: stringArray(appMetadata.division_ids),
  };
}
