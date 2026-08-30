import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Server Component. Reads Supabase with the anon key + the user's session
// cookie — no service_role, no ?role=. This query has no WHERE clause on
// division: RLS (#5) is what makes it return only this officer's division.
export default async function DiscomPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user, divisionIds } = scope;

  const { data: connections } = await supabase
    .from("service_connections")
    .select("consumer_number, tariff_category, sanctioned_load_kw, division_id")
    .order("consumer_number");

  return (
    <PanelShell
      panel="discom"
      email={user.email ?? ""}
      nav={[
        { href: "/discom", label: "Overview", active: true },
        { href: "/discom/connections", label: "Connections" },
        { href: "/discom/losses", label: "AT&C losses" },
      ]}
    >
      <h1 className="text-2xl font-semibold mb-2">Division overview</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        {connections?.length ?? 0} service connections visible · scope claim covers{" "}
        {divisionIds.length} division{divisionIds.length === 1 ? "" : "s"}. This list is
        unfiltered — the database returns only what RLS permits.
      </p>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr style={{ color: "var(--color-text-secondary)" }} className="text-left">
            <th className="py-2 font-medium">Consumer number</th>
            <th className="py-2 font-medium">Tariff</th>
            <th className="py-2 font-medium text-right">Sanctioned load</th>
          </tr>
        </thead>
        <tbody>
          {(connections ?? []).map((c) => (
            <tr key={c.consumer_number} className="border-t" style={{ borderColor: "var(--color-border)" }}>
              <td className="py-2 tabular">{c.consumer_number}</td>
              <td className="py-2">{c.tariff_category}</td>
              <td className="py-2 text-right tabular">
                {c.sanctioned_load_kw != null ? `${c.sanctioned_load_kw} kW` : "—"}
              </td>
            </tr>
          ))}
          {(connections ?? []).length === 0 && (
            <tr>
              <td colSpan={3} className="py-6 text-center" style={{ color: "var(--color-text-secondary)" }}>
                No connections in your division.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </PanelShell>
  );
}
