# bubbler

Scheduled, self-service peace-treaty (bubble) automation for **Evony: The King's Return**.

Users link their Evony account once (email + one-time 6-digit code), pick a schedule
(default Mon/Wed/Fri), and the system automatically applies the **3-day Truce Agreement**
(7500 gems), verifies the shield is up, and closes the game again. No emulator, no VPS,
no backend protocol reverse-engineering: the real Evony app runs on a real device.

## The device

The Evony client runs on a **jailbroken iPhone XR** (A12 Bionic, arm64e, iOS 16.3.1)
jailbroken with **Dopamine 3 (rootless)** and perma-signed via **TrollStore**. The phone is
plugged into the driver host over USB (the host is a low-power Intel N150 running Arch/Omarchy).

Why a jailbroken iPhone instead of an emulator:

| | Emulator / VPS | Jailbroken iPhone |
|---|---|---|
| Monthly cost | $6–11 | $0 |
| Ban fingerprint | Emulator + datacenter IP | Real device, residential IP |
| "Kicked by new device" | Session in an emulator | Phone **is** the device |
| RAM/CPU | Tight on a small host | None — phone runs it natively |

## How it works

```
[Cloud]  NextJS web app (Vercel) + DB
         wizard · schedules · master list · auth · API for the agent
                     │  agent polls for due jobs every minute
                     ▼
[Home]   Python agent (always-on on the N150)
         run lock · OpenCV template match + OCR verify · evidence screenshots
                     │  over USB (usbmuxd / iproxy → SSH, then Hermes Touch HTTP)
                     ▼
[Phone]  Jailbroken iPhone XR — the Evony player
         Evony is opened ONLY to apply a bubble, then closed.
```

Runtime model: **Evony is never left idle online** (a new-device login kicks the online
user, so we never sit in-game). The web app + agent run all the time; the game boots only
for the few minutes it takes to apply and verify a bubble, 3x/week.

## Repository layout

```
README.md          this file
docs/
  01-product.md    product spec: wizard, master list, schedules, re-link
  02-architecture.md  system design, API contract, DB schema
  03-phone-hardware.md device build: jailbreak, TrollStore, SSH, automation layer
  04-evony-flow.md  game mechanics + calibration/OCR targets
  05-security.md   hashed emails, code handling, ops guidelines
  06-runbook.md    bring-up, USB transport, troubleshooting
driver/            Python home agent (starter skeleton)
webapp/            cloud app scaffold notes + API/DB contract
```

## Status

- Device is **jailbroken and online** (Dopamine 3 rootless on iOS 16.3.1, OpenSSH over
  usbmuxd verified). Control via **SSH over USB works today**.
- **Hermes Touch** is the recommended on-screen automation layer (tap/type/screenshot HTTP
  API) and is **pending verification on rootless Dopamine / A12** — or adopt AutoTouch as
  the fallback.
- Driver, web app, and calibration screenshots: **to be built**.

## ToS / risk warning

This automates gameplay in a way that violates Evony's Terms of Service and carries an
account-ban risk. It is a personal tool for the operator and their trusted circle. The game
client is unmodified; runs are kept short and quiet to minimize detection. The risk is
accepted by the operator and documented for the team — do not ship or sell this.

## License

Private project. All rights reserved.