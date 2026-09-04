// Session refresh + COARSE role gating only. The database is the real gate
// (RLS, #5) — this exists so a consumer hitting /discom gets a 404 instead
// of an empty dashboard flash. Never treat this as authorization.

import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";


type CookieToSet = { name: string; value: string; options?: CookieOptions };

// Route prefix -> roles allowed to see it at all.
const ROLE_GATES: Array<{ prefix: string; roles: string[] }> = [
  { prefix: "/consumer", roles: ["consumer"] },
  { prefix: "/society", roles: ["society_admin", "society_member"] },
  { prefix: "/discom", roles: ["discom_officer", "discom_admin"] },
  { prefix: "/operator", roles: ["resco_admin", "resco_ops"] },
  { prefix: "/field", roles: ["field_technician"] },
  { prefix: "/support", roles: ["support_agent"] },
];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getClaims() verifies the JWT signature (locally for this project's ES256
  // tokens; a getUser() fetch as a fallback on legacy HS256) and hands back
  // the verified payload — the scope claims and all. One call instead of the
  // old getUser() + getSession() pair. Do not swap for getSession() alone,
  // which trusts an unverified cookie.
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as Record<string, unknown> | undefined;
  const authed = typeof claims?.sub === "string";

  const path = request.nextUrl.pathname;
  const gate = ROLE_GATES.find((g) => path.startsWith(g.prefix));

  if (gate) {
    if (!authed) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", path);
      return NextResponse.redirect(url);
    }

    const appMetadata = (claims?.app_metadata ?? {}) as Record<string, unknown>;
    const roles = Array.isArray(appMetadata.roles)
      ? (appMetadata.roles as unknown[]).filter((r): r is string => typeof r === "string")
      : [];
    const allowed = roles.some((r) => gate.roles.includes(r));
    if (!allowed) {
      // 404, not 403 — don't confirm the panel exists to someone who
      // has no business knowing.
      return NextResponse.rewrite(new URL("/not-found", request.url));
    }
  }

  return response;
}
