# bubbler

Scheduled, self-service peace-treaty (bubble) automation for **Evony: The King's Return**.

Users link their Evony account once (Evony name + email + one-time 6-digit code), pick a
schedule (default Mon/Wed/Fri), and the system automatically applies the **3-day Truce
Agreement** (7500 gems), verifies the shield is up, and closes the game again. No emulator,
no VPS, no backend protocol reverse-engineering: the real Evony app runs on a real device.

## Topology (v2 — zero always-on host machines)

Everything smart lives in one place — **Vercel**. The only hardware in the loop is the
jailbroken iPhone itself. There is no home server, no N150, no USB tethering, no tunnel, no
domain.

```
                       ┌─────────────────────────────────────────────────┐
                       │  CLOUD — Vercel (NextJS + Postgres + Blob)     │
                       │  email auth · wizard · schedules · master list  │
                       │  scheduler (computed at poll time)              │
                       │  long-poll event stream · run/evidence ledger   │
                       └───────────────▲────────────────┬────────────────┘
                        user actions   │                │ event delivered
                        (wizard, code) │                │ via always-open
                                       │                │ long-poll (≈1s)
                                       │                ▼
                       ┌───────────────┴────────────────────────────────┐
                       │  PHONE — jailbroken iPhone XR (always-on)      │
                       │  on-device Python agent (LaunchDaemon)         │
                       │  long-polls /api/agent/events → drives Evony   │
                       │  via Hermes Touch (tap/type/screenshot, local) │
                       │  OpenCV/Apple Vision verify → reports to cloud │
                       └────────────────────────────────────────────────┘
```

The cloud is the **brain** (schedules, auth, people, ledger). The phone is the **hands and
the player** in one device: it runs the real Evony client, and a tiny Python agent on the
same device drives and verifies it.

### How the always-on line works (long-polling)

Instead of polling on a timer, the phone keeps **one HTTP request open** to Vercel
(`GET /api/agent/events`). Vercel holds the request (up to ~45s, under the Hobby function
cap) and answers it **within ~1 second** the moment anything is queued: a scheduled run, a
manual "Run now", a new linking session, or a submitted 6-digit code. After each response
the phone immediately re-opens the line. There is no 5-minute lag anywhere; the worst case
is one hold period (~45–50s).

### The 90-second code window (linking)

Evony only shows a 6-digit code entry for ~90 seconds, so first-time linking and re-links
cannot tolerate any poll latency. The long-poll makes code delivery near-instant; on top of
that the flow is **resend-tolerant**: if a code ever expires, the phone taps **resend**,
Evony emails a fresh code with a fresh 90s, and the wizard tells the user to check their
email again. The 90s is a per-attempt budget, never a hard deadline.

## Runtime model

Evony is **never left idle online** (a new-device login kicks the online user, so we never
sit in-game). The web app + the phone's agent run all the time; the game boots only for the
few minutes it takes to apply and verify a bubble, 3x/week.

## Repository layout

```
README.md          this file
docs/
  01-product.md    product spec: linking flow, wizard, master list, schedules
  02-architecture.md  system design: Vercel-converged topology, long-poll API, DB schema
  03-phone-hardware.md device build: jailbreak, Hermes Touch, agent bootstrap
  04-evony-flow.md  game mechanics + run/link flows + calibration targets
  05-security.md   outbound-only phone, tokens, code handling, ops guidelines
  06-runbook.md    phone bring-up, agent install, troubleshooting
webapp/            NextJS app (Vercel): screens + agent API (long-poll, runs, evidence)
phone-agent/       on-device Python agent (long-poll loop, Evony orchestration, vision)
```

## Status

- Device is **jailbroken and online** (Dopamine 3 rootless, iOS 16.3.1). It is now a
  standalone appliance on WiFi — no host computer is needed.
- Web app scaffold + phone-agent scaffold: **built** (see per-folder READMEs). Calibration
  screenshots, Hermes-Touch-on-rootless verification, and first end-to-end run remain.
- The **90s code window**, **long-poll event delivery**, and **resend-tolerant linking**
  are the core design and are implemented in the API contract + agent loop.

## ToS / risk warning

This automates gameplay in a way that violates Evony's Terms of Service and carries an
account-ban risk. It is a personal tool for the operator and their trusted circle. The game
client is unmodified; runs are kept short and quiet to minimize detection. The risk is
accepted by the operator and documented for the team — do not ship or sell this.

## License

Private project. All rights reserved.