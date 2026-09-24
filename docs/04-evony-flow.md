# 04 — Evony game flow + verification

**Verified milestone (operator report, 2026-09-23):** Evony email/code linking worked with
new users and different emails in the current local-machine-assisted setup, including the
load-account confirmation. This does **not** validate autonomous bubble runs, retries,
vision-based shield verification or on-phone-only operation. The run flow below is a
*target* and must pass [07 — cutover](07-cutover.md) before unattended use.

## Game mechanics we rely on

- **Bubble = Truce Agreement** item. We use the **3-day** variant at **2500 gems** (operator-confirmed).
- You **cannot activate a truce while an enemy army is actively attacking** your keep.
  Therefore we do **not** react to attacks — we keep an always-on shield topped up on
  schedule. (A shield with >24h remaining cancels most risk; skipping an unnecessary
  re-application is a target behavior, not currently proven.)
- **Login is email + one-time 6-digit code — the first time.** The email-login control is
  the small **gold person icon in the top-left of the loading/connecting screen** (iPhone XR
  screenshot pixels ≈ 50,248). It is only tappable while the game is loading and may need
  repeated taps. After it lands, Evony shows **Switch Account** → email → 6-digit code (~90s).
- **Linked accounts skip the code.** Once an email is linked on this device, confirming the
  email goes straight to the **load-account Confirm** ("login as \<user\>") — no code is sent
  or asked. That Confirm tap is the last step before the world view. Every scheduled run
  logs in this way, one user at a time.
- **"Clear Other Devices"** in Evony settings revokes the device session → next run must
  re-link with a **fresh 6-digit code** (surfaced via the web-app re-link flow).
- **A new-device login kicks the online user.** We never leave Evony idling; we open it,
  apply, verify, close.

## The two flows

### A. Target run flow (apply + verify a bubble) — event kind `run`

```
claim job (from long-poll event)
  │
  ├─ idempotency guard: shield already up with >24h remaining?  → mark ok, skip
  │
  ├─ launch Evony, tap the loading-screen login icon (same entry as linking)
  ├─ ALWAYS switch account to the event's email (the phone serves many users;
  │     whoever was logged in last may be someone else — never assume)
  ├─ after email Confirm, classify the next dialog:
  │     ├─ load-account Confirm ("login as <user>") → tap Confirm → world view
  │     └─ 6-digit code prompt → session revoked → report status=expired
  │        (dashboard surfaces the wizard re-link path; see 01-product §4)
  ├─ navigate: open shield/bubble item → select 3-day Truce (2500💎) → Activate → Confirm
  ├─ verify: screenshot → shield indicator present AND countdown readout ≥ 3 days − ε
  ├─ close Evony (back to home screen)
  │
  └─ report (POST /api/agent/runs) + upload evidence screenshot
```

The linked-account login (`EvonyController.login_linked_account`) reuses the
link-verified email preamble (icon taps, email typing, Confirm at 579,1100) and then
distinguishes the load-account Confirm from the code dialog by dialog chrome (red-cancel
pixel, code-box pixels, dialog content signature), with optional `load_confirm.png` /
`code_dialog.png` template overrides when vision is enabled. Ambiguous parchment resolves
to `needs_code` — mis-tapping Confirm on a code dialog is worse than asking for a re-link.

Test it on the phone before trusting a schedule (see
`phone-agent/calibration/README.md`): `python test_login.py --email <linked>` saves a
screenshot per stage (`post_email`, `post_load_confirm`, `world`) for visual verification.

**Target improvement:** after each tap/type, confirm the expected screen and retry a
bounded number of times. Bubble taps are still uncalibrated (`world_view/bubble_menu`,
`truce_3day/select`, `activate_confirm/activate+confirm`) — `apply_3day_bubble` reports
exactly which are missing until `test_login.py --record-taps` fills them in.

### B. Link flow (first login / re-link) — event kinds `link` + `code`

Interactive link flow; tested with new users/emails in the current setup. On-phone-only
and resend/lost-event behavior remain cutover tests.

```
┌─ receive "link" event (evony email from the wizard)
│
│  launch Evony → email-login entry → type email → tap "send code"
│  (code now lands in the user's inbox; Evony shows the 90s entry screen)
│
│  wait (long-poll is open) for the "code" event carrying the 6 digits
│      ├─ code arrives while online → type it → Confirm → tap load-account Confirm
│      └─ expired/rejected? (resend is a target, needs tests)
│            → request fresh code, report state to wizard (not yet reliable)
│            → wait for the next "code" event
│
├─ verify: world view reached? → linked
└─ report link status; close Evony
```

A new code can be requested if an attempt expires, but automatic resend and recovery from
lost/expired jobs need explicit end-to-end testing. Long-poll delivery is usually fast when
both sides are online, not guaranteed within one second.

## Vision layer (target: runs on the phone; calibration pending)

The committed manifest currently has link-related entries only; required image templates
are git-ignored and must be transferred/validated on the phone. Do not equate a working
email-link with a verified truce application.

- **Template matching (OpenCV `matchTemplate`)** on reference screenshots + ROI maps stored
  in `phone-agent/calibration/`:
  - `email_login.png` — entry button for email login
  - `code_dialog.png` — 6-digit code entry (also overrides run-login classification)
  - `load_confirm.png` — linked-login "login as \<user\>" Confirm (overrides classification)
  - `world_view.png` — post-login server/world screen
  - `truce_3day.png` — the 3-day truce item
  - `activate_confirm.png` — activate/confirm dialogs
  - `shield_active.png` — shield indicator (with crop for the countdown ROI)
- **OCR (tesseract)** runs on the countdown ROI to read remaining time (e.g. `2d 23h`).
  On-device alternative: Apple's **Vision** framework (`VNRecognizeTextRequest`) exposed via
  a tiny helper binary — better on iOS screenshots than tesseract.
- Shield "up" = indicator present; "healthy" = remaining > 24h.

### Coordinates
Fix the phone orientation and resolution once during calibration. Tap coordinates in the
current controller are used **as-is** against the iPhone XR 828×1792 screenshots; it does
not rescale to a different resolution.

## Edge cases

| Case | Handling |
|---|---|
| Shield already >24h at schedule time | Target: skip run, mark ok, note remaining hours; not yet verified/implemented as a shield-time guard |
| Code prompt at login | Current `run_one` reports `expired`; re-link UX needs validation |
| Account switched to another device | Treat as session revoked; re-link on a controlled test account |
| Code expired mid-link | Agent may tap **resend**; automatic recovery not yet verified |
| App update / new Evony UI version | Templates stale → run fails with mismatch; re-run calibration |
| Frida down | Agent restart; verify frida-server and the Python binding over SSH |
| Screen off / phone asleep | Wake the phone physically or with an installed jailbreak utility; the device is set not to auto-lock |

## Timing & load

- Target: a few minutes online per account per run, 3x/week, one account at a time.
- After cutover the phone will do the work natively; check on-device dependency/performance
  and long-poll reconnect behavior during bring-up.
