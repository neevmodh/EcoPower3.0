"use client";

// User & role administration (migration 0038). Grant a role to a user
// (optionally scoped to an org / division), or revoke an active grant. Both
// go through the guarded admin_grant_role / admin_revoke_role RPCs.

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { PanelIcon } from "./Icon";

type Grant = { id: string; role: string; org_id: string | null; division_id: string | null; granted_at: string };
type User = { user_id: string; email: string; created_at: string; grants: Grant[] };

const ROLES = [
  "consumer",
  "society_admin",
  "society_member",
  "discom_officer",
  "discom_admin",
  "resco_admin",
  "resco_ops",
  "field_technician",
  "support_agent",
  "platform_admin",
];

export function AdminUsers({
  users,
  orgs,
  divisions,
}: {
  users: User[];
  orgs: Array<{ id: string; name: string; type: string }>;
  divisions: Array<{ id: string; name: string }>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [grantFor, setGrantFor] = useState<string | null>(null);
  const [role, setRole] = useState("consumer");
  const [orgId, setOrgId] = useState("");
  const [divId, setDivId] = useState("");

  const reload = () => window.location.reload();

  async function grant(userId: string) {
    setBusy(userId);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.rpc("admin_grant_role", {
      p_user_id: userId,
      p_role: role,
      p_org_id: orgId || null,
      p_division_id: divId || null,
    });
    if (err) {
      setError(err.message);
      setBusy(null);
      return;
    }
    reload();
  }

  async function revoke(grantId: string) {
    setBusy(grantId);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.rpc("admin_revoke_role", { p_user_role_id: grantId });
    if (err) {
      setError(err.message);
      setBusy(null);
      return;
    }
    reload();
  }

  const input = "rounded-control border px-2.5 py-1 text-xs";
  const inputStyle = { borderColor: "var(--color-border)", background: "var(--color-surface-sunken)" } as const;

  return (
    <div>
      {error && (
        <p className="text-sm mb-4" style={{ color: "var(--color-status-critical)" }}>
          {error}
        </p>
      )}
      <div className="space-y-2">
        {users.map((u) => (
          <div
            key={u.user_id}
            className="rounded-card border card-shadow p-4"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="text-sm font-medium">{u.email}</span>
                <span className="mono text-[10px] ml-2" style={{ color: "var(--color-text-tertiary)" }} suppressHydrationWarning>
                  joined {new Date(u.created_at).toLocaleDateString("en-GB")}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setGrantFor(grantFor === u.user_id ? null : u.user_id)}
                className="rounded-control border px-2.5 py-1 text-xs font-semibold"
                style={{ borderColor: "var(--color-border)" }}
              >
                {grantFor === u.user_id ? "Cancel" : "Grant role"}
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mt-2.5">
              {u.grants.length === 0 && (
                <span className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
                  no active roles
                </span>
              )}
              {u.grants.map((g) => (
                <span
                  key={g.id}
                  className="mono text-[11px] rounded-full pl-2.5 pr-1 py-0.5 inline-flex items-center gap-1.5"
                  style={{ background: "var(--color-surface-sunken)", color: "var(--color-text-secondary)" }}
                >
                  {g.role}
                  {(g.org_id || g.division_id) && <span style={{ color: "var(--color-text-tertiary)" }}>· scoped</span>}
                  <button
                    type="button"
                    onClick={() => revoke(g.id)}
                    disabled={busy === g.id}
                    aria-label={`Revoke ${g.role}`}
                    className="inline-flex items-center justify-center rounded-full w-4 h-4 disabled:opacity-40"
                    style={{ color: "var(--color-status-serious)" }}
                  >
                    <PanelIcon name="alert" size={10} />
                  </button>
                </span>
              ))}
            </div>

            {grantFor === u.user_id && (
              <div className="flex flex-wrap items-end gap-2 mt-3 pt-3 border-t" style={{ borderColor: "var(--color-border)" }}>
                <select value={role} onChange={(e) => setRole(e.target.value)} className={input} style={inputStyle}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className={input} style={inputStyle}>
                  <option value="">no org</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} ({o.type})
                    </option>
                  ))}
                </select>
                <select value={divId} onChange={(e) => setDivId(e.target.value)} className={input} style={inputStyle}>
                  <option value="">no division</option>
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => grant(u.user_id)}
                  disabled={busy === u.user_id}
                  className="rounded-control px-3 py-1 text-xs font-semibold on-accent disabled:opacity-50"
                  style={{ background: "var(--color-categorical-third)" }}
                >
                  Grant
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
