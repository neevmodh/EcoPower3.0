// Dependency-free i18n (#83) — shared, framework-free half. The server-only
// helpers that read the NEXT_LOCALE cookie live in i18n.server.ts so that
// client components (LocaleSwitcher) can import LOCALES / labels without
// dragging next/headers into the client bundle.

export const LOCALES = ["en", "hi", "gu"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  hi: "हिन्दी",
  gu: "ગુજરાતી",
};

export function isLocale(v: string | undefined): v is Locale {
  return v != null && (LOCALES as readonly string[]).includes(v);
}
