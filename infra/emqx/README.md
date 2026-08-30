# EMQX broker (#14)

Deployed to Railway as its own project (`ecopower3-emqx`), separate from the
Supabase-backed `Ecopower3.0` project — the MQTT broker has a different
lifecycle and scaling profile than the web app.

Public endpoint (TCP proxy, fixed port — not HTTP): see `secrets/emqx-ecopower3.md`
at the repo root for the live host/port and admin credentials.

## Device auth

- Username = meter serial.
- Password = HMAC-derived token from the per-device secret provisioned at
  commissioning (#48) — no shared secret across devices.
- ACL confines every authenticated client to `ecopower/v1/{username}/#`, via
  EMQX's `${username}` ACL placeholder. Configured through the Management
  API (`password_based` / `built_in_database` authentication +
  `authorization/sources/file` with a template rule), not the dashboard UI,
  so it's reproducible from a script rather than a one-off click-through.
- Rotation: `meters.key_version` (schema) is the DB-side marker; rotating a
  credential in the broker itself means re-calling the same
  `POST /authentication/.../users` endpoint with the new token — not wired
  into any automated job yet, that lands with #48.

## Redeploying

```sh
cd infra/emqx
railway up --detach -m "..."
```

The Dockerfile is the only build input; Railway builds it directly, no
GitHub connection needed for this service.
