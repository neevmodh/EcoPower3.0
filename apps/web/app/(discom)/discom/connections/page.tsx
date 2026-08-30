import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function DiscomConnectionsPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  const { data: connections } = await supabase
    .from("service_connections")
    .select("id, consumer_number, tariff_category, connection_type, phase, sanctioned_load_kw, connected_load_kw, distribution_transformers(name)")
    .order("consumer_number");

  const { data: metersData } = await supabase.from("meters").select("service_connection_id, status");
  const meterStatusByConnection = new Map((metersData ?? []).map((m) => [m.service_connection_id, m.status]));

  return (
    <PanelShell
      panel="discom"
      email={user.email ?? ""}
      nav={[
        { href: "/discom", label: "Overview" },
        { href: "/discom/connections", label: "Connections", active: true },
        { href: "/discom/losses", label: "AT&C losses" },
      ]}
    >
      <h1 className="text-2xl font-semibold mb-1">Service connections</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        {(connections ?? []).length} connections in your division.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--color-border)" }}>
              <th className="py-2 pr-4 font-medium" style={{ color: "var(--color-text-secondary)" }}>Consumer</th>
              <th className="py-2 pr-4 font-medium" style={{ color: "var(--color-text-secondary)" }}>DT</th>
              <th className="py-2 pr-4 font-medium" style={{ color: "var(--color-text-secondary)" }}>Tariff</th>
              <th className="py-2 pr-4 font-medium" style={{ color: "var(--color-text-secondary)" }}>Type</th>
              <th className="py-2 pr-4 font-medium text-right" style={{ color: "var(--color-text-secondary)" }}>Sanctioned</th>
              <th className="py-2 font-medium" style={{ color: "var(--color-text-secondary)" }}>Meter</th>
            </tr>
          </thead>
          <tbody>
            {(connections ?? []).map((c) => {
              const dt = c.distribution_transformers as unknown as { name: string } | null;
              const meterStatus = meterStatusByConnection.get(c.id);
              return (
                <tr key={c.id} className="border-b last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
                  <td className="py-2.5 pr-4 tabular font-medium">{c.consumer_number}</td>
                  <td className="py-2.5 pr-4" style={{ color: "var(--color-text-secondary)" }}>{dt?.name ?? "—"}</td>
                  <td className="py-2.5 pr-4">{c.tariff_category}</td>
                  <td className="py-2.5 pr-4" style={{ color: "var(--color-text-secondary)" }}>{c.connection_type} · {c.phase}</td>
                  <td className="py-2.5 pr-4 text-right tabular">{c.sanctioned_load_kw != null ? `${c.sanctioned_load_kw} kW` : "—"}</td>
                  <td className="py-2.5">
                    {meterStatus ? (
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-medium"
                        style={{ color: meterStatus === "active" ? "var(--color-status-good)" : "var(--color-status-serious)" }}
                      >
                        <span
                          className="inline-block rounded-full"
                          style={{ width: 6, height: 6, background: meterStatus === "active" ? "var(--color-status-good)" : "var(--color-status-serious)" }}
                        />
                        {meterStatus}
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>no meter</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {(connections ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center" style={{ color: "var(--color-text-secondary)" }}>
                  No connections in your division.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </PanelShell>
  );
}
