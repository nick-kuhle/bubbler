# 06 — Runbook

**Current status (2026-09-24):** Evony email/code linking has worked for new users and
emails in the existing setup (operator report). The phone agent now reports a **heartbeat**
(`agent_health`) on every long-poll and the dashboard/War Room show it, so a silent phone
is visible instead of an endless spinner. While coordinates and screens are calibrated the
agent runs on the laptop (SSH tunnels to the phone); the LaunchDaemon path is the target.
Follow [07 — cutover](07-cutover.md) before removing the local machine. The procedures
below are for **after** phone bring-up; do not use them as proof that cutover is complete.

## Where the agent runs (right now)

The repo's `phone-agent/config.yaml` is a **laptop test config**: `agent.py` runs on the
laptop and reaches the phone's Frida (27042) and ZXTouch (6000) over SSH tunnels. The
phone itself only needs `frida-server` + the ZXTouch app + Evony. The LaunchDaemon target
(`bootstrap/com.bubbler.agent.plist` via `bootstrap/install.sh`) is the cutover goal.
Run **one** agent at a time — a laptop agent and a phone daemon would poll-ping the same
jobs, and the heartbeat row would bounce between two hosts.

## Phone bring-up and daily health

1. Keep the phone on WiFi and a charger, orientation fixed, Evony auto-updates off. After a
   **full reboot**, open Dopamine and tap **Jailbreak** again; respring is not a full reboot.
   Then restart `frida-server` and the ZXTouch app if they did not come back.
2. During setup/debug (SSH is not required at runtime), use a root shell on the phone to
   check the installed agent and local services:
   ```sh
   /var/jb/usr/bin/python3 -c 'import requests, frida, PIL; print("dependencies OK")'
   /var/jb/usr/bin/frida-server --version
   launchctl list | grep com.bubbler.agent
   tail -n 50 /var/jb/usr/libexec/bubbler/agent.log
   ```
   Confirm ZXTouch input/screenshots locally and the actual frida-server/ZXTouch bind
   addresses. Frida Python bindings on iOS arm64e are a prerequisite, not assumed to work
   from a generic `pip install`. Avoid printing tokens or codes in logs/shell commands.
3. **Is the phone responding? Start here.** Run `phone-agent/bootstrap/phone_health.sh`
   from the laptop — it reports laptop agent/tunnels, phone services (frida-server,
   ZXTouch, Evony, installed daemon), and points at the cloud heartbeat:
   ```sh
   phone-agent/bootstrap/phone_health.sh
   ```
   Then open the War Room (`/master`) or the Test connection card: the "phone agent" chip
   shows `online`/`offline` from the real heartbeat. "Offline" means no authenticated poll
   for 2+ minutes. Remember a manual `curl /api/agent/events` returns `{event:null}` when
   there is simply no job — that proves nothing about phone liveness.
4. Laptop mode: open the tunnels and preflight phone services first, then start the agent:
   ```sh
   phone-agent/bootstrap/start_tunnels.sh   # checks frida-server + ZXTouch, opens 27042/6000
   systemctl start bubbler-agent            # or: python3 agent.py
   ```
   The systemd unit is `phone-agent/bootstrap/bubbler-agent.service`; the phone LaunchDaemon
   is `com.bubbler.agent.plist` (KeepAlive restarts crashes).
5. Inspect Vercel deployment/function logs (without secrets) and the user's wizard/run
   status when things behave oddly.

## Heartbeat and relaunch (implemented)

- Every authenticated long-poll to `/api/agent/events` stamps `agent_health` with
  `v`/`host`/`pid`. `GET /api/agent/status` (any logged-in user) reports online /
  last seen / last event / version; the Test connection card and War Room render it.
  Online window is 120s (a healthy poll cadence is ~46s).
- The agent **self-exits** when the cloud is unreachable for `cloud.max_failures`
  (default 8) consecutive polls or no poll round completes within `cloud.max_idle_sec`
  (default 300s), so a supervisor relaunches a fresh process.
- **Job lease:** `claimNext()` stamps `jobs.claimed_at` and auto-reclaims (`RECLAIM_AFTER_MS`
  90s) a job that was claimed but never reported — if the agent dies mid-flow, the
  restarted agent gets the job again instead of the frontend spinning forever.
- **Launchd is broken on this phone (Dopamine):** a LaunchDaemon is classified
  "daemon" with a **~6MB jetsam memory limit** (`JETSAM_REASON_MEMORY_PERPROCESSLIMIT`),
  and launchd SIGKILLs python+requests within seconds no matter the `ProcessType` or
  `JetsamMemoryLimit` plist keys. The phone therefore runs the agent under
  `bootstrap/run_agent_supervised.sh` **spawned from an SSH session** — such processes
  inherit sshd's higher jetsam class and run indefinitely. Start it as root:
  ```sh
  sudo sh -c 'nohup /var/jb/usr/libexec/bubbler/bootstrap/run_agent_supervised.sh >/dev/null 2>&1 &'
  ```
  This is manual after a reboot until a launchd-safe launcher (a small C/supervisor
  binary, or an app-context launch) exists.
