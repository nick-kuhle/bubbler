# 06 — Runbook

**Current status (2026-09-23):** Evony email/code linking has worked for new users and
emails in the existing setup (operator report). The standalone Vercel + phone deployment,
automated bubble runs and reboot recovery have not yet passed acceptance tests. Follow
[07 — cutover](07-cutover.md) before removing the local machine. The procedures below are
for **after** phone bring-up; do not use them as proof that cutover is complete.

## Phone bring-up and daily health

1. Keep the phone on WiFi and a charger, orientation fixed, Evony auto-updates off. After a
   **full reboot**, open Dopamine and tap **Jailbreak** again; respring is not a full reboot.
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
3. Inspect Vercel deployment/function logs (without secrets) and the user's wizard/run
   status. **There is no implemented heartbeat/alert yet**; add one before treating a
   silent phone as safe. A response of `{ "event": null }` to a manual API request means
   *that request* had no job, not that the phone is alive; manual polls can steal jobs.

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
| No jobs run after reboot | Dopamine is semi-untethered: manually re-jailbreak; check LaunchDaemon and services. |
| Daemon restart loop / missing logs | Check installed config path and permissions, phone Python imports, and bootstrap ordering; read `agent.log` with secrets redacted. |
| 401 from `/api/agent/events` | Compare phone token to Vercel `AGENT_BEARER_TOKEN` via secure admin channels; rotate if exposed. |
| 500/empty data on Vercel | Confirm **persistent Postgres** (`DATABASE_URL`/`POSTGRES_URL`) exists at build *and* runtime; no serverless SQLite fallback. |
| Link hangs | Check whether a job was claimed and lost, not just the browser poll; confirm agent + ZXTouch/Frida, and repeat with a fresh code if needed. |
| Truce fails template matching | Recalibrate on this phone and check vision dependencies; linking tests do not validate run templates. |
| Phone is asleep/offline | Restore WiFi/charge and physically check screen; missed work is **not** automatically retried by the current queue. |

Before retiring the host, test WiFi interruption, respring and full-reboot recovery, and
add a phone last-seen/alert mechanism. Until then, maintain a fallback and explicitly
monitor the phone.
