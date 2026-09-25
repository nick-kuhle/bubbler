# Web app (Next.js UI + API)

Evony email/code **linking** has been successfully tested with new users and different
emails in the current setup (operator report). That is distinct from web-app **sign-in**,
which is now owned via emailed one-time codes: `POST /api/auth/code` mails a 6-digit OTP
and `POST /api/auth/login` starts a session only after it verifies (registering a
brand-new email and routing it to the Link-Account wizard). Delivery needs a provider —
Resend or any SMTP relay; see the env table below. With no provider configured, production
login fails closed (`503`) and local dev logs the code. See [status](../README.md),
[security](../docs/05-security.md) and the [cutover plan](../docs/07-cutover.md).

## Running locally for development

Requires Node 22+ (SQLite uses `node:sqlite`). From `webapp/`:

```sh
npm ci
npm run migrate   # uses local data/bubbler.db unless DATABASE_URL/POSTGRES_URL is set
npm run dev
```

**Do not** put real member data in the repository or copy the SQLite file to Vercel. The
empty DB fixture has been removed from source control; local DB, WAL and SHM files are
ignored. The DB schema is in `lib/db.ts`. `npm run build` also runs migrations, including
a legacy `DROP TABLE IF EXISTS schedules`; replace that step with a safe migration before
pointing the build at a production Postgres database.

## Deployment target (not yet cut over)

Deploy the GitHub revision to Vercel with project **Root Directory `webapp`**. Provision a
persistent managed Postgres database and provide `DATABASE_URL` (or `POSTGRES_URL`) at
build *and* runtime, rather than using the default SQLite fallback on an ephemeral
serverless filesystem. For sign-in email, set an allowlist (`AUTH_SEED`) and one mail
provider — Resend (`RESEND_API_KEY`, `MAIL_FROM`) or SMTP (`SMTP_HOST`/`SMTP_PORT`/
`SMTP_USER`/`SMTP_PASS`, `MAIL_FROM`). Keep `AUTH_OPERATOR` for the admin role, plus a
separate `AGENT_BEARER_TOKEN` for phone-to-cloud calls. Vercel Blob evidence uses
`BLOB_READ_WRITE_TOKEN` and currently returns public image URLs; decide
access/retention before storing sensitive evidence. Use distinct staging and production
environments and keep all values out of Git/PRs.

## Active API contract (see `../docs/02-architecture.md`)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/code` | Request a one-time login code (mailed via Resend/SMTP; dev logs it when no provider is set); invite-gated by `AUTH_SEED` |
| `POST` | `/api/auth/login` | Verify the emailed code, create-or-login the user, set the session cookie; returns `created` for fresh accounts |
| `GET` | `/api/agent/events?hold=45` | Phone-initiated long-poll, returns `{ok,event}`; stamps the heartbeat from `v`/`host`/`pid`; auth bearer |
| `GET` | `/api/agent/status` | Phone agent liveness (online / last seen / version) for the Test connection card; web session |
| `POST` | `/api/agent/links/{link_id}/status` | Phone reports wizard link progress; auth bearer |
| `POST` | `/api/agent/runs` | Phone reports a run; auth bearer |
| `POST` | `/api/agent/runs/{run_id}/evidence` | Raw PNG/JPEG to Blob; auth bearer |
| `POST` | `/api/wizard/link`, `/api/wizard/link/{link_id}/code` | Start link / submit Evony code; web session |
| `GET` | `/api/wizard/link/{link_id}` | Browser polls link status (about every 3s); web session |
| `POST` | `/api/test-connection` | Start a connection test (opens Evony on the phone, signs in as the member's email); web session |
| `GET` | `/api/test-connection/{test_id}` | Browser polls test status; includes the confirmed in-game name and `agent_online`; web session |
| `POST` | `/api/agent/test-connection/{test_id}/status` | Phone reports test progress (running/ok/failed + `confirmed_name`/`verified`); auth bearer |
| `POST` | `/api/runs/now`, `/api/schedule` | Queue a manual run / manage slots; web session |

Data tables are `users`, `sessions`, `slots` (one UTC weekday/time per row),
`link_sessions`, `test_sessions`, `agent_health` (heartbeat), `email_codes` (hashed login
OTPs), `jobs` and `runs`. There is
no `/jobs/due` endpoint or separate
`schedules`/`re_link` table in the current implementation. Jobs are currently marked
`claimed` without a lease/retry; see cutover gates before relying on unattended work.

## Internationalization (22 languages)

The whole UI is internationalized with [next-intl](https://next-intl.dev) (App Router).
There is exactly **one** translation system: `messages/<locale>.json` per language —
no per-template dictionaries, no hard-coded UI strings in components.

- `src/i18n/routing.ts` — the single source of truth: locale list, native labels,
  RTL set. Adding a language = adding it here plus one JSON file (see below).
- `messages/en.json` — the source catalog (178 keys). Every other catalog must have
  the same keys and the same `{placeholders}`.
- `app/[locale]/…` — every page lives under the locale segment; middleware in
  `middleware.ts` redirects `/` → `/<default-locale>` and adds hreflang SEO tags.
- Client/server components use `useTranslations` / `getTranslations`; keys are
  type-checked against `en.json` via `src/global.d.ts`, so `t("nonexistent")`
  fails `npm run typecheck`.

### Commands

```sh
npm run i18n:check   # key + placeholder parity of all 22 catalogs vs en.json
npm run i18n         # Lingo.dev CLI: fills missing catalogs/keys from en.json
```

`i18n.json` is the [Lingo.dev](https://lingo.dev) configuration (source `en`, targets
= the other 21 locales, bucket = `messages/[locale].json` where next-intl already
expects them — zero code changes to fill a new catalog). It is incremental (a lockfile
retranslates only changed keys) and never overwrites existing translations unless you
pass `--force`. Run it whenever you add/change keys in `en.json`:

- Free tier: engine `lingodotdev` — run `npx lingo.dev@latest login --interactive`.
  (On a headless machine use `api-key` instead of `--interactive`.)
- Free and local: Ollama (`type: "ollama"`, e.g. model `phi3`) — see `.env.example`.
- Or any LLM (OpenAI, Anthropic, Google, Mistral, OpenRouter) via `llm:` entries.

> AI translations are drafts. Ship them for small copy quickly, but ask a native
> speaker from the alliance to review game terms ("bubble", "Truce", gem counts)
> per language over time. `npm run i18n:check` guarantees structure (keys,
> placeholders, array lengths) — not tone.

### Adding a language

1. Add the code + native label in `src/i18n/routing.ts` (and the target in
   `i18n.json`); add to `RTL_LOCALES` if it's a right-to-left language.
2. Run `npm run i18n` to generate `messages/<code>.json` from English.
3. Run `npm run i18n:check` and `npm run typecheck`.

That's it — the switcher, static params, middleware and hreflang tags all derive
from the routing list, so the app picks it up everywhere with no further edits.
