import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { KbBrowser, type Article } from "@/components/KbBrowser";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function SupportKbPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  // RLS (0033): a support agent sees every article; other roles only the
  // consumer-facing ones.
  const { data } = await supabase
    .from("kb_articles")
    .select("slug, category, title, body_md, canned_response, audience, usage_count")
    .order("usage_count", { ascending: false });

  return (
    <PanelShell
      panel="support"
      email={user.email ?? ""}
      nav={[
        { href: "/support", label: "Queue" },
        { href: "/support/lookup", label: "Consumer 360" },
        { href: "/support/kb", label: "Knowledge base", active: true },
      ]}
    >
      <h1 className="text-2xl font-semibold mb-1">Knowledge base</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Explainer articles and canned responses. A canned response is a template — the placeholders fill from the
        consumer&apos;s real record when you send it, so a number is never typed by hand.
      </p>
      <KbBrowser articles={(data ?? []) as Article[]} />
    </PanelShell>
  );
}
