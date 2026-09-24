# Python agent — target runtime: jailbroken iPhone

The Evony email/code link flow has worked with **new users and different email addresses**
in the operator's current setup. That test does not establish that the phone is already
running the agent independently. The target is a LaunchDaemon on the iPhone making only
outbound HTTPS long-polls to Vercel over WiFi. See the
[cutover playbook](../docs/07-cutover.md) before retiring the local machine.

## Layout

```
agent.py             GET /api/agent/events long-poll, dispatch and report
evony.py             in-game link + bubble orchestration
vision.py            template/OCR helpers (requires device calibration)
iphone/transport.py  ZXTouch + Frida support; currently has laptop-test SSH fallback
config.example.yaml  config template (no secrets)
bootstrap/           LaunchDaemon plist + installer, systemd unit + tunnel helpers
calibration/         JSON tap/ROI manifest; real image templates are git-ignored
```

## Heartbeat and relaunch

Every authenticated long-poll stamps `agent_health` on the cloud, tagged with the agent's
`v`/`host`/`pid` (GET /api/agent/events -> webapp `lib/agentHealth.ts`). A phone that
stops polling is "offline" there within ~2 minutes — the dashboard Test connection card
and the War Room show it instead of spinning silently (docs/06).

The loop also **self-exits** when the cloud is unreachable for `cloud.max_failures`
consecutive polls or no poll round completes within `cloud.max_idle_sec`. Any supervisor
then relaunches a fresh process:
- **On the phone (current):** `bootstrap/run_agent_supervised.sh` (a restart loop) spawned
  from an SSH session — launchd-daemon classes are jetsam-capped at ~6MB on Dopamine and
  SIGKILL python, so the plist path is blocked pending a higher-limit launcher (docs/06).
- **On the laptop (testing/calibrating):** `bootstrap/bubbler-agent.service` (systemd
  Restart=always) after `bootstrap/start_tunnels.sh` opened the Frida/ZXTouch tunnels.
- **On the phone (target):** `bootstrap/com.bubbler.agent.plist` (KeepAlive) via
  `bootstrap/install.sh` — keep this on file for when a launchd-safe launcher exists.

Only **one** agent consumes the queue at a time — a laptop and a phone agent poll-ping the
same jobs. Whichever is live is the one that owns the heartbeat `main` row.

## On-device prerequisites (not yet verified by this review)

- Procursus Python, `requests`, `Pillow`, a working **iOS arm64e** Python `frida`
  binding matching frida-server, and rootless ZXTouch. Installing a generic laptop
  Python/Frida wheel on iOS is not sufficient. Check versions/imports on the phone.
- `frida-server` on `127.0.0.1:27042`, ZXTouch locally reachable on port `6000`, and
  working screenshots/taps. Verify their actual listening interfaces and startup after
  respring. Game launch and process close must work *on device*, not through the existing
  laptop-key/LAN fallback in `iphone/transport.py` (to be removed during cutover).
- Device-specific `calibration.json` and image templates securely transferred to the
  installed calibration directory. Images are absent from Git by design. The manifest
  currently covers link-related taps, not a verified 3-day truce run. Do not switch on
  unattended bubble schedules before calibrating and testing verification.

## Installation target and config

The reviewed GitHub source can be cloned to `/var/mobile/bubbler` (repo is currently
public; no PAT required). Run the installer *on the phone* from the checkout root in a
root shell once its ordering is fixed: `phone-agent/bootstrap/install.sh` copies the
**contents** of this folder to `/var/jb/usr/libexec/bubbler/`, installs the plist at
`/var/jb/Library/LaunchDaemons/com.bubbler.agent.plist`, and currently **loads the daemon
immediately**. Stage dependencies and the real config before starting it; the cutover
playbook treats this as an explicit code-change gate.

`config.yaml` belongs **only** in the installed agent directory, with mode 0600 and the
correct Vercel HTTPS URL + `cloud.agent_token`. The template is `config.example.yaml`;
never commit credentials or copy them into a PR. Frida/ZXTouch hosts should both be
`127.0.0.1` in the final phone layout. Runs are driven by cloud `slots`, not the example
`config.yaml` schedule entries; the phone responds to delivered events. The agent's
`--once` option performs one poll and exits; use it only when the daemon is stopped and
no jobs are pending, or it may claim a real job.

For local development (not an always-on runtime), `python -m venv .venv` and
`pip install -r requirements.txt` can exercise the agent loop, but this does not prove
on-phone dependency compatibility. Do not run a laptop and phone agent against the same
queue concurrently. The `cloud.max_idle_sec`/`cloud.max_failures` watchdog knob acts like
launchd KeepAlive/systemd Restart=always; leaving watchdog off means a hung process is
invisible until the dashboard heartbeat flips to offline. See
[06 — runbook](../docs/06-runbook.md) for checks and failures.
