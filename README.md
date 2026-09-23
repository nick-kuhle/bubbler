# LOL automatic bubble scheduler

Scheduled, self-service truce agreement (bubble) automation for **Evony: The King's Return**,
for alliance **LOL** (we don't take things seriously — we just have fun).

Users link their Evony account (Evony name + email + one-time 6-digit code), pick a schedule
(default Mon morning / Wed morning / Fri evening UTC), and the system is intended to apply
and verify overlapping **3-day Truce Agreements** (2500 gems). No emulator or game-protocol
reverse-engineering: the real Evony app runs on a real device.

## Deployment topology (target — cutover pending)

The goal is **GitHub for source, Vercel for the Next.js app + persistent data, and the
jailbroken iPhone for the agent + Evony**. The current linking tests still rely on a local
machine; do not unplug it or describe the standalone deployment as verified yet.

```
                       ┌─────────────────────────────────────────────────┐
                       │  CLOUD — Vercel (Next.js + Postgres + Blob)    │
                       │  web UI · wizard · schedules · run ledger       │
                       │  GET /api/agent/events long-poll endpoint      │
                       └───────────────▲────────────────┬────────────────┘
                        user actions   │                │ event returned
                        (wizard, code) │                │ on phone's next
                                       │                │ outbound long-poll
                                       │                ▼
                       ┌───────────────┴────────────────────────────────┐
                       │  PHONE — jailbroken iPhone XR on WiFi         │
                       │  on-device Python agent (LaunchDaemon)         │
                       │  calls /api/agent/events → drives Evony       │
                       │  local Frida + ZXTouch → reports to cloud      │
                       └────────────────────────────────────────────────┘
```

The cloud is the proposed control plane (people, schedules, jobs, ledger). The phone runs
the real Evony client and the agent that drives it. The phone initiates all cloud traffic;
Vercel does not connect back to the phone. No laptop, USB tunnel, or inbound phone port is
needed **once the cutover is tested**.

### The “poor man's WebSocket”

This is **HTTPS long-polling, not a WebSocket**. The phone makes an authenticated
`GET /api/agent/events?hold=45`; the Vercel function checks the shared DB roughly every
1.5 seconds for a job and returns an event or `{ "event": null }` after the hold. The phone
immediately opens the next request. The browser polls wizard link status separately (every
3 seconds). Jobs can arrive quickly while the phone and cloud are healthy, but these are
**best-effort latencies**, not guaranteed delivery or a hard 1-second SLA. Network loss,
phone sleep/reboot, deployment errors, or an agent crash can delay work indefinitely.

### The 90-second code window (linking)

Evony's one-time code entry is time-sensitive. The implemented link path queues a code event
when the member submits the 6 digits in the wizard; the agent picks it up over the
long-poll, enters it in Evony, confirms the account load, and reports the result. Retry/resend
behavior and recovery from a dropped delivery still need standalone regression tests;
see [the cutover checklist](docs/07-cutover.md).

## Runtime model (target)

Evony should not be left idling online: a new-device login can kick the online user. The
web app and phone agent should stay available; Evony opens only for a link or short bubble
run and is closed afterward. Bubble application and verification are **not yet proven**.

## Repository layout

```
README.md                this file
docs/
  01-product.md          product spec and current gaps
  02-architecture.md     cloud/phone topology and actual long-poll contract
  03-phone-hardware.md   device build and on-device prerequisites
  04-evony-flow.md       game mechanics and run/link flows
  05-security.md         auth, token and code-handling caveats
  06-runbook.md          operation and phone troubleshooting
  07-cutover.md          staged local-machine → phone + Vercel migration
webapp/                  Next.js app and API (target: Vercel)
phone-agent/             Python agent, Evony orchestration and transport (target: phone)
```

## Status (2026-09-23; linking result reported by the operator)

- **Evony email/code linking: complete and successfully tested in the current setup with
  new users and different emails.** The flow enters the code in Evony, completes the in-game
  account load, and the link succeeds. This is *Evony account linking*, not app email
  authentication. We have not repeated this test against a phone-only + Vercel deployment.
- The agent loop and `/api/agent/events` long-poll path are implemented. **On-phone daemon,
  WiFi-only operation, Vercel/managed-Postgres deployment and reboot recovery are not yet
  verified.** The local machine is still part of the tested setup.
- Scheduled bubble application, screenshot calibration and shield verification still need
  end-to-end tests before unattended use.
- **Production blocker:** app sign-in currently creates a session for anyone who submits an
  allowed email; it does *not* send/verify a magic link. Do not expose real member accounts
  on a public deployment until this is fixed. Code delivery also temporarily stores codes
  in a DB job; see [security notes](docs/05-security.md).

Next: [07 — cutover plan](docs/07-cutover.md). Preserve the working local setup until every
gate there passes. A GitHub PAT is not needed for this repository session; never put a PAT,
phone token, private key, or member database in a PR.

## ToS / risk warning

This automates gameplay in a way that violates Evony's Terms of Service and carries an
account-ban risk. It is a personal tool for the operator and their trusted circle. The game
client is unmodified; runs are kept short and quiet to minimize detection. The risk is
accepted by the operator and documented for the team — do not ship or sell this.

## License

Private project. All rights reserved.
