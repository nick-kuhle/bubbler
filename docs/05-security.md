# 05 — Security & privacy

## Stated to users (app copy)

> Your Evony email is stored so we can sign you in and apply your scheduled bubbles. The
> 6-digit code is used once and never stored.

This is a **private-circle app** — no open signup, invited members only — so the security bar
is low. Still, plaintext emails are personal data; keep the rules below.

## Data handling rules

1. **Emails: stored plainly, used as the login.** The app DB holds each user's email; the
   agent receives it per-job over HTTPS and types it into the Evony login during a run. It is
   not stored on the agent/phone between runs (fetched per job, discarded after).
2. **6-digit codes: memory-only.** Used during linking to log into Evony once; discarded after
   the run attempt. Not persisted, not logged.
3. **Evony name: plaintext** (it's the master-list key and is public-facing within the app).
4. **No secrets in git.** Config templates only; real values live in environment/secrets
   (agent `.env`, Vercel env vars, vault).
5. **Evidence screenshots** may contain the shield indicator and Evony UI (fine) but should
   have account-specific data minimized if it lands in object storage.

## Transport

- Agent ↔ cloud: HTTPS (TLS). If the app is not exposed, run it behind **Tailscale** for
  remote friends testers.
- Agent ↔ phone: USB only (usbmuxd). Never expose the phone's SSH/control ports on the LAN.
  Bind `iproxy` to `127.0.0.1` only.

## Threat model (brief)

| Trust boundary | Assumption |
|---|---|
| Cloud compromise | Attacker gains the private circle's plaintext emails + schedules (risk accepted — trusted group) and auth session, but no Evony credentials other than what logins already require; codes were never stored |
| Agent compromise | Attacker could command the phone (control plane) — mitigate by least-privilege SSH user, HTTPS agent tokens, rotation |
| Phone loss/reboot | Jailbreak inert until re-run (semi-untethered); device has no personal data beyond app data — it's a game-only appliance |

## Ops guidelines

- Rotate the agent bearer token and any SSH password periodically / on staff change.
- Keep the Evony session valid by *not* running concurrent applies and *not* idling in-game.
- Do not ship or sell this tool (ToS violation); keep distribution to the trusted circle.