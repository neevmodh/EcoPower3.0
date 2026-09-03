#!/usr/bin/env node
// #9 — fail CI if a server-only secret reaches the client bundle.
//
// Runs after `next build`. Scans apps/web/.next/static (everything shipped
// to the browser) for:
//   1. the literal values of known server-only env vars, if they're set
//      in this environment (the real test — catches an accidental
//      NEXT_PUBLIC_ rename or a secret inlined into a client component)
//   2. structural fingerprints of secrets even when the value isn't in env
//      (service_role JWTs, Razorpay secret keys)
//
// Exit non-zero on any hit. No output on success beyond a one-line OK.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const STATIC_DIR = join(process.cwd(), "apps/web/.next/static");

// Server-only env vars whose values must never appear client-side.
const SECRET_ENV_VARS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "GEMINI_API_KEY",
];

// Structural patterns — a secret's shape, not its value.
const SECRET_PATTERNS = [
  { name: "service_role JWT", re: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]*(?:cm9sZQ|role)[A-Za-z0-9_-]*service_role/i },
  { name: "supabase service_role claim", re: /"role"\s*:\s*"service_role"/ },
  { name: "Razorpay live secret", re: /rzp_live_[A-Za-z0-9]{10,}/ },
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(js|mjs|cjs|json|txt|map)$/.test(entry)) out.push(p);
  }
  return out;
}

let files;
try {
  files = walk(STATIC_DIR);
} catch {
  console.error(`check_client_bundle: ${STATIC_DIR} not found — run \`pnpm build\` first.`);
  process.exit(2);
}

const envSecrets = SECRET_ENV_VARS
  .map((name) => ({ name, value: process.env[name] }))
  .filter((s) => s.value && s.value.length >= 12);

const hits = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const { name, value } of envSecrets) {
    if (text.includes(value)) hits.push(`${file}: contains the value of ${name}`);
  }
  for (const { name, re } of SECRET_PATTERNS) {
    if (re.test(text)) hits.push(`${file}: matches ${name}`);
  }
}

if (hits.length > 0) {
  console.error("check_client_bundle: SECRET LEAKED INTO CLIENT BUNDLE\n");
  for (const h of hits) console.error(`  ✗ ${h}`);
  console.error(`\n${hits.length} finding(s). A server-only secret is shipped to the browser — do not deploy.`);
  process.exit(1);
}

console.log(`check_client_bundle: OK — scanned ${files.length} client files, no secrets found.`);
