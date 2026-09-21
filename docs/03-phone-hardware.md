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
| Remote control | **OpenSSH** (rootless build, `/var/jb/usr/bin/...`) |
| UDID | `00008020-001D4CE10AB8003A` |
| Physical | USB-connected to the N150 (original Apple/Lightning cable), screen-wake disabled |

Why this device: **A12 (arm64e) has no public bootrom exploit** — checkm8 is A7–A11 only, so
palera1n/checkra1n **cannot** jailbreak it. Dopamine is the supported route: Dopamine 3 covers
iOS **15.0–17.3.1** on A8–A17/M1/M2, and specifically supported this A12 on 16.3.1 since
Dopamine 2.0 (Feb 2024).

### Jailbreak state after a reboot
Dopamine is **semi-untethered**: after any restart, the jailbreak is inactive until you open
the **Dopamine** app and tap **Jailbreak** again (~1 min, no computer needed). The phone is a
permanently-plugged, always-on appliance, so this is rare.

## How it was jailbroken (one-time, already done — record only)

1. Installed **TrollInstallerX 1.0.3** IPA by sideloading with **Impactor v2.6.3** (free Apple ID).
2. Trusted the developer cert (Settings → General → VPN & Device Management) and enabled
   **Developer Mode** (Privacy & Security → Developer Mode → restart).
3. Ran TrollInstallerX → **Install TrollStore** → set a persistence helper app.
4. Downloaded **Dopamine** IPA (ellekit.space/dopamine) via Safari, opened in TrollStore → Install.
5. Opened Dopamine → **Jailbreak** (rootless). Sileo installed.
6. Installed **OpenSSH** from Sileo. Set the Dopamine user password (this is the SSH password).

## Control path (USB, working today)

On the N150 (Arch/Omarchy), `libimobiledevice` + `usbmuxd` are installed.

```bash
# 1. Confirm the device is visible on the bus
idevice_id -l                 # → 00008020-001D4CE10AB8003A

# 2. Open the USB SSH tunnel (pick a high, unprivileged local port — <1024 needs root)
iproxy 4044:22 &

# 3. SSH in as the mobile user (Dopamine-set password)
ssh -p 4044 mobile@127.0.0.1
```

Notes:
- Use user `mobile` (has access to `/var/mobile`, which is where Evony app data + user files live).
- Rootless jailbreak binaries live under **`/var/jb`** (e.g. `/var/jb/usr/bin/tar`, `/var/jb/usr/bin/scp`).
- If the tunnel is gone, check `usbmuxd` (`sudo systemctl restart usbmuxd`) and replug.

## Automation layer (the tap/type/screenshot surface)

**Recommended: Hermes Touch** — free, open-source; exposes an HTTP REST API on the device:

```
POST /touch      {"x": <int>, "y": <int>}     single tap / coordinate
POST /swipe      {"x1,","y1","x2","y2", ...}
POST /typeText   {"text": "..."}              paste/type text
GET  /screenshot                              PNG of the current screen
```

- Design assumption: Hermes Touch is reachable from the N150 over the same USB transport
  (e.g., forwarded via iproxy, or via its own port on `127.0.0.1`).
- **Open item for the team:** verify/build Hermes Touch for **rootless Dopamine / arm64e on
  iOS 16**. It predates rootless; it may need a rootless rebuild or a different injection
  approach (Dopamine already provides the PPL/SPTM bypass needed on A12/16.x).
- **Fallbacks**, in priority order:
  1. **AutoTouch** ($–, Sileo) — Lua/JS scripts + URL-scheme remote trigger.
  2. An **accessibility-based tweak** we build ourselves over the junk underlying Hermes.

### Screenshots for verification
Even with Hermes Touch, screenshot capture can also be provided by:
- `GET /screenshot` from Hermes Touch, or
- a jailbreak screenshot tool (e.g., `screencapture` CLI via Sileo/SSP), or
- OpenCV readback after `POST /touch` flows.

## Evony app on the device
- Installed from the App Store with the operator's Apple ID; iCloud sync (Photos/Messages/
  Keychain) is disabled on this dedicated device.
- **Automatic iOS updates remain OFF** — never risk the jailbreak or Evony compatibility.

## Calibration screenshots still needed (Phase "calibrate")
Reference images for the vision layer — capture from the live device during a manual
test login:
1. Email-login entry point (note: the *email-login* button exists only in the **mobile app**,
   not the PC/web client).
2. Email + 6-digit-code dialog.
3. Post-login server/world view.
4. Truce Agreement item — **3-day, 7500 gems**, and its activate + confirm dialogs.
5. Shield-active indicator with countdown readout.

Store these under `driver/calibration/` with ROI maps (see `04-evony-flow.md`).

## Physical setup conventions
- Charger wired, screen never auto-locks, orientation locked to the one used in calibration.
- Do not use this device for banking/personal email — it is a single-purpose appliance.