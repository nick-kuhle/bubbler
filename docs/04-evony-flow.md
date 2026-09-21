# 04 — Evony game flow + verification

## Game mechanics we rely on

- **Bubble = Truce Agreement** item. We use the **3-day** variant at **7500 gems** (operator-confirmed).
- You **cannot activate a truce while an enemy army is actively attacking** your keep.
  Therefore we do **not** react to attacks — we keep an always-on shield topped up on
  schedule. (A shield with >24h remaining cancels most risk; the scheduler skips re-applying
  in that case.)
- **Login is email + one-time 6-digit code.** The email-login button exists **only in the
  mobile app** (the PC/web client uses Google/Facebook and is outdated — another reason the
  phone is the right host).
- Sessions persist on the device. A same-device re-login needs only the email typed (no code).
- **"Clear Other Devices"** in Evony settings revokes the device session → next run must
  re-link with a **fresh 6-digit code** (surfaced via the web-app re-link flow).
- **A new-device login kicks the online user.** We never leave Evony idling; we open it,
  apply, verify, close.

## Run flow (agent executes)

```
claim job (GET /jobs/due)
  │
  ├─ idempotency guard: shield already up with >24h remaining?  → mark ok, skip
  │
  ├─ open the phone control path (iproxy + Hermes Touch / SSH)
  │
  ├─ launch Evony
  ├─ state check: "on the post-login world view?"
  │     ├─ no, code prompt shown → abort as needs_code (surface re-link)
  │     └─ no, not logged in → type email (fetched from the job payload); if code prompt appears → abort as needs_code
  ├─ navigate: open shield/bubble item → select 3-day Truce (7500💎) → Activate → Confirm
  ├─ verify: screenshot → shield indicator present AND countdown readout ≥ 3 days − ε
  ├─ close Evony (back to home screen)
  │
  └─ report (POST /runs) + upload evidence screenshot
```

Per-step truth-guards: after every tap/type, take a screenshot and confirm we are on the
expected screen (template match). On mismatch → configured retries (default 2), then fail
with the OCR'd screen state for diagnosis.

## Vision layer

- **Template matching (OpenCV `matchTemplate`)** on reference screenshots + ROI maps stored
  in `driver/calibration/`:
  - `email_login.png` — entry button for email login
  - `code_dialog.png` — 6-digit code entry
  - `world_view.png` — post-login server/world screen
  - `truce_3day.png` — the 3-day truce item
  - `activate_confirm.png` — activate/confirm dialogs
  - `shield_active.png` — shield indicator (with crop for the countdown ROI)
- **OCR (tesseract)** runs on the countdown ROI to read remaining time (e.g. `2d 23h`).
  Shield "up" = indicator present; "healthy" = remaining > 24h.

### Coordinates
Fix the phone orientation and resolution once during calibration. All tap coordinates are
defined relative to that canonical screenshot; the driver maps them with a single
scale factor if the device reports a different resolution.

## Edge cases

| Case | Handling |
|---|---|
| Shield already >24h at schedule time | Skip run, mark ok, note remaining hours |
| Code prompt at login | **needs_code**; web app shows "Re-link (new code)" |
| Account switched to another device | Same as above (session revoked) |
| App update / new Evony UI version | Templates stale → run fails with mismatch; re-run calibration |
| Hermes Touch down | Retry transport; escalate to SSH-level recovery in runbook |
| Screen off / phone asleep | Wake via Hermes Touch or SSH; if stuck, physical check (device is USB-tethered and always-on) |

## Timing & load

- Target: a few minutes online per account per run, 3x/week, one account at a time.
- The N150 is a 4-core/3.5GB host — runs should happen in idle windows; the agent itself is
  tiny (<100MB).