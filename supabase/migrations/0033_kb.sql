-- 0033_kb.sql
-- Support knowledge base: explainer articles and canned responses, so an
-- agent answers a billing-provenance question the same way every time and a
-- consumer-facing article can be linked into a reply. Placeholders in a
-- canned response are filled from the consumer's real record at send time —
-- the agent never types a number by hand.

create table kb_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  category text not null,
  title text not null,
  body_md text not null,
  -- a canned reply template; {placeholders} resolve against the consumer 360
  -- bundle (0030) client-side. null for pure explainer articles.
  canned_response text,
  audience text not null default 'agent' check (audience in ('agent', 'consumer', 'both')),
  usage_count integer not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index kb_articles_category_idx on kb_articles (category, title);

create function kb_touch(p_slug text) returns void
  language sql
  security definer
  set search_path = public
as $$
  update kb_articles set usage_count = usage_count + 1 where slug = p_slug;
$$;

revoke all on function kb_touch(text) from public, anon;
grant execute on function kb_touch(text) to authenticated;

alter table kb_articles enable row level security;
-- Consumer-facing articles are readable by any authenticated user; agent
-- material only by support agents.
create policy kb_articles_consumer_read on kb_articles
  for select to authenticated
  using ( audience in ('consumer', 'both') or has_role('support_agent') );

-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------
insert into kb_articles (slug, category, title, audience, body_md, canned_response) values
  (
    'cycle-shift-higher-bill', 'Billing & provenance',
    'Why a bill can be higher with lower usage (cycle shift)', 'both',
    'When a billing cycle is realigned — usually once, after a meter comms gap — that cycle covers more days than the usual ~29. More billed days at the same or lower daily rate produces a higher total even though consumption fell. The provenance trace shows the opening and closing register reads and the exact day count.',
    'Hi {first_name}, I''ve checked {consumer_no}. Your {month} cycle billed {days} days vs the usual 29 — a one-time shift after a brief meter comms gap. Your actual daily use was {trend}. The extra amount is from days, not higher consumption. I''ve attached the provenance trace and applied a {credit} adjustment.'
  ),
  (
    'reading-provenance', 'Billing & provenance',
    'Reading a provenance trace: the two register reads behind a line', 'both',
    'Every energy line on an EcoPower invoice can be expanded to the two cumulative-register reads that bracket it — the opening read at the start of the period and the closing read at the end. The billed units are the difference. If either read is estimated (VEE), the line is labelled and the trace says which read and why.',
    null
  ),
  (
    'vee-estimated', 'Billing & provenance',
    'What "estimated (VEE)" means on a reading', 'both',
    'VEE — Validation, Estimation and Editing — is the process of filling a gap in the meter data stream (a comms outage, a swapped meter) with a modelled value derived from the consumer''s own recent pattern. An estimated reading is always labelled, and is trued up against the next real read so no energy is lost or double-counted.',
    null
  ),
  (
    'net-metering-credit', 'Net-metering',
    'How the net-metering credit paise figure is calculated', 'both',
    'Exported units are credited at the applicable net-metering rate for the period, applied to the metered export for that billing cycle. The credit appears as a negative line on the invoice and traces to the export register the same way an import line traces to the import register.',
    null
  ),
  (
    'prepaid-burn-rate', 'Prepaid & recharge',
    'Why a prepaid balance can drop faster than expected', 'both',
    'The vend rate is a flat per-kWh price, so the balance falls in proportion to consumption — a hot week with heavy cooling load drains it quicker. The app shows an estimated days-remaining figure from the last seven days'' average; a sudden change in usage moves that estimate.',
    null
  ),
  (
    'disconnect-grace', 'Prepaid & recharge',
    'Prepaid disconnection: the mandated grace period', 'agent',
    'When a prepaid balance reaches zero and autopay has failed, supply is NOT cut immediately. A three-day grace period runs, during which an SMS and an IVR call are sent. Disconnection only happens after the grace period ends and a supervisor confirms. The prepaid watch list surfaces accounts in grace so a human sees it coming.',
    null
  ),
  (
    'soiling-alert', 'Solar & performance',
    'What a soiling alert means and what happens next', 'both',
    'A soiling alert fires when the measured performance ratio stays a few percent below the clear-sky expectation for several days — usually dust on the panels. A cleaning visit is queued automatically; the consumer does not need to do anything. Generation recovers after the clean.',
    null
  ),
  (
    'add-occupant', 'App & account',
    'Adding a second occupant with view-only access', 'agent',
    'A consumer can add a co-tenant from Settings → Language & access. The co-tenant completes KYC and gets a view-only role — they see the dashboard and bills but cannot change the plan, autopay or account details. Remove is one click.',
    'Hi {first_name}, a co-occupant can be added from Settings in the app — they''ll verify KYC and get view-only access (dashboard and bills, no account changes). Happy to walk you through it.'
  );
