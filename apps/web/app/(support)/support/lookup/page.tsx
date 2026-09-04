import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { ConsumerLookup } from "@/components/ConsumerLookup";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function SupportLookupPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  return (
    <PanelShell
      panel="support"
      email={user.email ?? ""}
      nav={[
        { href: "/support", label: "Queue" },
        { href: "/support/lookup", label: "Consumer 360", active: true },
        { href: "/support/kb", label: "Knowledge base" },
      ]}
    >
      <h1 className="text-2xl font-semibold mb-1">Consumer 360</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Enough context to route a ticket — connection, meter status, the last three bills, open ticket count. This role has
        no blanket access to billing; the lookup returns exactly this bundle for one consumer number.
      </p>
      <ConsumerLookup />
    </PanelShell>
  );
}
