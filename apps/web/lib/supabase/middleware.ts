// Session refresh + COARSE role gating only. The database is the real gate
// (RLS, #5) — this exists so a consumer hitting /discom gets a 404 instead
// of an empty dashboard flash. Never treat this as authorization.

import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { scopeFromToken } from "../auth";

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

  // getUser() revalidates against the auth server — do not swap for
  // getSession(), which trusts an unverified cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const gate = ROLE_GATES.find((g) => path.startsWith(g.prefix));

  if (gate) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", path);
      return NextResponse.redirect(url);
    }

    // Scope claims live in the JWT, not the stored user row — see lib/auth.ts.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const { roles } = scopeFromToken(user, session?.access_token);
    const allowed = roles.some((r) => gate.roles.includes(r));
    if (!allowed) {
      // 404, not 403 — don't confirm the panel exists to someone who
      // has no business knowing.
      return NextResponse.rewrite(new URL("/not-found", request.url));
    }
  }

  return response;
}
