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

Why this device: **A12 (arm64e) has no public bootrom exploit** — checkm8 is A7–A11 only, so
palera1n/checkra1n **cannot** jailbreak it. Dopamine is the supported route: Dopamine 3 covers
iOS **15.0–17.3.1** on A8–A17/M1/M2, and specifically supported this A12 on 16.3.1 since
Dopamine 2.0 (Feb 2024).

## v2 target: phone standalone (**migration in progress**)

The goal is to retire the local machine that currently supports the tested linking setup.
In v2 the phone will run the agent as a LaunchDaemon and connect directly to Vercel over
WiFi. This has **not yet been validated end-to-end on device**: do not shut down the
working local setup until the [cutover tests](07-cutover.md) pass. SSH over WiFi is for
setup/debug only, not a runtime dependency.

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

After the host is retired, a phone reboot will be a **manual recovery step**:
1. Someone physically taps the Dopamine app → Jailbreak → respring.
2. A nice best-effort assist: **iOS Sleep/Wake + charging automation** can't open Dopamine,
   but a **Shortcuts automation** with a jailbreak helper can. Lowest-effort reliable option:
   leave auto-reboot off, and add a WhatsApp/ntfy check-in so the operator knows if the phone
   went dark. The runbook (`06`) covers detection.

## On-device agent installation (`phone-agent/`)

The Python agent is **intended to run on the phone**, with SSH over WiFi for setup only:

1. Install Python on the device (Procursus/Sileo), plus the dependencies needed by the
   link path (`requests`, `Pillow`, and a **working arm64e Python `frida` binding**); confirm
   its release is compatible with the on-phone frida-server. Check local ZXTouch input and
   screenshots. Do not assume a laptop Python wheel works on iOS.
2. Clone the reviewed GitHub revision on the phone (e.g. to `/var/mobile/bubbler`); see
   [07 — cutover](07-cutover.md). Copy `phone-agent/.` contents into
   `/var/jb/usr/libexec/bubbler/` **as a root shell on the phone**. The earlier
   `scp -r phone-agent .../bubbler/` form adds an extra `phone-agent/` directory and does
   not match the plist path. `phone-agent/bootstrap/install.sh` expects to be run from the
   checkout root on the phone with root privileges; stage dependencies and config before
   letting it start the daemon.
3. Store the real, mode-0600 `config.yaml` only in the installed agent directory, pointing
   at the Vercel production URL and matching agent bearer token. Put necessary calibration
   images on the phone by a separate, secure transfer (they are git-ignored).
4. Install/load `com.bubbler.agent.plist` in `/var/jb/Library/LaunchDaemons/` only when the
   config and local control services are ready. Verify `launchctl list`, logs, a phone-
   initiated long-poll, and a respring. Never commit the real config or keys.

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

## Calibration images for unattended runs (pending)

The committed JSON manifest has link-related taps only, and screenshots/templates are
excluded from Git. The operator's successful linking tests do not demonstrate that run
screens were calibrated or installed on the phone. Capture/transfer and verify:

1. Email-login and code dialogs (reuse privately held link assets if available).
2. Post-login server/world view.
3. Truce Agreement item — **3-day, 2500 gems**, and its activate + confirm dialogs.
4. Shield-active indicator with countdown readout/ROI.

Store the images securely on the phone under the installed agent's `calibration/`
directory, with manifest references (see `04-evony-flow.md`).

## Physical setup conventions
- Phone on WiFi (or LTE), charger wired, screen never auto-locks, orientation locked to the
  one used in calibration.
- Do not use this device for banking/personal email — it is a single-purpose appliance.
