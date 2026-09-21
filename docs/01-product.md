# 01 — Product spec

## Purpose

Let an operator (the account owner) and their trusted circle keep Evony peace shields
("bubbles") up on a fixed schedule without ever opening the game manually. Members link
their Evony account once, pick Mon/Wed/Fri-style schedules, and the system applies the
**3-day Truce Agreement (7500 gems)** for each account and verifies it before closing the game.

## Users & roles

- **Operator** — the person running the service. Can see the master list, trigger a manual
  run for any user, and (optionally) manage users.
- **Member** — linked to one Evony account. Manages their own schedule and gets run status.

## Core feature set

### 1. Email login
- All users sign in with their linked Evony email (no password). Operator flag on the operator account.

### 2. 5-step linking wizard
1. **Instructions** — explain linking a new Evony account.
2. **Two inputs**:
   - *"Please enter your Evony name"* — plaintext; this is the human key shown on the master list.
   - *"Enter your Evony email"* — stored in plaintext; doubles as the app login and is
     typed into the game on each automated run.
3. **Six-digit code** — the code Evony emailed (entered once to log in, kept in memory only,
   discarded after use).
4. **Schedule + gem acknowledgment** — pick weekdays/time (default Mon/Wed/Fri) and check a
   box acknowledging the 7500-gem cost.
5. **Confirm** — creates the user + schedule.

Privacy copy on the app (wizard + footer), verbatim:

> Your Evony email is stored so we can sign you in and apply your scheduled bubbles. The
> 6-digit code is used once and never stored.

### 3. Master list (operator only)
Table of **Evony name · schedule (days/time) · next scheduled run · last-run status**.
Emails are never shown to other users. This is how friends are told their slot is coming.

### 4. Dashboard (per user)
- Link status, schedule editor, next-run ETA, last-run result + evidence screenshot,
- **"Run now"** (manual trigger), and a **"Re-link (new code)"** action for the rare case a
  session is revoked (see below).

### 5. Scheduler
- Runs per user's schedule, one run at a time (global run lock).
- **Idempotency guard:** skip a scheduled run if the account already has a bubble with
  **more than 24h remaining**.
- Failed runs are recorded with reason and retried per retry policy; a run that finds the
  session revoked is marked **"needs new code"** and the wizard re-link path is surfaced.

### 6. Runtime model
- Web app + agent: **always on**.
- Evony client: **boot-on-demand only**. Opened to apply a bubble, verified, then closed —
  never left idling online (a new-device login kicks the online user, so we never risk that).

## Out of scope (v1)

- Reactive "bubble when attacked" behavior (a truce can't be activated while an attack is in
  progress anyway; the scheduled always-on shield is the design).
- Public signup / open registration.
- Billing, gamification, notifications beyond web status.

## Non-functional requirements

- HTTPS whenever exposed outside the LAN (or run behind Tailscale).
- Runs are short (target a few minutes), 3x/week — keep idle footprint ~zero.
- Emails live in the app DB and are sent to the phone per-run over HTTPS; the 6-digit code is never stored or logged.