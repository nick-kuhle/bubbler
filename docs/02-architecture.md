# 02 — Architecture

## System overview

```
                ┌─────────────────────────────────────────────┐
                │   CLOUD — Vercel (NextJS + Postgres)       │
                │   auth · wizard · schedules · master list   │
                │   REST API for the agent                    │
                └──────────────┬──────────────────────────────┘
                               │  agent polls: GET /jobs/due   (≈1/min)
                               │  agent reports: POST /runs    (status, evidence)
                               ▼
                ┌─────────────────────────────────────────────┐
                │   HOME AGENT — Python, always-on (N150)     │
                │   run lock · OpenCV + tesseract verify      │
                │   usbmuxd → iproxy → SSH → Hermes Touch     │
                └──────────────┬──────────────────────────────┘
                               │  USB cable (no WiFi dependency)
                               ▼
                ┌─────────────────────────────────────────────┐
                │   DEVICE — jailbroken iPhone XR             │
                │   Evony TKR (real app, real account)        │
                │   Hermes Touch HTTP API (tap/type/screen)   │
                └─────────────────────────────────────────────┘
```

The cloud is the "brain" (schedules, auth, people), the agent is the "hands" (it owns the
USB link to the phone and does the physical work), and the phone is the "player".

## Components

### Cloud (web app)
- **NextJS** on Vercel, PostgreSQL for storage (can start with anything the team prefers —
  SQLite/Postgres both fine; contract is what matters).
- Responsibilities:
  - Hashed-password auth + operator flag.
  - Linking wizard, master list, dashboards.
  - Stores schedules; exposes an API the agent polls.
  - Records runs reported by the agent, stores evidence screenshots (e.g. object storage).
  - "Re-link (new code)" action → sets the account into a state the agent will act on.

### Home agent (Python driver)
- Always-on process on the N150; tiny footprint (<100 MB).
- Polls the cloud every minute: `GET /jobs/due`. A job = one account + one scheduled apply.
- **Run lock** — exactly one in-flight run globally.
- Executes the run flow (see `04-evony-flow.md`) against the phone over USB, step-by-step
  screen guards + retries, and reports `POST /runs` with status + evidence screenshot.
- Vision: OpenCV template matching (reference screenshots/ROIs) + tesseract OCR for the
  shield countdown readout.

### Phone (jailbroken iPhone XR)
- Runs the real Evony app.
- Exposes a control surface:
  - **Current (working):** SSH over usbmuxd (`iproxy 4044:22`) for command execution.
  - **Target:** **Hermes Touch** HTTP API over the same USB transport (port 8887) —
    `POST /touch {"x","y"}`, `POST /typeText`, `GET /screenshot`. *Pending verification on
    rootless Dopamine / A12; fallback AutoTouch or an accessibility-based tweak.*
- Details in `docs/03-phone-hardware.md`.

## API contract (cloud ↔ agent)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/jobs/due` | List due jobs (account ref, evony name, schedule slot). Agent claims one (atomic lease). |
| `POST` | `/runs` | Report result: `user_id, status(ok/failed/needs_code), evidence_ref, shield_hours_remaining, duration_ms`. |
| `POST` | `/runs/{id}/evidence` | Upload evidence screenshot. |
| `GET` | `/accounts/{id}/re-link-status` | Whether account needs a fresh 6-digit code. |

## Database schema (starter)

```
users       id, evony_name (plaintext), evony_email_hash, email_salt,
            password_hash, is_operator, created_at
schedules   id, user_id, weekdays (bitmask/ints), time (HH:MM), gem_ack (ts), active
runs        id, user_id, triggered_at, trigger_type (scheduled/manual),
            status (pending/ok/failed/needs_code), evidence_ref,
            shield_hours_remaining, duration_ms, error
re_link     id, user_id, requested_at, code_status (needs_code/code_used), active
```

Emails are **salted-hash only**. Codes live in memory during linking and are discarded.

## Config / secrets

- Agent config: `driver/config.example.yaml` (host, ports, usbmuxd pair) — commit the
  example only, never real values.
- Secrets (SSH password/token, DB URL, Vercel envs) live in vault/secrets tooling, not git.

## Operational notes

- No WiFi is required between agent and phone (USB only). The N150's built-in WiFi card is
  currently unreliable — keep the driver on the wired/USB path.
- Runs should be scheduled during windows the host is otherwise idle (small machine).