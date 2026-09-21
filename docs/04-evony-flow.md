# 04 — Evony game flow + verification

## Game mechanics we rely on

- **Bubble = Truce Agreement** item. We use the **3-day** variant at **7500 gems** (operator-confirmed).
- You **cannot activate a truce while an enemy army is actively attacking** your keep.
  Therefore we do **not** react to attacks — we keep an always-on shield topped up on
  schedule. (A shield with >24h remaining cancels most risk; the scheduler skips re-applying
  in that case.)
- **Login is email + one-time 6-digit code.** The email-login button exists **only in the
  mobile app**. The code arrives by email and the code-entry screen shows a **~90-second
  countdown**.
- Sessions persist on the device. A same-device re-login needs only the email typed (no code).
- **"Clear Other Devices"** in Evony settings revokes the device session → next run must
  re-link with a **fresh 6-digit code** (surfaced via the web-app re-link flow).
- **A new-device login kicks the online user.** We never leave Evony idling; we open it,
  apply, verify, close.

## The two flows

### A. Run flow (apply + verify a bubble) — event kind `run`

```
claim job (from long-poll event)
  │
  ├─ idempotency guard: shield already up with >24h remaining?  → mark ok, skip
  │
  ├─ launch Evony
  ├─ state check: "on the post-login world view?"
  │     ├─ no, code prompt shown → abort as needs_code (surface re-link)
  │     └─ no, not logged in → type email (fetched from the event payload); if code prompt appears → abort as needs_code
  ├─ navigate: open shield/bubble item → select 3-day Truce (7500💎) → Activate → Confirm
  ├─ verify: screenshot → shield indicator present AND countdown readout ≥ 3 days − ε
  ├─ close Evony (back to home screen)
  │
  └─ report (POST /api/agent/runs) + upload evidence screenshot
```

Per-step truth-guards: after every tap/type, take a screenshot and confirm we are on the
expected screen (template match). On mismatch → configured retries (default 2), then fail
with the OCR'd screen state for diagnosis.

### B. Link flow (first login / re-link) — event kinds `link` + `code`

Interactive and resend-tolerant. Run by the same agent loop, on the phone.

```
┌─ receive "link" event (evony email from the wizard)
│
│  launch Evony → email-login entry → type email → tap "send code"
│  (code now lands in the user's inbox; Evony shows the 90s entry screen)
│
│  wait (long-poll is open) for the "code" event carrying the 6 digits
│      ├─ code arrives (≈1s after the user submits in the wizard) → type it → Confirm
│      └─ expired? (code-entry screen countdown hit 0 / Evony rejects)
│            → tap "resend" → (fresh code emailed, fresh 90s)
│            → report so the wizard shows "expired, check email again"
│            → loop back to waiting for the next "code" event
│
├─ verify: world view reached? → linked
└─ report link status; close Evony
```

Each resend grants a new 90s, so a human who is slow to check their email is never hard
locked out. The *only* genuinely time-sensitive leg is code entry after the user submits,
and long-polling delivers that in ~1s.

## Vision layer (runs on the phone)

- **Template matching (OpenCV `matchTemplate`)** on reference screenshots + ROI maps stored
  in `phone-agent/calibration/`:
  - `email_login.png` — entry button for email login
  - `code_dialog.png` — 6-digit code entry
  - `world_view.png` — post-login server/world screen
  - `truce_3day.png` — the 3-day truce item
  - `activate_confirm.png` — activate/confirm dialogs
  - `shield_active.png` — shield indicator (with crop for the countdown ROI)
- **OCR (tesseract)** runs on the countdown ROI to read remaining time (e.g. `2d 23h`).
  On-device alternative: Apple's **Vision** framework (`VNRecognizeTextRequest`) exposed via
  a tiny helper binary — better on iOS screenshots than tesseract.
- Shield "up" = indicator present; "healthy" = remaining > 24h.

### Coordinates
Fix the phone orientation and resolution once during calibration. All tap coordinates are
defined relative to that canonical screenshot; the agent maps them with a single scale
factor if the phone reports a different resolution.

## Edge cases

| Case | Handling |
|---|---|
| Shield already >24h at schedule time | Skip run, mark ok, note remaining hours |
| Code prompt at login | **needs_code**; web app shows "Re-link (new code)" |
| Account switched to another device | Same as above (session revoked) |
| Code expired mid-link | Phone taps **resend**; wizard prompts again; fresh 90s |
| App update / new Evony UI version | Templates stale → run fails with mismatch; re-run calibration |
| Hermes Touch down | Agent restart; escalate to SSH-level recovery in runbook |
| Screen off / phone asleep | Wake via Hermes Touch (or `launch`); the device is set not to auto-lock |

## Timing & load

- Target: a few minutes online per account per run, 3x/week, one account at a time.
- The phone does the work natively, so there is no host CPU/RAM concern at all.