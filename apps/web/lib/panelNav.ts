// One source of truth for each panel's nav, so a new page is added in one
// place instead of edited into every sibling's hardcoded array. Labels take
// an optional translator (the consumer panel is the i18n'd one, #83); the
// rest pass plain English.

type T = (key: string) => string;

export type NavItem = { href: string; label: string; active?: boolean };

export function consumerNav(active: string, t?: T): NavItem[] {
  const tr = t ?? ((k: string) => DEFAULT[k] ?? k);
  const items: Array<[string, string]> = [
    ["/consumer", "nav.myEnergy"],
    ["/consumer/bills", "nav.bills"],
    ["/consumer/plan", "nav.plan"],
    ["/consumer/analytics", "nav.analytics"],
    ["/consumer/meter-read", "nav.meterRead"],
    ["/consumer/trade", "nav.trade"],
    ["/consumer/ev", "nav.ev"],
    ["/consumer/carbon", "nav.carbon"],
    ["/consumer/notifications", "nav.notifications"],
    ["/consumer/support", "nav.support"],
    ["/consumer/settings", "nav.settings"],
  ];
  return items.map(([href, key]) => ({ href, label: tr(key), active: href === active }));
}

const DEFAULT: Record<string, string> = {
  "nav.myEnergy": "My energy",
  "nav.bills": "Bills",
  "nav.plan": "Plan",
  "nav.analytics": "Analytics",
  "nav.meterRead": "Submit reading",
  "nav.trade": "Solar trading",
  "nav.ev": "EV charging",
  "nav.carbon": "Carbon & solar",
  "nav.notifications": "Notifications",
  "nav.support": "Support",
  "nav.settings": "Settings",
};
