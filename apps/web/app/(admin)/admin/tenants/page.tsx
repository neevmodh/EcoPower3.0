import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { adminNav } from "@/lib/panelNav";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AdminTenantsPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  const [{ data: orgs }, { data: divisions }, { data: utilities }] = await Promise.all([
    supabase.from("orgs").select("id, name, type, created_at, utility_id").order("type").order("name"),
    supabase.from("discom_divisions").select("id, name, level, circle_city, discom_org_id").order("name"),
    supabase.from("utilities").select("id, code, name, role, ownership, headquarters, service_districts").order("role").order("code"),
  ]);

  const divByOrg = new Map<string, Array<{ name: string; level: string; circle_city: string | null }>>();
  for (const d of divisions ?? []) {
    const list = divByOrg.get(d.discom_org_id) ?? [];
    list.push(d);
    divByOrg.set(d.discom_org_id, list);
  }
  const utilByCode = new Map((utilities ?? []).map((u) => [u.id, u.code]));

  return (
    <PanelShell panel="admin" email={user.email ?? ""} nav={adminNav("/admin/tenants")}>
      <h1 className="text-2xl font-semibold mb-1">Tenants</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Every org on the platform and its divisions, plus the Gujarat utilities reference set they map to.
      </p>

      <h2 className="text-base font-semibold mb-3">Organisations</h2>
      <div className="space-y-3 mb-10">
        {(orgs ?? []).map((o) => (
          <div
            key={o.id}
            className="rounded-card border card-shadow p-4"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
          >
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium">{o.name}</span>
              <span className="mono text-[11px] rounded-full px-2 py-0.5" style={{ background: "var(--color-surface-sunken)", color: "var(--color-text-secondary)" }}>
                {o.type}
              </span>
              {o.utility_id && utilByCode.get(o.utility_id) && (
                <span className="mono text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                  → {utilByCode.get(o.utility_id)}
                </span>
              )}
            </div>
            {(divByOrg.get(o.id) ?? []).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2.5">
                {(divByOrg.get(o.id) ?? []).map((d) => (
                  <span key={d.name} className="mono text-[11px] rounded-control border px-2 py-0.5" style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
                    {d.name} {d.circle_city ? `· ${d.circle_city}` : ""}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <h2 className="text-base font-semibold mb-3">Gujarat utilities</h2>
      <div className="rounded-card border card-shadow overflow-x-auto" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--color-border)" }}>
              <th className="p-3 font-medium text-xs" style={{ color: "var(--color-text-secondary)" }}>Code</th>
              <th className="p-3 font-medium text-xs" style={{ color: "var(--color-text-secondary)" }}>Name</th>
              <th className="p-3 font-medium text-xs" style={{ color: "var(--color-text-secondary)" }}>Role · ownership</th>
              <th className="p-3 font-medium text-xs" style={{ color: "var(--color-text-secondary)" }}>HQ</th>
              <th className="p-3 font-medium text-xs" style={{ color: "var(--color-text-secondary)" }}>Districts</th>
            </tr>
          </thead>
          <tbody>
            {(utilities ?? []).map((u) => (
              <tr key={u.id} className="border-b last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
                <td className="p-3 mono">{u.code}</td>
                <td className="p-3">{u.name}</td>
                <td className="p-3" style={{ color: "var(--color-text-secondary)" }}>{u.role} · {u.ownership}</td>
                <td className="p-3 mono" style={{ color: "var(--color-text-secondary)" }}>{u.headquarters ?? "—"}</td>
                <td className="p-3 text-xs" style={{ color: "var(--color-text-tertiary)" }}>
                  {(u.service_districts ?? []).slice(0, 4).join(", ")}
                  {(u.service_districts ?? []).length > 4 ? ` +${(u.service_districts ?? []).length - 4}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PanelShell>
  );
}
