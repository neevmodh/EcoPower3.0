import { redirect } from "next/navigation";
import { getScope, scopeFromToken } from "@/lib/auth";
import { getLocale, getT } from "@/lib/i18n.server";
import { landingFor } from "@/lib/landing";
import { createClient } from "@/lib/supabase/server";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { LoginCard, type DemoRole } from "@/components/login/LoginCard";

const DEMO_PASSWORD = "EcoPower!2026";

// What each role's session actually resolves to. The `claims` strings are not
// marketing copy — they are the shape of the JWT the custom access-token hook
// (#4) mints for that account, which is what Row-Level Security reads in the
// database. Showing it on the sign-in screen is the argument: the confinement
// is in Postgres, not in this UI.
const ROLES: Array<Omit<DemoRole, "label"> & { labelKey: string }> = [
  {
    id: "consumer",
    email: "consumer@ecopower.demo",
    accent: "var(--color-categorical-third)",
    icon: "home",
    labelKey: "login.role.consumer",
    summary: "Your own connection and your own register reads. Nothing else exists for this session.",
    claims: 'roles        ["consumer"]\nconnections  owner_user_id = you\ndivisions    —',
  },
  {
    id: "society",
    email: "society@ecopower.demo",
    accent: "#b394ff",
    icon: "building",
    labelKey: "login.role.society",
    summary: "Sunrise Residency: six units on one society main meter, with an editable cost allocation.",
    claims: 'roles        ["society_admin"]\nsociety_org  Sunrise Residency\nunits        6',
  },
  {
    id: "discom",
    email: "discom@ecopower.demo",
    accent: "var(--color-categorical-consumption)",
    icon: "grid",
    labelKey: "login.role.discom",
    summary: "Division A only. Query anything you like — the database returns nothing from Division B.",
    claims: 'roles        ["discom_officer"]\ndivision_ids ["Division A"]\norg_ids      ["Torrent · AHD"]',
  },
  {
    id: "operator",
    email: "operator@ecopower.demo",
    accent: "#8fa0b4",
    icon: "gauge",
    labelKey: "login.role.operator",
    summary: "RESCO-owned assets across every division served — scoped by ownership, not by grid topology.",
    claims: 'roles        ["resco_ops"]\nresco_org_id RESCO Gujarat\nassets       owned only',
  },
  {
    id: "field",
    email: "field@ecopower.demo",
    accent: "var(--color-categorical-generation)",
    icon: "pin",
    labelKey: "login.role.field",
    summary: "The work orders assigned to you, plus the ones nobody has claimed yet.",
    claims: 'roles        ["field_technician"]\nassigned_to  you, or unclaimed\nwrites       status transitions',
  },
  {
    id: "support",
    email: "support@ecopower.demo",
    accent: "#4fd6c4",
    icon: "chat",
    labelKey: "login.role.support",
    summary: "Every open ticket, with the consumer's real bill and meter history attached.",
    claims: 'roles        ["support_agent"]\nscope        all tickets\nbilling      read-only',
  },
  {
    id: "admin",
    email: "admin@ecopower.demo",
    accent: "#e0533a",
    icon: "shield",
    labelKey: "login.role.admin",
    summary: "The platform operator. Every tenant, every meter, every rupee — the one session RLS does not confine.",
    claims: 'roles        ["platform_admin"]\ndivision_ids —\norg_ids      —  (full cross-tenant)',
  },
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

  const roles: DemoRole[] = ROLES.map(({ labelKey, ...rest }) => ({ ...rest, label: t(labelKey) }));

  return (
    <main
      className="min-h-screen relative flex items-center justify-center p-10 overflow-hidden"
      style={{ background: "var(--color-surface)" }}
    >
      <div
        className="grid-backdrop"
        style={{
          WebkitMaskImage: "radial-gradient(ellipse 70% 70% at 50% 45%, #000 10%, transparent 72%)",
          maskImage: "radial-gradient(ellipse 70% 70% at 50% 45%, #000 10%, transparent 72%)",
        }}
      />
      <div className="aurora" style={{ inset: "-25%", height: "auto", opacity: 0.5 }} />

      {/* The grid this product meters, drawn as the backdrop it is. Purely
          decorative — it carries no figures, so there is nothing here that can
          outlive its data. */}
      <svg
        viewBox="0 0 1400 800"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full"
        style={{ opacity: 0.45 }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="login-feed" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--color-categorical-consumption)" stopOpacity="0" />
            <stop offset="50%" stopColor="var(--color-categorical-third)" />
            <stop offset="100%" stopColor="var(--color-categorical-consumption)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="flow-line" d="M-20 160 H320 V330 H540" stroke="url(#login-feed)" strokeWidth="1.6" fill="none" />
        <path
          className="flow-line"
          d="M1420 210 H1080 V420 H900"
          stroke="url(#login-feed)"
          strokeWidth="1.6"
          fill="none"
          style={{ animationDelay: "500ms" }}
        />
        <path
          className="flow-line"
          d="M-20 640 H260 V500 H520"
          stroke="url(#login-feed)"
          strokeWidth="1.6"
          fill="none"
          style={{ animationDelay: "900ms" }}
        />
        <path
          className="flow-line"
          d="M1420 690 H1000 V560"
          stroke="url(#login-feed)"
          strokeWidth="1.6"
          fill="none"
          style={{ animationDelay: "1300ms" }}
        />
        <circle cx="320" cy="160" r="4" fill="var(--color-categorical-consumption)" />
        <circle cx="1080" cy="210" r="4" fill="var(--color-categorical-consumption)" />
        <circle cx="260" cy="640" r="4" fill="var(--color-categorical-third)" />
        <circle cx="1000" cy="690" r="4" fill="var(--color-categorical-third)" />
      </svg>

      <LoginCard
        roles={roles}
        password={DEMO_PASSWORD}
        error={params.error}
        signIn={signIn}
        localeSwitcher={<LocaleSwitcher current={locale} />}
        strings={{
          heading: t("login.heading"),
          subheading: t("login.subheading"),
          email: t("login.email"),
          password: t("login.password"),
          submit: t("login.submit"),
          demoAccounts: t("login.demoAccounts"),
          demoHint: t("login.demoHint"),
          preview: t("login.preview"),
          scope: t("login.scope"),
          rls: t("login.rls"),
        }}
      />
    </main>
  );
}
