import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { AdminUsers } from "@/components/AdminUsers";
import { adminNav } from "@/lib/panelNav";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  const [{ data: users }, { data: orgs }, { data: divisions }] = await Promise.all([
    supabase.rpc("admin_list_users"),
    supabase.from("orgs").select("id, name, type").order("name"),
    supabase.from("discom_divisions").select("id, name").order("name"),
  ]);

  return (
    <PanelShell panel="admin" email={user.email ?? ""} nav={adminNav("/admin/users")}>
      <h1 className="text-2xl font-semibold mb-1">Users &amp; roles</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Grant or revoke a role for any user, optionally scoped to an org or division. Every grant is written to{" "}
        <span className="mono">user_roles</span>; the JWT claims — and therefore Row-Level Security — pick it up on the
        user&apos;s next sign-in.
      </p>
      <AdminUsers
        users={(users ?? []) as never}
        orgs={(orgs ?? []) as never}
        divisions={(divisions ?? []) as never}
      />
    </PanelShell>
  );
}
