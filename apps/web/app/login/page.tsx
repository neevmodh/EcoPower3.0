import { redirect } from "next/navigation";
import { getScope, scopeFromToken } from "@/lib/auth";
import { landingFor } from "@/lib/landing";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const scope = await getScope(supabase);

  if (scope) {
    redirect(landingFor(scope.roles));
  }

  async function signIn(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    const client = await createClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });

    if (error || !data.user) {
      redirect(`/login?error=${encodeURIComponent(error?.message ?? "sign-in failed")}`);
    }

    // Roles come from the freshly-issued token's claims, not data.user.
    const { roles } = scopeFromToken(data.user, data.session?.access_token);
    redirect(landingFor(roles));
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form
        action={signIn}
        className="w-full max-w-sm rounded-card border p-6"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
      >
        <h1 className="text-xl font-semibold mb-6">Sign in to EcoPower</h1>

        {params.error && (
          <p
            className="text-sm mb-4 rounded-control p-3"
            style={{ color: "var(--color-status-critical)", border: "1px solid var(--color-status-critical)" }}
          >
            {params.error}
          </p>
        )}

        <label className="block text-sm mb-1" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-control border px-3 py-2 mb-4 bg-transparent"
          style={{ borderColor: "var(--color-border)" }}
        />

        <label className="block text-sm mb-1" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-control border px-3 py-2 mb-6 bg-transparent"
          style={{ borderColor: "var(--color-border)" }}
        />

        <button
          type="submit"
          className="w-full rounded-control py-2 text-sm font-medium"
          style={{ background: "var(--color-categorical-consumption)", color: "#fff" }}
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
