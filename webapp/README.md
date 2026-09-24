# Web app (Next.js UI + API)

Evony email/code **linking** has been successfully tested with new users and different
emails in the current setup (operator report). That is distinct from web-app **sign-in**;
the present `/api/auth/login` trusts an email string and does not send a magic link. Do
not make a public Vercel deployment with real member data until app authentication is
fixed. See [status](../README.md), [security](../docs/05-security.md) and the
[cutover plan](../docs/07-cutover.md).

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
serverless filesystem. Set `AUTH_OPERATOR` and a required invite policy (`AUTH_SEED`)
**after implementing verified email sign-in**, plus a separate `AGENT_BEARER_TOKEN` for
phone-to-cloud calls. Vercel Blob evidence uses `BLOB_READ_WRITE_TOKEN` and currently
returns public image URLs; decide access/retention before storing sensitive evidence.
Use distinct staging and production environments and keep all values out of Git/PRs.

## Active API contract (see `../docs/02-architecture.md`)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/agent/events?hold=45` | Phone-initiated long-poll, returns `{ok,event}`; auth bearer |
| `POST` | `/api/agent/links/{link_id}/status` | Phone reports wizard link progress; auth bearer |
| `POST` | `/api/agent/runs` | Phone reports a run; auth bearer |
| `POST` | `/api/agent/runs/{run_id}/evidence` | Raw PNG/JPEG to Blob; auth bearer |
| `POST` | `/api/wizard/link`, `/api/wizard/link/{link_id}/code` | Start link / submit Evony code; web session |
| `GET` | `/api/wizard/link/{link_id}` | Browser polls link status (about every 3s); web session |
| `POST` | `/api/test-connection` | Start a connection test (opens Evony on the phone, signs in as the member's email); web session |
| `GET` | `/api/test-connection/{test_id}` | Browser polls test status (about every 2s); web session |
| `POST` | `/api/agent/test-connection/{test_id}/status` | Phone reports test progress (running/ok/failed); auth bearer |
| `POST` | `/api/runs/now`, `/api/schedule` | Queue a manual run / manage slots; web session |

Data tables are `users`, `sessions`, `slots` (one UTC weekday/time per row),
`link_sessions`, `jobs` and `runs`. There is no `/jobs/due` endpoint or separate
`schedules`/`re_link` table in the current implementation. Jobs are currently marked
`claimed` without a lease/retry; see cutover gates before relying on unattended work.
