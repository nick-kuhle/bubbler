# 01 — Product spec

**Progress (2026-09-23):** Evony email/code linking has been completed and successfully
tried with new users and different email addresses in the current test setup (operator
report). This does not prove the phone-only/Vercel deployment or bubble runs. The sections
below describe intended product behavior; see [07 — cutover](07-cutover.md) for the gates
between the working link flow and unattended operation.

## Purpose

Let an operator (the account owner) and their trusted circle keep Evony peace shields
("bubbles") up on a fixed schedule without ever opening the game manually. Members link
their Evony account once, pick Mon/Wed/Fri-style schedules, and the target system applies
and verifies a **3-day Truce Agreement (2500 gems)** before closing the game.

## Users & roles

- **Operator** — the person running the service. Can see the master list, trigger a manual
  run for any user, and (optionally) manage users.
- **Member** — linked to one Evony account. Manages their own schedule and gets run status.

## Core feature set

### 1. Email login (production requirement, **not yet implemented**)
- Members should sign in with their linked Evony email (no password). Operator flag on the
  operator account.
- **Target:** email a one-time login URL, then issue a session cookie only when the member
  opens that URL. **Current code:** `/api/auth/login` issues a cookie immediately to anyone
  submitting an allowed email, with no email verification. If `AUTH_SEED` is unset, all
  emails are accepted. This must be fixed before a public real-user Vercel rollout.
- Signing in to the web app and entering Evony's one-time code during **account linking**
  are different workflows. The latter is the workflow tested successfully.

### 2. Linking wizard

Linking is **the interactive corner of the app** and the reason long-polling exists
(see `02-architecture.md`). In healthy tests the agent can act quickly after wizard steps;
this is best effort, not a guaranteed ~1s response or recovery from a lost job.

1. **Instructions** — explain linking a new Evony account.
2. **Account details**:
   - *Evony name* — plaintext; this is the human key shown on the master list.
   - *Evony email* — currently taken from the signed-in web account (not a separate wizard
     input); stored in plaintext and sent to the agent for login.
   - On submit: the app creates a `link_session`, then enqueues a `link` job for the
     agent's next long-poll. The agent launches Evony and enters the email. The wizard
     shows **"Waiting for your phone… this usually takes a few seconds."**
3. **Six-digit code** — Evony emails the code and starts a ~90s countdown. The user enters
   the 6 digits into the wizard; the app briefly queues them for the agent's next poll,
   which types them in Evony. This link path was tested with new users/emails.
   - **Target retry behavior:** on expiry the agent taps **resend**, Evony emails a fresh
     code, and the wizard prompts for it. Loss/retry after an interrupted delivery has
     **not** been verified end-to-end and is a cutover test, not a current guarantee.
4. **Schedule + gem acknowledgment** — pick weekdays/time (default Mon/Wed/Fri) and check a
    box acknowledging the 2500-gem cost.
5. **Confirm** — once Evony reports the link complete, the wizard saves schedule slots
   for the existing web user (created when they signed in).

**Privacy-copy gate:** the proposed “code is never stored” wording is incorrect for the
current implementation: a code is in a DB job until it is claimed; expired, unclaimed
rows are not yet purged. The web UI must present accurate code-retention wording
*after* the queue/expiry behavior is fixed; do not advertise a never-stored guarantee.
See [05 — security](05-security.md).

### 3. Master list (operator only)
Table of **Evony name · schedule (days/time) · next scheduled run · last-run status**.
Emails should not be shown to other users. The "next run" column shows the scheduled
time; run status can be delayed by an offline phone, so avoid a hard completion time.

### 4. Dashboard (per user)
- Link status, schedule editor, next-run ETA, last-run result + evidence screenshot,
- **"Run now"** (manual trigger enqueues a job for the agent's next long-poll), and
  a **"Re-link (new code)"** path if a session is revoked (see below). Automated run
  execution and verification still need end-to-end tests.

### 5. Scheduler
- **No cron:** `fillDue()` checks the `slots` table on each agent poll for the current UTC
  weekday + minute and inserts a uniquely keyed run job for that user/date/time. There is
  currently no lease/ack, so jobs lost after claim are not automatically retried.
- **Target idempotency guard:** skip applying a truce if >24h remains. Shield detection,
  retries and evidence have **not** been proven end-to-end yet; do not turn on unattended
  schedules until the [cutover tests](07-cutover.md) pass.
- A revoked game session should surface a re-link path; validate that behavior during
  run testing rather than assuming a missing code will always be detected.

### 6. Runtime model
- **Target:** Vercel web app + on-device agent remain available. This has not yet been
  validated after removing the local host.
- Evony client: **boot-on-demand only**. Opened to link/apply a bubble, then closed to avoid
  idling online (a new-device login kicks the online user).

## UI copy rules

- In healthy operation events usually arrive within seconds; a 45-second held request
  alone does *not* guarantee a one-minute maximum when the phone is offline or the API
  fails. Present delays as estimates, not an SLA.
- During linking, explain that the agent must be online and ask the user to wait for the
  code and an explicit confirmation of linking.

## Out of scope (v1)

- Reactive "bubble when attacked" behavior (a truce can't be activated while an attack is in
  progress anyway; the scheduled always-on shield is the design).
- Public signup / open registration.
- Billing, gamification, notifications beyond web status.

## Non-functional requirements

- HTTPS everywhere (Vercel provides it).
- Runs are short (target a few minutes), 3x/week — the phone stays idle otherwise.
- Emails live in the app DB and are sent to the agent per-event over the long-poll. Codes
  currently exist temporarily in DB job payloads; purge expired code jobs and verify
  cleanup/logging before making stronger privacy claims.
