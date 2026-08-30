# PS1 re-prioritization plan

**Update (2026-08-30, later same day):** tightened further — PS1 gets
finished *completely* before anything else starts, not just reordered ahead
of it. Sprint 4 (DISCOM), Sprint 5 (OCR onboarding — that's PS4, not PS1),
and Sprint 6 (mobile) do not start until every box in §0 below is checked.
UI polish happens alongside each PS1 feature as it's built, not as a
separate pass at the end.

## 0. PS1 completion checklist

| Requirement | Status |
|---|---|
| Web app | ✅ Done |
| IoT/smart meter real-time | ✅ Done (Sprint 2) |
| Scalable architecture (RLS + partitioning) | ✅ Done |
| Billing & payments | ✅ Done (Sprint 3 — #19-21, #76, #39) |
| Subscription plans | ✅ Done (Sprint 3.5 — #77, #78 trimmed) |
| Alerts & notifications | ⬜ Sprint 3.5 (#86) |
| Fault/support tickets | ⬜ Sprint 3.5 (#87) |
| Carbon/ESG (optional) | ⬜ Sprint 3.5 (#80), lowest priority in this batch |
| Mobile app | ⬜ Deferred until the above is done — see §4 |
| DISCOM integration | Deferred — PS1's own text says this can be mocked |

Nothing outside this table gets worked until it's all checked off.

**Why this exists:** the current BUILD-ORDER sequences security/correctness foundations (M0, AMI spine) before the consumer-facing loop PS1 actually grades. Two PS1-named things — subscription plan management (#77, #78) and multi-channel alerts (#81) — are currently in **Sprint 9, "Tier C, cut without guilt"**, the lowest-priority tier in the whole plan. A support/ticketing module, which PS1 explicitly names as a required desired outcome ("Service/support module"), **doesn't exist as an issue at all**. This plan pulls PS1's specific asks forward and adds what's missing, without discarding the work already done.

**What's preserved as-is:** M0 (auth, RLS, design system, web shell — all done) and the Sprint 2 AMI work already in flight (#10, #11, #14, #16 done). This is real, load-bearing, and directly serves PS1's "IoT/smart meter integration" and "scalable architecture" requirements — it stays.

**What changes:** the order everything after Sprint 2 gets built in, plus two new issues.

---

## 1. PS1 requirement → coverage map

| PS1 requirement | Current issue(s) | Current sprint | Proposed sprint |
|---|---|---|---|
| Web app | #8 | M0 (**done**) | — |
| Mobile app | #43 (Expo) | Sprint 6 | **Open question — see §4** |
| Subscription plans (tiered/PAYG) | #77 catalog, #78 lifecycle, #38 recommender | Sprint 9 (Tier C) | **Sprint 3.5 (new)** |
| IoT/smart meter real-time | #12, #13, #15, #17, #18 | Sprint 2 (in progress) | Sprint 2 (unchanged — this unblocks everything else) |
| Billing & payments | #19–23 (tariff/invoice), #39 (Razorpay) | Sprint 3 | Sprint 3 (unchanged, but immediately next) |
| Alerts & notifications | #81 (WhatsApp/SMS/IVR) | Sprint 9 (Tier C) | **Sprint 3.5 (new)**, trimmed to in-app + email first |
| Fault/support tickets | **none exists** | — | **New issue, Sprint 3.5** |
| Carbon/ESG (optional) | #80 (I-REC-shaped) | Sprint 9 (Tier C) | **Sprint 3.5 (new)**, lightweight version first |
| Scalable architecture | RLS + partitioning (#3, #5, #16) | M0/M1 (**done**) | — |
| DISCOM integration (future-ready) | #28–31 (NM workflow) | Sprint 4 | Sprint 4 (unchanged — genuinely secondary per PS1's own text: *"can be simulated or mocked"*) |

## 2. Revised near-term order

```
Sprint 2 (in progress, unchanged)
  #12 AMI simulator → #15 ingest worker → #18 live dashboard
  (#13 scenario API, #17 continuous aggregates: nice-to-have, not
   blocking — can slip if time is tight)

Sprint 3 — Billing (unchanged position, now immediately next)
  #19 tariff engine → #20 tariff seed → #21 invoice schema → #39 Razorpay

Sprint 3.5 — PS1 core loop (NEW — pulled forward from Sprint 9)
  #77 multi-service catalog → #38 plan recommender → #78 subscription
  lifecycle (transfer/pause/upgrade — trim to upgrade/cancel only if
  short on time)
  #86 notifications primitive — in-app bell + notifications/
  notification_deliveries tables (this is P9 from #25's property list;
  it's referenced today but nothing currently builds it)
  #87 support/fault ticketing — the module PS1 explicitly names
  as a required desired outcome
  #80 carbon tracking — lightweight first pass (metered CO2 avoided,
  cited emission factor), defer I-REC certificate provenance

Sprint 4 — DISCOM (unchanged, now after 3.5 instead of immediately
  after 3 — matches PS1's own "can be mocked" framing)

Sprint 5 — Onboarding / OCR (unchanged)
```

## 3. New issues to create

**#86 — Notifications primitive.** `notifications` + `notification_deliveries` tables (channel, status, read_at), in-app bell icon + center on the web shell (mark-read, mark-all-read, badge count — the pattern 2.0 had and it worked). This is the foundation #81 (multi-channel) later extends with WhatsApp/SMS/IVR delivery — building it now means every subsequent issue that needs to notify a user (invoice ready, SLA breach, ticket reply) has somewhere real to write to, instead of being blocked on Tier C.

**#87 — Support / fault ticketing.** `support_tickets` table (subject, description, priority, status, assignee, replies), a consumer-facing "raise a ticket" + status view, and a `support_agent`-role queue (the role already exists in `user_roles` from #2 — no policy currently uses it). Directly satisfies PS1's "reliable support and fault management" requirement and the "Service/support module" desired outcome, which nothing in the current roadmap builds.

## 4. Open question — mobile app scope

PS1 requires "web and mobile." The current plan's full native Expo app (#43+) is Sprint 6, several sprints past where the PoC needs to demo. Three ways to close this gap, in increasing cost:

1. **PWA-lite**: make the existing Next.js web app installable (manifest + service worker), responsive on mobile viewports. Cheap, satisfies "mobile channel" literally, not a native app.
2. **Pull forward a thin native shell**: just the consumer login + dashboard + subscribe flow in Expo, skip offline-first/field-technician features (those are PS4/PS5, not PS1).
3. **Keep as planned**: full Expo app stays at Sprint 6, PoC demo is web-only for now, mobile shown as roadmap/screenshots.

This needs a decision before Sprint 3.5 work reaches the point where mobile would matter (i.e., not urgent today, but should be decided before Sprint 4).

## 5. What this does NOT change

- Security/RLS work already done stays exactly as built — it's a genuine differentiator, not something to cut.
- #79 (deposit-free onboarding) and #82 (anti-scam checker) stay in Tier C — real and clever, but not named in PS1's explicit requirement list, so lower priority than what is named.
- The AMI spine (Sprint 2) is not abandoned — #12/#15/#18 still ship, because without live meter data the "real-time monitoring of energy usage" requirement (PS1 §3, first bullet) has nothing to point at.

## 6. 2.0 feature parity — decided, deferred (2026-08-31)

An audit of 2.0's full feature set (`app/consumer`, `app/admin`, `app/enterprise`, `server/routes`) turned up two categories:

**Real, DB-backed, worth porting once the PS1 gate clears:** auth, users, devices, locations, plans, subscriptions (wizard/upgrade/pause/cancel), invoices + PDF/CSV export, support tickets (overlaps #87), notifications (overlaps #86), carbon stats, telemetry dashboard, an AI advisor with guardrails, a Leaflet map of Gujarat locations. Most of this is already covered by issues already in this roadmap (#77/#78/#86/#87/#80) or by Sprint 4+ (DISCOM, mobile); the rest — AI advisor, CSV export, PDF invoices — is real, was not previously scoped, and should get its own issue(s) after §0 is checked off.

**Fully decorative in 2.0 — confirmed by reading the source, not assumed:** blockchain energy ledger, EV charging (vehicles/sessions/stations), P2P energy trading (wallet/listings), admin grid-balancing simulation, weather/solar forecast, DISCOM "live" grid parameters, firmware/OTA management, enterprise team management. Every one of these is `Math.random()` or a hardcoded seed array with **zero backend model or route** behind it in 2.0 — confirmed, not inferred from naming. **Decision: skip these.** DESIGN.md's founding principle (§1, P1 — "no component may outlive its data") exists specifically as a reaction against this exact pattern; rebuilding it, even "better," reintroduces the failure mode 3.0 was written to fix, and none of it is named in PS1's requirements.

**Sequencing decision:** this whole port waits until every row in §0 is checked — it does not jump ahead of #39/#77/#78/#86/#87/#80.
