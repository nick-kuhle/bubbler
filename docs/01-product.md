# 01 — Product spec

## Purpose

Let an operator (the account owner) and their trusted circle keep Evony peace shields
("bubbles") up on a fixed schedule without ever opening the game manually. Members link
their Evony account once, pick Mon/Wed/Fri-style schedules, and the system applies the
**3-day Truce Agreement (2500 gems)** for each account and verifies it before closing the game.

## Users & roles

- **Operator** — the person running the service. Can see the master list, trigger a manual
  run for any user, and (optionally) manage users.
- **Member** — linked to one Evony account. Manages their own schedule and gets run status.

## Core feature set

### 1. Email login
- All users sign in with their linked Evony email (no password). Operator flag on the operator account.
- Magic-link sessions: a one-time login URL is emailed; the link creates a signed session cookie.

### 2. 5-step linking wizard

Linking is **the interactive corner of the app** and the reason long-polling exists
(see `02-architecture.md`). The phone is told to act *within ~1s* of every wizard step,
and the 90-second code window is made retry-safe.

1. **Instructions** — explain linking a new Evony account.
2. **Two inputs**:
   - *"Please enter your Evony name"* — plaintext; this is the human key shown on the master list.
   - *"Enter your Evony email"* — stored in plaintext; doubles as the app login and is typed
     into the game on each automated run.
   - On submit: the app creates a `link_session`, the phone is woken via the open long-poll
     (≈1s), launches Evony, types the email, and taps "send code". **"Waiting for your phone…
     this usually takes a few seconds."**
3. **Six-digit code** — Evony emails the code and starts a ~90s countdown. The user enters
   the 6 digits into the wizard; the app forwards them to the phone over the same open
   long-poll (≈1s) so the phone types them with plenty of time left.
   - If the code expires before delivery (rare): the phone taps **resend**, Evony emails a
     fresh code + fresh 90s, and the wizard shows *"The code expired — a new one was just
     sent to your email."* Nothing about the 90s window is a hard deadline.
4. **Schedule + gem acknowledgment** — pick weekdays/time (default Mon/Wed/Fri) and check a
    box acknowledging the 2500-gem cost.
5. **Confirm** — on success, creates the user + schedule and marks the link complete.

Privacy copy on the app (wizard + footer), verbatim:

> Your Evony email is stored so we can sign you in and apply your scheduled bubbles. The
> 6-digit code is used once and never stored.

### 3. Master list (operator only)
Table of **Evony name · schedule (days/time) · next scheduled run · last-run status**.
Emails are never shown to other users. The "next run" column shows the scheduled time; a
small line notes *"results can take up to a minute to appear"*.

### 4. Dashboard (per user)
- Link status, schedule editor, next-run ETA, last-run result + evidence screenshot,
- **"Run now"** (manual trigger — applied by the phone within ~seconds via long-poll), and
  a **"Re-link (new code)"** action for the rare case a session is revoked (see below).

### 5. Scheduler
- **There is no cron.** Due runs are computed on demand from the `schedules` table when the
  phone's long-poll asks ("is anything due *right now*?"). A run counts as due when the
  current weekday + time matches a schedule and no run has been completed for that slot.
- **Idempotency guard:** skip a scheduled run if the account already has a bubble with
  **more than 24h remaining**.
- Failed runs are recorded with reason and retried per retry policy; a run that finds the
  session revoked is marked **"needs new code"** and the wizard re-link path is surfaced.

### 6. Runtime model
- Web app + **on-device phone agent**: always on.
- Evony client: **boot-on-demand only**. Opened to apply a bubble, verified, then closed —
  never left idling online (a new-device login kicks the online user, so we never risk that).

## UI copy rules

- The wizard and dashboard say the truth about latency: events are delivered by an
  always-open connection, so status and "run now" are **~instant (worst case ~1 minute)**.
  A short reassurance line may be shown near run status, e.g.
  *"Results can take up to ~1 minute to appear."* Do **not** claim 5 minutes.
- During linking step 2/3, tell the user the phone will act within seconds.

## Out of scope (v1)

- Reactive "bubble when attacked" behavior (a truce can't be activated while an attack is in
  progress anyway; the scheduled always-on shield is the design).
- Public signup / open registration.
- Billing, gamification, notifications beyond web status.

## Non-functional requirements

- HTTPS everywhere (Vercel provides it).
- Runs are short (target a few minutes), 3x/week — the phone stays idle otherwise.
- Emails live in the app DB and are sent to the phone per-event over the long-poll; the
  6-digit code is delivered once and deleted, never stored or logged.