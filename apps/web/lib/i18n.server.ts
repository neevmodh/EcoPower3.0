// Server-only i18n helpers (#83). Reads the NEXT_LOCALE cookie; loads the
// JSON dictionaries. Any key missing from hi/gu falls back to en, so a
// partial translation degrades gracefully instead of showing a blank.

import { cookies } from "next/headers"; // importing next/headers is itself the server-only guard
import en from "@/messages/en.json";
import gu from "@/messages/gu.json";
import hi from "@/messages/hi.json";
import { type Locale, isLocale } from "./i18n";

const DICTS: Record<Locale, Record<string, string>> = {
  en: en as Record<string, string>,
  hi: hi as Record<string, string>,
  gu: gu as Record<string, string>,
};

export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get("NEXT_LOCALE")?.value;
  return isLocale(c) ? c : "en";
}

/** Returns a `t` bound to the active locale. `t("key")` → the string with
 *  en fallback; `{name}` placeholders are filled from `params`. */
export async function getT(): Promise<(key: string, params?: Record<string, string | number>) => string> {
  const dict = DICTS[await getLocale()];
  return (key, params) => {
    let s = dict[key] ?? (DICTS.en[key] as string | undefined) ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
    return s;
  };
}
