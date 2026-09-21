# Web / cloud app scaffold notes

Full specs in `../docs/01-product.md` (features), `../docs/02-architecture.md` (system +
API + DB).

## Stack (team's choice, contract-locked)

- **NextJS** on **Vercel**, database of your choice (start SQLite, graduate to Postgres).
- The home agent polls the API every minute; it does **not** persist anything locally
  beyond config/evidence staging.

## Key screens

1. **Login** — email sign-in (the linked Evony email), operator flag.
2. **5-step linking wizard** — instructions → Evony name + email (stored; app login) →
   6-digit code (memory only) → schedule (default Mon/Wed/Fri) + 7500💎 ack → confirm.
3. **Master list (operator)** — Evony name · schedule · next run · last-run status.
4. **Per-user dashboard** — status, evidence screenshot, "Run now", "Re-link (new code)".

## API endpoints the agent uses

| Method | Path | Notes |
|---|---|---|
| `GET` | `/jobs/due` | atomic claim/lease per job |
| `POST` | `/runs` | report status: `ok|failed|needs_code`, shield hours, duration |
| `POST` | `/runs/{id}/evidence` | upload screenshot |

## DB schema

```
users       id, email (plaintext; app login + Evony login), evony_name, is_operator
schedules   id, user_id, weekdays, time, gem_ack, active
runs        id, user_id, triggered_at, trigger_type, status, evidence_ref,
            shield_hours_remaining, duration_ms, error
re_link     id, user_id, requested_at, code_status, active
```

## Privacy copy (must be displayed verbatim on wizard + footer)

> Your Evony email is stored so we can sign you in and apply your scheduled bubbles. The
> 6-digit code is used once and never stored.

## Auth

Email-based login for members + operator (no password); a separate **agent bearer token**
(from secrets) for the `/jobs` and `/runs` endpoints. No open signup — private circle only.