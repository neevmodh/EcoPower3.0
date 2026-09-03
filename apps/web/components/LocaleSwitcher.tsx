"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LOCALE_LABEL, LOCALES, type Locale } from "@/lib/i18n";

// Sets the NEXT_LOCALE cookie and refreshes so the server components
// re-render in the chosen language. No route prefix, no reload flash.
export function LocaleSwitcher({ current }: { current: Locale }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function set(locale: Locale) {
    document.cookie = `NEXT_LOCALE=${locale};path=/;max-age=31536000;samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <div className="inline-flex items-center gap-1 text-xs" style={{ opacity: pending ? 0.6 : 1 }}>
      {LOCALES.map((l, i) => (
        <span key={l} className="flex items-center gap-1">
          {i > 0 && <span style={{ color: "var(--color-border)" }}>·</span>}
          <button
            type="button"
            onClick={() => set(l)}
            className="transition-colors duration-state"
            style={{
              color: l === current ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              fontWeight: l === current ? 600 : 400,
            }}
            aria-current={l === current ? "true" : undefined}
          >
            {LOCALE_LABEL[l]}
          </button>
        </span>
      ))}
    </div>
  );
}
