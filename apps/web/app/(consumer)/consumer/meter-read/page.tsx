import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { SelfReadForm } from "@/components/SelfReadForm";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { consumerNav } from "@/lib/panelNav";
import { getScope } from "@/lib/auth";
import { getLocale, getT } from "@/lib/i18n.server";
import { createClient } from "@/lib/supabase/server";

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  pending: { text: "Pending review", color: "var(--color-status-warning)" },
  accepted: { text: "Accepted", color: "var(--color-status-good)" },
  rejected: { text: "Rejected", color: "var(--color-status-serious)" },
};

export default async function ConsumerMeterReadPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;
  const t = await getT();
  const locale = await getLocale();

  const { data: connections } = await supabase.from("service_connections").select("id, consumer_number");
  const connection = connections?.[0];
  const { data: meter } = connection
    ? await supabase.from("meters").select("id").eq("service_connection_id", connection.id).limit(1).maybeSingle()
    : { data: null };

  const { data: lastReading } = meter
    ? await supabase
        .from("meter_readings")
        .select("kwh_import, reading_ts")
        .eq("meter_id", meter.id)
        .not("kwh_import", "is", null)
        .order("reading_ts", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const { data: submissions } = connection
    ? await supabase
        .from("self_read_submissions")
        .select("id, reading_kwh, submitted_at, status, review_note")
        .order("submitted_at", { ascending: false })
        .limit(20)
    : { data: [] };

  const prev =
    lastReading?.kwh_import != null
      ? { kwh: Number(lastReading.kwh_import), ts: lastReading.reading_ts as string }
      : null;

  return (
    <PanelShell
      panel="consumer"
      email={user.email ?? ""}
      panelLabel={t("consumer.panelName")}
      signOutLabel={t("nav.signOut")}
      headerExtra={<LocaleSwitcher current={locale} />}
      nav={consumerNav("/consumer/meter-read", t)}
    >
      <h1 className="text-2xl font-semibold mb-1">Submit a meter reading</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        For connections without an automatic meter link — photograph the meter and enter the reading. It goes to a review
        queue, not straight to your bill.
      </p>

      {!meter ? (
        <p style={{ color: "var(--color-text-secondary)" }}>No meter linked to this account.</p>
      ) : (
        <div className="grid gap-8" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          <SelfReadForm
            meterId={meter.id}
            serviceConnectionId={connection?.id ?? ""}
            userId={user.id}
            prev={prev}
          />

          <div>
            <h2 className="text-base font-semibold mb-3">Your submissions</h2>
            {(submissions ?? []).length === 0 ? (
              <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                None yet.
              </p>
            ) : (
              <div
                className="rounded-card border card-shadow divide-y"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
              >
                {(submissions ?? []).map((s) => {
                  const st = STATUS_LABEL[s.status] ?? STATUS_LABEL.pending;
                  return (
                    <div key={s.id} className="p-4" style={{ borderColor: "var(--color-border)" }}>
                      <div className="flex items-center justify-between">
                        <span className="mono text-sm">{Number(s.reading_kwh).toLocaleString("en-IN")} kWh</span>
                        <span className="text-xs font-medium" style={{ color: st.color }}>
                          {st.text}
                        </span>
                      </div>
                      <div className="mono text-[11px] mt-1" style={{ color: "var(--color-text-tertiary)" }} suppressHydrationWarning>
                        {new Date(s.submitted_at).toLocaleString("en-GB")}
                      </div>
                      {s.review_note && (
                        <div className="text-xs mt-1.5" style={{ color: "var(--color-text-secondary)" }}>
                          {s.review_note}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </PanelShell>
  );
}
