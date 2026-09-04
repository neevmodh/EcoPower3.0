"use client";

// The sign-in card. Two columns that share one piece of state — which demo
// role is selected — so picking a role instantly repaints the preview beside
// it. That preview is the point of this screen: it shows the JWT claims the
// access-token hook (#4) will mint and the scope Row-Level Security reads
// from them, so a visitor can see that the confinement is in the database
// and not in this UI.

import { useState, type ReactNode } from "react";
import { PanelIcon, type IconName } from "@/components/Icon";
import { Logo } from "@/components/Logo";

export type DemoRole = {
  id: string;
  email: string;
  label: string;
  accent: string;
  icon: IconName;
  summary: string;
  claims: string;
};

export type LoginStrings = {
  heading: string;
  subheading: string;
  email: string;
  password: string;
  submit: string;
  demoAccounts: string;
  demoHint: string;
  preview: string;
  scope: string;
  rls: string;
};

export function LoginCard({
  roles,
  strings,
  password,
  error,
  signIn,
  localeSwitcher,
}: {
  roles: DemoRole[];
  strings: LoginStrings;
  password: string;
  error?: string;
  signIn: (formData: FormData) => void;
  localeSwitcher: ReactNode;
}) {
  const [selected, setSelected] = useState(roles[0]?.id ?? "");
  const [reveal, setReveal] = useState(false);
  const active = roles.find((r) => r.id === selected) ?? roles[0];

  return (
    <div
      className="relative z-10 w-full max-w-[940px] grid lg:grid-cols-[1.05fr_.95fr] rounded-card overflow-hidden animate-fade-up"
      style={{
        background: "color-mix(in oklab, var(--color-surface-card) 84%, transparent)",
        backdropFilter: "blur(22px)",
        border: "1px solid var(--color-border-strong)",
        boxShadow: "0 40px 120px -40px #000",
      }}
    >
      {/* FORM */}
      <div className="p-9">
        <div className="flex items-center justify-between mb-7">
          <div className="flex items-center gap-2.5">
            <Logo size={24} />
            <span className="font-display font-extrabold text-[15px] tracking-tight">ECOPOWER</span>
          </div>
          {localeSwitcher}
        </div>

        <h1 className="text-[29px] font-bold">{strings.heading}</h1>
        <p className="text-sm mt-1.5" style={{ color: "var(--color-text-secondary)" }}>
          {strings.subheading}
        </p>

        {error && (
          <p
            className="text-sm mt-5 rounded-control p-3 flex items-start gap-2.5"
            style={{
              color: "var(--color-status-critical)",
              border: "1px solid color-mix(in oklab, var(--color-status-critical) 45%, transparent)",
              background: "color-mix(in oklab, var(--color-status-critical) 10%, transparent)",
            }}
          >
            <span style={{ marginTop: 1 }}>
              <PanelIcon name="alert" size={16} />
            </span>
            {error}
          </p>
        )}

        <form action={signIn} className="mt-6">
          <label className="eyebrow block mb-2" htmlFor="email">
            {strings.email}
          </label>
          <input id="email" name="email" type="email" required autoComplete="email" className="field mb-4" />

          <label className="eyebrow block mb-2" htmlFor="password">
            {strings.password}
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={reveal ? "text" : "password"}
              required
              autoComplete="current-password"
              className="field"
              style={{ paddingRight: 44 }}
            />
            <button
              type="button"
              onClick={() => setReveal((r) => !r)}
              aria-label={reveal ? "Hide password" : "Show password"}
              className="absolute right-1.5 top-1.5 w-8 h-8 grid place-items-center rounded-control"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              <PanelIcon name={reveal ? "eyeOff" : "eye"} size={16} />
            </button>
          </div>

          <button type="submit" className="btn btn-primary w-full mt-6 h-11">
            {strings.submit}
            <PanelIcon name="arrowRight" size={16} />
          </button>
        </form>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
          <span className="eyebrow">{strings.demoAccounts}</span>
          <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
        </div>

        <p className="text-xs mb-3" style={{ color: "var(--color-text-secondary)" }}>
          {strings.demoHint}
        </p>

        {/* Each card is its own form posting the demo credentials to the same
            server action — one click, no password to type, and no second auth
            path that could diverge from the real one. Selecting a card also
            drives the preview, so a visitor can look before they sign in. */}
        <div className="grid grid-cols-2 gap-2">
          {roles.map((r) => {
            const on = r.id === selected;
            return (
              <form key={r.id} action={signIn} onMouseEnter={() => setSelected(r.id)} onFocus={() => setSelected(r.id)}>
                <input type="hidden" name="email" value={r.email} />
                <input type="hidden" name="password" value={password} />
                <button
                  type="submit"
                  onClick={() => setSelected(r.id)}
                  className="w-full flex items-center gap-2.5 rounded-control border px-3 py-2 text-left transition-all duration-state"
                  style={{
                    borderColor: on ? r.accent : "var(--color-border)",
                    background: on ? "color-mix(in oklab, var(--color-text-primary) 4%, transparent)" : "var(--color-surface-sunken)",
                    boxShadow: on ? `0 0 0 1px ${r.accent}, 0 8px 26px -16px ${r.accent}` : "none",
                  }}
                >
                  <span
                    className="inline-flex items-center justify-center rounded-control shrink-0"
                    style={{ width: 26, height: 26, background: "color-mix(in oklab, var(--color-text-primary) 6%, transparent)", color: r.accent }}
                  >
                    <PanelIcon name={r.icon} size={14} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-semibold">{r.label}</span>
                    <span className="block mono text-[9.5px] truncate" style={{ color: "var(--color-text-tertiary)" }}>
                      {r.email}
                    </span>
                  </span>
                </button>
              </form>
            );
          })}
        </div>
      </div>

      {/* SESSION PREVIEW */}
      <div
        className="p-9 border-l hidden lg:block"
        style={{
          borderColor: "var(--color-border)",
          background: "linear-gradient(160deg, color-mix(in oklab, var(--color-text-primary) 3%, transparent), transparent 60%)",
        }}
      >
        <div className="flex items-center justify-between">
          <span className="eyebrow">{strings.preview}</span>
          <span className="mono text-[10.5px] flex items-center gap-2" style={{ color: active?.accent }}>
            <span
              style={{ width: 6, height: 6, borderRadius: "50%", background: active?.accent, boxShadow: `0 0 9px ${active?.accent}` }}
            />
            {active?.label}
          </span>
        </div>

        <h2 className="text-[22px] mt-4 font-bold" style={{ color: active?.accent }}>
          {active?.label}
        </h2>
        <p className="text-[13px] mt-2" style={{ color: "var(--color-text-secondary)", textWrap: "pretty" }}>
          {active?.summary}
        </p>

        <div className="mt-7">
          <span className="eyebrow">{strings.scope}</span>
          <div
            className="mt-2.5 p-3.5 rounded-control border"
            style={{ background: "var(--color-surface-sunken)", borderColor: "var(--color-border)" }}
          >
            <pre className="mono text-[11px] leading-relaxed m-0 whitespace-pre-wrap" style={{ color: "var(--color-text-secondary)" }}>
              {active?.claims}
            </pre>
          </div>
          <p className="text-[11px] mt-2.5" style={{ color: "var(--color-text-tertiary)", textWrap: "pretty" }}>
            {strings.rls}
          </p>
        </div>
      </div>
    </div>
  );
}
