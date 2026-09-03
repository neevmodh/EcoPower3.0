import { redirect } from "next/navigation";
import { getScope, scopeFromToken } from "@/lib/auth";
import { getLocale, getT } from "@/lib/i18n.server";
import { landingFor } from "@/lib/landing";
import { createClient } from "@/lib/supabase/server";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { Logo } from "@/components/Logo";

const DEMO_PASSWORD = "EcoPower!2026";

const DEMO_ACCOUNTS = [
  { key: "login.role.consumer", email: "consumer@ecopower.demo", accent: "var(--color-categorical-third)", icon: "🏠" },
  { key: "login.role.society", email: "society@ecopower.demo", accent: "#7c5cd6", icon: "🏢" },
  { key: "login.role.discom", email: "discom@ecopower.demo", accent: "var(--color-categorical-consumption)", icon: "⚡" },
  { key: "login.role.operator", email: "operator@ecopower.demo", accent: "#5c6470", icon: "🛠️" },
  { key: "login.role.field", email: "field@ecopower.demo", accent: "var(--color-categorical-generation)", icon: "📶" },
  { key: "login.role.support", email: "support@ecopower.demo", accent: "#0d9488", icon: "🎧" },
];

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

  const t = await getT();
  const locale = await getLocale();

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
    <main className="min-h-screen flex" style={{ background: "var(--color-surface)" }}>
      {/* Brand panel — hidden on small screens, sets the tone on desktop. */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, var(--color-categorical-third) 0%, #0f8a5c 100%)",
        }}
      >
        <div className="flex items-center gap-2.5 text-white text-xl font-semibold tracking-tight">
          <Logo size={32} />
          EcoPower
        </div>

        <div className="text-white">
          <h1 className="text-4xl font-semibold leading-tight mb-4">{t("login.tagline.title")}</h1>
          <p className="text-lg opacity-90 max-w-md">{t("login.tagline.body")}</p>
        </div>

        <div className="text-white/70 text-sm">Ahmedabad · INSTINCT 4.0</div>

        {/* Decorative, purely visual — a soft radial glow, no data implied. */}
        <div
          aria-hidden="true"
          className="absolute -right-24 -bottom-24 rounded-full"
          style={{ width: 420, height: 420, background: "rgba(255,255,255,0.08)" }}
        />
        <div
          aria-hidden="true"
          className="absolute -left-16 top-1/3 rounded-full"
          style={{ width: 200, height: 200, background: "rgba(255,255,255,0.06)" }}
        />
      </div>

      {/* Sign-in panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="flex justify-end mb-4">
            <LocaleSwitcher current={locale} />
          </div>
          <h2 className="text-2xl font-semibold mb-1">{t("login.heading")}</h2>
          <p className="text-sm mb-8" style={{ color: "var(--color-text-secondary)" }}>
            {t("login.subheading")}
          </p>

          {params.error && (
            <p
              className="text-sm mb-4 rounded-control p-3"
              style={{ color: "var(--color-status-critical)", border: "1px solid var(--color-status-critical)" }}
            >
              {params.error}
            </p>
          )}

          <form action={signIn}>
            <label className="block text-sm mb-1" htmlFor="email">
              {t("login.email")}
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
              {t("login.password")}
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
              className="w-full rounded-control py-2 text-sm font-medium transition-colors duration-state"
              style={{ background: "var(--color-categorical-third)", color: "#fff" }}
            >
              {t("login.submit")}
            </button>
          </form>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
            <span className="text-xs uppercase tracking-wide" style={{ color: "var(--color-text-secondary)" }}>
              {t("login.demoAccounts")}
            </span>
            <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
          </div>

          <p className="text-xs mb-3" style={{ color: "var(--color-text-secondary)" }}>
            {t("login.demoHint")}
          </p>

          <div className="grid grid-cols-1 gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <form key={account.email} action={signIn}>
                <input type="hidden" name="email" value={account.email} />
                <input type="hidden" name="password" value={DEMO_PASSWORD} />
                <button
                  type="submit"
                  className="w-full flex items-center gap-3 rounded-control border px-3 py-2 text-sm text-left transition-colors duration-state hover:opacity-80"
                  style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
                >
                  <span
                    className="inline-flex items-center justify-center rounded-full shrink-0"
                    style={{ width: 28, height: 28, background: account.accent, fontSize: 14 }}
                  >
                    {account.icon}
                  </span>
                  <span className="flex-1">
                    <span className="block font-medium">{t(account.key)}</span>
                    <span className="block text-xs tabular" style={{ color: "var(--color-text-secondary)" }}>
                      {account.email}
                    </span>
                  </span>
                  <span aria-hidden="true" style={{ color: "var(--color-text-secondary)" }}>
                    →
                  </span>
                </button>
              </form>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
