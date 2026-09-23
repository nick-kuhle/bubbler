# 03 — Phone hardware / device build

## Device — as currently provisioned (verified working)

| Field | Value |
|---|---|
| Model | iPhone XR (`iPhone11,8`) |
| SoC | A12 Bionic — **arm64e** |
| iOS | **16.3.1** |
| Jailbreak | **Dopamine 3** (opa334), **rootless**, semi-untethered |
| Perma-signing | **TrollStore** (TrollInstallerX 1.0.3 → TrollStore) |
| Package manager | **Sileo** |
| Remote control | **OpenSSH** (rootless build, `/var/jb/usr/bin/...`) — over WiFi, for setup/debug only |
| UDID | `00008020-001D4CE10AB8003A` |

Why this device: **A12 (arm64e) has no public bootrom exploit** — checkm8 is A7–A11 only, so
palera1n/checkra1n **cannot** jailbreak it. Dopamine is the supported route: Dopamine 3 covers
iOS **15.0–17.3.1** on A8–A17/M1/M2, and specifically supported this A12 on 16.3.1 since
Dopamine 2.0 (Feb 2024).

## v2 change: the phone is now standalone

Previously the phone was USB-tethered to an always-on N150 host that ran the agent. **That
host is gone.** In v2 the phone itself runs the agent (a LaunchDaemon) and reaches the cloud
directly over WiFi/LTE. USB/SSH is only used during setup and debugging, not in operation.

## How it was jailbroken (one-time, already done — record only)

1. Installed **TrollInstallerX 1.0.3** IPA by sideloading with **Impactor v2.6.3** (free Apple ID).
2. Trusted the developer cert (Settings → General → VPN & Device Management) and enabled
   **Developer Mode** (Privacy & Security → Developer Mode → restart).
3. Ran TrollInstallerX → **Install TrollStore** → set a persistence helper app.
4. Downloaded **Dopamine** IPA via Safari, opened in TrollStore → Install.
5. Opened Dopamine → **Jailbreak** (rootless). Sileo installed.
6. Installed **OpenSSH** from Sileo. Set the Dopamine user password.

### Semi-untethered caveat (important without a host computer)

Dopamine is **semi-untethered**: after any full reboot the jailbreak is inactive until you
open the **Dopamine** app and tap **Jailbreak** again (~1 min, no computer needed). While it
is inactive, **nothing runs** — no LaunchDaemon, no agent, and bubbles won't be applied.

Since there is no longer a host machine to re-run the jailbreak for us, a phone reboot is a
**manual recovery step**:
1. Someone physically taps the Dopamine app → Jailbreak → respring.
2. A nice best-effort assist: **iOS Sleep/Wake + charging automation** can't open Dopamine,
   but a **Shortcuts automation** with a jailbreak helper can. Lowest-effort reliable option:
   leave auto-reboot off, and add a WhatsApp/ntfy check-in so the operator knows if the phone
   went dark. The runbook (`06`) covers detection.

## On-device agent installation (`phone-agent/`)

The Python agent runs **on the phone**, reached via SSH over WiFi (setup only):

1. Install Python on the device:
   - Sileo → **python3** (Procursus) and `pip` (`python3 -m ensurepip`).
2. Ship the agent folder to `/var/jb/usr/libexec/bubbler/` (scp via SSH):
   ```
   scp -r phone-agent mobile@<phone-ip>:/var/jb/usr/libexec/bubbler/
   ```
   (rootless: user `mobile` owns `/var/mobile`; keep the agent under `/var/jb` where the
   jailbreak userspace lives.)
3. Create `/var/jb/Library/LaunchDaemons/com.bubbler.agent.plist` so the agent starts after
   every respring/jailbreak (see `phone-agent/bootstrap/` for a ready plist + install script).
   It runs `python3 /var/jb/usr/libexec/bubbler/agent.py` with `stderr` to a log file.
4. Configure `/var/jb/usr/libexec/bubbler/config.yaml` (cloud URL + bearer token). Never
   commit real values.

## Automation layer (on-device, Frida)

The agent uses the Python Frida binding to attach to the running Evony process through a
local `frida-server` at `127.0.0.1:27042`. The rootless ZXTouch service provides system-level
Unity touches and JPEG screenshots at `127.0.0.1:6000`; Frida remains available for process
inspection and launch coordination. App close remains a local process termination.

The previous direct HID experiment was removed after it caused an Evony Unity crash on this
iOS 16.3.1 device. Do not send raw `IOHIDEvent` payloads from Frida. ZXTouch is the
rootless-compatible system-level touch boundary for this build.

The phone must have both `frida-server` and the matching Python `frida` package installed.
Check versions with `frida-server --version` and
`python3 -c 'import frida; print(frida.__version__)'`.

## Evony app on the device
- Installed from the App Store with the operator's Apple ID; iCloud sync (Photos/Messages/
  Keychain) is disabled on this dedicated device.
- **Automatic iOS updates remain OFF** — never risk the jailbreak or Evony compatibility.

## Calibration screenshots still needed (Phase "calibrate")
Reference images for the vision layer — capture from the live device during a manual
test login:
1. Email-login entry point (the *email-login* button exists only in the **mobile app**).
2. Email + 6-digit-code dialog.
3. Post-login server/world view.
4. Truce Agreement item — **3-day, 2500 gems**, and its activate + confirm dialogs.
5. Shield-active indicator with countdown readout.

Store these under `phone-agent/calibration/` with ROI maps (see `04-evony-flow.md`).

## Physical setup conventions
- Phone on WiFi (or LTE), charger wired, screen never auto-locks, orientation locked to the
  one used in calibration.
- Do not use this device for banking/personal email — it is a single-purpose appliance.
