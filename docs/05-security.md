# 05 — Security & privacy

## Stated to users (app copy)

> Your Evony email is stored so we can sign you in and apply your scheduled bubbles. The
> 6-digit code is used once and never stored.

This is a **private-circle app** — no open signup, invited members only — so the security bar
is low. Still, plaintext emails are personal data; keep the rules below.

## The key v2 change: the phone is outbound-only

In v2 there is **no inbound surface on the phone at all** (previously the USB/SSH path existed
on the LAN side). The phone's agent speaks HTTPS *out* to Vercel with a bearer token, and is
never reachable from the internet:
- Do **not** expose `sshd` on the phone to the LAN/WiFi in routine operation. It is for
  setup/debug only; disable it or firewall it off when not in use.
- The phone's only internet-facing identity is the Vercel endpoint it talks to, which
  requires `Authorization: Bearer <agent_token>`.
- Hermes Touch binds to `127.0.0.1` only — reachable only by the on-device agent.

## Data handling rules

1. **Emails: stored plainly, used as the login.** The app DB holds each user's email; the
   agent receives it in an event payload and types it into the Evony login during a run.
   Not stored on the phone between events (fetched per event, discarded after).
2. **6-digit codes: transient only.** During linking the code is stored **only** as a
   `jobs(kind=code)` row with a short TTL, and the row is **deleted the moment a long-poll
   delivers it**. Never persisted after use, never logged, never stored beyond seconds.
3. **Evony name: plaintext** (it's the master-list key and is public-facing within the app).
4. **No secrets in git.** Config templates only; real values live in environment/secrets
   (phone `config.yaml`, Vercel env vars, vault).
5. **Evidence screenshots** may contain the shield indicator and Evony UI (fine) but should
   have account-specific data minimized if it lands in object storage.

## Transport

- Phone ↔ cloud: HTTPS (TLS) both ways, outbound from the phone only.
- Phone-side: Hermes Touch on `127.0.0.1`; SSH (WiFi) for setup only, then disabled.

## Threat model (brief)

| Trust boundary | Assumption |
|---|---|
| Cloud compromise | Attacker gains the private circle's plaintext emails + schedules (risk accepted — trusted group) and auth session, but no Evony credentials other than what logins already require; codes were transient and already deleted |
| Agent compromise (phone) | Attacker with the phone could command the game (control plane) — mitigate by locking the device, keeping agent config token-rotatable, least-privilege file perms |
| Phone loss/reboot | Jailbreak inert until re-run (semi-untethered); device has no personal data beyond game data — it's a game-only appliance |

## Ops guidelines

- Rotate the agent bearer token and any SSH password periodically / on staff change.
- Keep the Evony session valid by *not* running concurrent applies and *not* idling in-game.
- Do not ship or sell this tool (ToS violation); keep distribution to the trusted circle.