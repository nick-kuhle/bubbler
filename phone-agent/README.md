# On-device agent (Python) — runs on the jailbroken iPhone

The agent replaces the old N150 home driver. It runs **on the phone itself** as a
LaunchDaemon, talks to Vercel over HTTPS (outbound only, long-poll), and drives the Evony
app through a local Frida bridge. There is no host computer in the target standalone layout.

## Layout

```
phone-agent/
  agent.py              # long-poll loop: GET /api/agent/events -> dispatch -> report
  evony.py              # run flow (bubble) + link flow (code, resend)
  vision.py             # OpenCV template match + OCR (on-device)
  iphone/transport.py   # on-device control surface: Frida session on 127.0.0.1:27042
  config.example.yaml   # config template (NO secrets)
  requirements.txt      # python deps
  bootstrap/            # LaunchDaemon plist + install script
  calibration/          # reference screenshots + ROI maps (populated in calibrate phase)
```

## Quick start (dev on your laptop first)

Agent and Evony orchestration can be developed/tested off-device:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp config.example.yaml config.yaml   # fill in the real Vercel URL + bearer token
python agent.py --once               # opens one long-poll round and exits
```

`iphone/frida_agent.bundle.js` is injected into Evony by the local `frida-server`. The Python agent
uses the `frida` binding and does not require Hermes Touch. `vision.py` imports
cv2/pytesseract lazily so the loop can run in "no-verify" mode.

## Deploy to the phone

Follow `../docs/06-runbook.md` §2 (scp to `/var/jb/usr/libexec/bubbler/`, toggle the
LaunchDaemon). The LaunchDaemon plist is in `bootstrap/`.

**No secrets in the repo** — `config.yaml` is git-ignored; commit only
`config.example.yaml`.

## Config keys

See `config.example.yaml`. The phone needs the Vercel base URL (`cloud.base_url`), the
bearer token (`cloud.agent_token`), and a local `frida-server`. Runs are driven entirely by
the cloud's per-slot scheduler (each `schedule.slots` row its own `weekday`/`time`, UTC),
so the agent holds the long-poll and executes whatever job the cloud emits. Frida defaults
to `127.0.0.1:27042`.

Frida attaches to Evony, while the rootless ZXTouch service provides system-level Unity
touches and JPEG screenshots on `127.0.0.1:6000`. This avoids undocumented iOS HID
constructors inside the game process.
