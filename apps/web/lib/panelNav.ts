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
    ["/consumer/demand-response", "nav.demandResponse"],
    ["/consumer/carbon", "nav.carbon"],
    ["/consumer/notifications", "nav.notifications"],
    ["/consumer/support", "nav.support"],
    ["/consumer/settings", "nav.settings"],
  ];
  return items.map(([href, key]) => ({
    href,
    label: tr(key),
    active: href === active,
  }));
}

export function discomNav(active: string): NavItem[] {
  const items: Array<[string, string]> = [
    ["/discom", "Overview"],
    ["/discom/connections", "Connections"],
    ["/discom/losses", "AT&C losses"],
    ["/discom/netmetering", "Net-metering"],
    ["/discom/demand-response", "Demand response"],
    ["/discom/prepaid", "Prepaid"],
    ["/discom/outages", "Outages"],
    ["/discom/p2p", "P2P market"],
    ["/discom/audit", "Audit log"],
  ];
  return items.map(([href, label]) => ({
    href,
    label,
    active: href === active,
  }));
}

export function adminNav(active: string): NavItem[] {
  const items: Array<[string, string]> = [
    ["/admin", "Overview"],
    ["/admin/consumers", "Consumers"],
    ["/admin/tenants", "Tenants"],
    ["/admin/users", "Users & roles"],
    ["/admin/billing", "Billing"],
    ["/admin/payments", "Payment reconciliation"],
    ["/admin/analytics", "Analytics"],
    ["/admin/tickets", "Tickets"],
  ];
  return items.map(([href, label]) => ({
    href,
    label,
    active: href === active,
  }));
}

const DEFAULT: Record<string, string> = {
  "nav.myEnergy": "My energy",
  "nav.bills": "Bills",
  "nav.plan": "Plan",
  "nav.analytics": "Analytics",
  "nav.meterRead": "Submit reading",
  "nav.trade": "Solar trading",
  "nav.ev": "EV charging",
  "nav.demandResponse": "Demand response",
  "nav.carbon": "Carbon & solar",
  "nav.notifications": "Notifications",
  "nav.support": "Support",
  "nav.settings": "Settings",
};
