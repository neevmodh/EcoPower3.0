# EcoPower mobile (#43)

Expo + expo-router + NativeWind, one binary for two personas: field
technician, and consumer/society-member — selected by the `roles` claim on
the session's JWT after sign-in (`lib/auth.ts`), same idea as web's
`landingFor()` (`apps/web/lib/landing.ts`).

**Status: the auth + routing shell exists and type-checks; nobody has run it
on a device or simulator.** This session had no iOS/Android simulator or a
physical device to test against — `tsc --noEmit`, lint, and `expo export`
(a real Metro bundle, not a syntax check) are the only verification that
happened. Treat first boot as a real test, not a formality.

## Setup

```bash
cd apps/mobile
cp .env .env.local   # already gitignored; edit the URL for your target device (see below)
pnpm install          # from repo root — this is a pnpm workspace package
pnpm --filter @ecopower/mobile start
```

## The `127.0.0.1` trap

`.env`'s default (`http://127.0.0.1:54321`, local Supabase) only resolves
from the machine actually running `supabase start`. It will **not** work
from:
- the Android emulator — use `http://10.0.2.2:54321` instead
- a physical device (Expo Go or a dev build) — use your machine's LAN IP,
  e.g. `http://192.168.x.x:54321`, and make sure the device is on the same
  network

Against the real deployed project instead of local Supabase, use its
`https://<project>.supabase.co` URL and anon key (same anon key web uses —
RLS is the boundary, not the key, same as web's own `NEXT_PUBLIC_*` pair).

## Architecture (see issue #43 for the full writeup)

- **Session storage**: `expo-secure-store` (Keychain/Keystore), never
  AsyncStorage — a JWT in plaintext on a lost or rooted device is a real
  account-takeover path. See `lib/supabase.ts`.
- **Design tokens**: `tailwind.config.js` reads
  `packages/shared/src/palette.json` directly — the same source web's
  `generateCssVariables()` (`packages/shared/src/tokens.ts`) uses, so a
  status color means the same thing on both platforms. Light-mode values
  only for now: `app.json` pins `userInterfaceStyle` to `light` app-wide, so
  a dark variant would be dead code until that changes.
- **Coarse routing, not authorization**: `app/index.tsx` picks a persona
  from the JWT claim the same way web's middleware does — RLS is the actual
  gate on every query either app makes.

## What's not built yet

Everything past the login screen and two empty persona homes — that's the
rest of the mobile backlog, each its own issue and each needing a real
device to build against safely:

- #44 Realtime with `AppState` handling (backgrounding kills the websocket
  silently on Android without it)
- #45 Offline outbox (MMKV/SQLite queue, idempotency keys, retry)
- #46 Meter QR scan + nameplate OCR (`expo-camera`)
- #47 Meter reading OCR from field photographs (harder: 7-segment/dial
  digit recognition, not general OCR)
- #48 Commissioning flow with fraud controls (geo, clock-tamper detection,
  photo hashing)
- #49 EAS build → distributable APK
