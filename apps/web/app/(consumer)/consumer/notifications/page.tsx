import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { NotificationsPanel } from "@/components/NotificationsPanel";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { consumerNav } from "@/lib/panelNav";
import { getScope } from "@/lib/auth";
import { getLocale, getT } from "@/lib/i18n.server";
import { createClient } from "@/lib/supabase/server";

export default async function ConsumerNotificationsPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;
  const t = await getT();
  const locale = await getLocale();

  // RLS scopes `notifications` to this user's own rows (0014).
  const { data } = await supabase
    .from("notifications")
    .select("id, type, title, body, link, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <PanelShell
      panel="consumer"
      email={user.email ?? ""}
      panelLabel={t("consumer.panelName")}
      signOutLabel={t("nav.signOut")}
      headerExtra={<LocaleSwitcher current={locale} />}
      nav={consumerNav("/consumer/notifications", t)}
    >
      <NotificationsPanel initial={data ?? []} />
    </PanelShell>
  );
}