- There is **no outbound alert** (email/push) yet — an operator must look at the card.
  That is an explicit cutover gate (docs/07).

## Installing/updating the agent

Use the reviewed GitHub revision cloned on the phone and install from its checkout root
with root privileges; see [07 — cutover](07-cutover.md) and
[`phone-agent/README.md`](../phone-agent/README.md). The agent's configured path is
`/var/jb/usr/libexec/bubbler/agent.py`; the plist is
`/var/jb/Library/LaunchDaemons/com.bubbler.agent.plist`. The old command
`scp -r phone-agent mobile@<phone-ip>:/var/jb/usr/libexec/bubbler/` was **wrong**: it
creates an extra directory level and user `mobile` may not be able to write under
`/var/jb/usr/libexec`. The current install script copies files and starts the daemon
immediately; prepare phone Python/Frida/ZXTouch, the private config and calibration first,
and fix/validate the bootstrap ordering during cutover. Never copy config or user DB into
Git or Vercel's filesystem.

## Test connection (who is on this phone?)

`Test connection` opens Evony, signs in as the member's email, reaches the **"login as
Player X?"** parchment (no code when the device session persists) and confirms. It then
opens the profile as a double-check. What the result means:

- **"Signed in as {name} — that's you."** The agent OCR'd the name on the login prompt (or
  profile) and it matched the member's `evony_name`. This requires on-phone vision plus the
  `login_prompt.name_roi` / `profile` calibration entries (`calibration/README.md`).
- **"…could not read the in-game name yet."** The sign-in completed but vision/calibration
  was off, so identity is only guaranteed by the email→account binding, not the display
  name. Calibrate the ROIs and enable vision to verify the name.
- **"login would reach a different account: X"** means the agent refused to sign in — the
  prompt's name did not match the member's `evony_name`.
- **"session revoked or new device — re-link"** means the typed email's session is gone, so
  Evony wants a fresh 6-digit code; run the wizard link instead.

## Linking / re-link test (controlled)

1. Confirm that the *phone-initiated* long-poll is working against the deployed Vercel URL
   and that only one agent is consuming jobs (stop the laptop-side agent before this test).
2. With a consenting test account and a **new email** (as already proven in the current
   setup), sign in through the **fixed, verified** app-auth flow, enter Evony name, then
   supply the emailed Evony 6-digit code in the wizard. Verify a `linked` status and that
   the phone closes Evony. Do not paste codes, screenshots with names, or tokens into PRs.
3. Try a second new email, then test an expired/resend attempt and a temporary WiFi loss.
   These latter recovery paths have **not** been proven; if a claimed code is lost, do not
   assume automatic retry. See [02 — architecture](02-architecture.md).

## Controlled bubble run (not yet verified)

Capture/transfer the calibration images, enable vision only once on-phone dependencies
work, and test on an account where the owner consents to spending 2500 gems. Try “Run now”
and verify world view, 3-day truce selection, shield countdown, evidence upload and Evony
shutdown. Then test the >24h skip, error/needs-code path, and a scheduled UTC slot. **Do
not enable unattended member schedules** until the run, retry/idempotency and offline tests
pass. The current code is not proven to protect against duplicate claims or a lost job.

## Common failures

| Symptom | Check / action |
|---|---|
| Dashboard says **phone agent offline** | Run `phone_health.sh`; restart laptop tunnels + agent, or on the phone re-open Dopamine after a reboot, start `frida-server` and the ZXTouch app, then `launchctl load` the daemon. No job runs until the card is green. |
| ZXTouch not running | It is a phone app, not a daemon — launch it from the home screen (SSH `ps aux \| grep -i zxtouch` to confirm). The agent/tunnels cannot tap or screenshot without it. |
| Test connection spins forever, no offline chip | The chip + polling come from `/api/agent/status`; check the poll response and the heartbeat row (`agent_health`) directly. |
| No jobs run after reboot | Dopamine is semi-untethered: manually re-jailbreak; check `frida-server`, ZXTouch, LaunchDaemon and the heartbeat. |
| Daemon restart loop / missing logs | Check installed config path and permissions, phone Python imports, and bootstrap ordering; read `agent.log` with secrets redacted. `cloud.max_idle_sec`/`max_failures` too small can cause a restart loop on slow networks. |
| 401 from `/api/agent/events` | Compare phone token to Vercel `AGENT_BEARER_TOKEN` via secure admin channels; rotate if exposed. |
| 500/empty data on Vercel | Confirm **persistent Postgres** (`DATABASE_URL`/`POSTGRES_URL`) exists at build *and* runtime; no serverless SQLite fallback. |
| Link hangs | Check whether a job was claimed and lost, not just the browser poll; confirm agent + ZXTouch/Frida, and repeat with a fresh code if needed. |
| Truce fails template matching | Recalibrate on this phone and check vision dependencies; linking tests do not validate run templates. |
| Phone is asleep/offline | Restore WiFi/charge and physically check screen; missed work is **not** automatically retried by the current queue. |

Before retiring the host, test WiFi interruption, respring and full-reboot recovery, and
finish the **outbound** offline alert (the heartbeat + status card exist; an email/push
alert does not). Until then, maintain a fallback and explicitly monitor the phone.