import { redirect } from "next/navigation";
import Link from "next/link";
import { PanelShell } from "@/components/PanelShell";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { consumerNav } from "@/lib/panelNav";
import { getScope } from "@/lib/auth";
import { getLocale, getT } from "@/lib/i18n.server";
import { createClient } from "@/lib/supabase/server";

function Row({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-start justify-between py-3 border-b last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
      <div>
        <div className="text-sm">{label}</div>
        {hint && (
          <div className="text-xs mt-0.5" style={{ color: "var(--color-text-tertiary)" }}>
            {hint}
          </div>
        )}
      </div>
      <div className="text-sm mono text-right" style={{ color: "var(--color-text-secondary)" }}>
        {value}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-card border card-shadow p-5"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
    >
      <div className="eyebrow mb-3">{title}</div>
      {children}
    </div>
  );
}

export default async function ConsumerSettingsPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;
  const t = await getT();
  const locale = await getLocale();

  const { data: profile } = await supabase.from("profiles").select("full_name, phone, created_at").eq("id", user.id).maybeSingle();

  const { data: connections } = await supabase
    .from("service_connections")
    .select("consumer_number, tariff_category, connection_type, phase, sanctioned_load_kw")
    .order("consumer_number");

  const prepaidConn = (connections ?? []).find((c) => c.connection_type === "prepaid");
  const { data: prepaid } = prepaidConn
    ? await supabase
        .from("prepaid_accounts")
        .select("balance_paise, low_balance_threshold_paise, vend_rate_paise_per_kwh, disconnect_pending")
        .maybeSingle()
    : { data: null };

  return (
    <PanelShell
      panel="consumer"
      email={user.email ?? ""}
      panelLabel={t("consumer.panelName")}
      signOutLabel={t("nav.signOut")}
      headerExtra={<LocaleSwitcher current={locale} />}
      nav={consumerNav("/consumer/settings", t)}
    >
      <h1 className="text-2xl font-semibold mb-6">Settings</h1>

      <div className="grid gap-5 max-w-3xl" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <Section title="Profile">
          <Row label="Name" value={profile?.full_name ?? "—"} />
          <Row label="Email" value={user.email ?? "—"} />
          <Row label="Mobile" value={profile?.phone ?? "—"} hint="Used for OTP and outage SMS" />
          <Row
            label="Member since"
            value={profile?.created_at ? new Date(profile.created_at).toLocaleDateString("en-GB") : "—"}
          />
        </Section>

        <Section title="Language">
          <p className="text-sm mb-3" style={{ color: "var(--color-text-secondary)" }}>
            The consumer panel is translated end to end. Your choice is remembered in this browser.
          </p>
          <LocaleSwitcher current={locale} />
        </Section>

        <Section title="Connections">
          {(connections ?? []).length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              No connection linked yet.
            </p>
          ) : (
            (connections ?? []).map((c) => (
              <Row
                key={c.consumer_number}
                label={c.consumer_number}
                hint={`${c.tariff_category} · ${c.phase}-phase`}
                value={
                  <>
                    {c.connection_type}
                    {c.sanctioned_load_kw != null && <> · {c.sanctioned_load_kw} kW</>}
                  </>
                }
              />
            ))
          )}
        </Section>

        <Section title="Billing &amp; autopay">
          <Row label="Billing mode" value={prepaidConn ? "Prepaid" : "Postpaid"} />
          {prepaid && (
            <>
              <Row label="Balance" value={`₹${(Number(prepaid.balance_paise) / 100).toFixed(2)}`} />
              <Row label="Vend rate" value={`₹${(Number(prepaid.vend_rate_paise_per_kwh) / 100).toFixed(2)}/kWh`} />
              <Row
                label="Low-balance alert at"
                value={`₹${(Number(prepaid.low_balance_threshold_paise) / 100).toFixed(0)}`}
              />
              {prepaid.disconnect_pending && (
                <Row label="Status" value={<span style={{ color: "var(--color-status-serious)" }}>Disconnect pending</span>} />
              )}
            </>
          )}
          <Row
            label="Manage plan"
            value={
              <Link href="/consumer/plan" style={{ color: "var(--color-categorical-third)" }}>
                Open plan
              </Link>
            }
          />
        </Section>

        <Section title="Your data">
          <p className="text-sm mb-3" style={{ color: "var(--color-text-secondary)" }}>
            Your bills and usage are exportable from the pages they live on — see the “Table view” and CSV buttons on Bills
            and Analytics.
          </p>
          <Row
            label="Close account"
            hint="Ends the subscription; contact support to start"
            value={
              <Link href="/consumer/support" style={{ color: "var(--color-status-serious)" }}>
                Contact support
              </Link>
            }
          />
        </Section>
      </div>
    </PanelShell>
  );
}
