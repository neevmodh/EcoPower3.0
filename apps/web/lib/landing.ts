// Where each role lands after sign-in. First match wins, so a user with
// several roles gets the most operational panel.
const LANDING: Array<{ role: string; path: string }> = [
  { role: "discom_admin", path: "/discom" },
  { role: "discom_officer", path: "/discom" },
  { role: "resco_admin", path: "/operator" },
  { role: "resco_ops", path: "/operator" },
  { role: "support_agent", path: "/support" },
  { role: "field_technician", path: "/field" },
  { role: "society_admin", path: "/society" },
  { role: "society_member", path: "/society" },
  { role: "consumer", path: "/consumer" },
];

export function landingFor(roles: string[]): string {
  return LANDING.find((l) => roles.includes(l.role))?.path ?? "/consumer";
}
