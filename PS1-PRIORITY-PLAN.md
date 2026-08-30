# PS1 re-prioritization plan

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
