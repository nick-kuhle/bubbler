# 05 — Security & privacy

## Stated to users (app copy)

> Your Evony email is encrypted and stored as a hash only. We never store your raw email or
> credentials, and the 6-digit code is used once and discarded.

This must be **literally true**. Load-bearing rules below.

## Data handling rules

1. **Emails: salted-hash at rest.** `sha256(salt + email)` per user, salt stored (per-user
   random). Never log the raw email. Never store it anywhere beyond the in-memory linking step.
2. **6-digit codes: memory-only.** Used during linking to log into Evony once; discarded after
   the run attempt. Not persisted, not logged.
3. **Evony name: plaintext** (it's the master-list key and is public-facing within the app).
4. **Passwords: hashed** (bcrypt/argon2), never stored raw.
5. **No secrets in git.** Config templates only; real values live in environment/secrets
   (agent `.env`, Vercel env vars, vault).
6. **Evidence screenshots** may contain the shield indicator and Evony UI (fine) but should
   have account-specific data minimized if it lands in object storage.

## Transport

- Agent ↔ cloud: HTTPS (TLS). If the app is not exposed, run it behind **Tailscale** for
  remote friends testers.
- Agent ↔ phone: USB only (usbmuxd). Never expose the phone's SSH/control ports on the LAN.
  Bind `iproxy` to `127.0.0.1` only.

## Threat model (brief)

| Trust boundary | Assumption |
|---|---|
| Cloud compromise | Attacker gains account/password hashes, no emails (hashed), no Evony creds |
| Agent compromise | Attacker could command the phone (control plane) — mitigate by least-privilege SSH user, HTTPS agent tokens, rotation |
| Phone loss/reboot | Jailbreak inert until re-run (semi-untethered); device has no personal data — it's a game-only appliance |

## Ops guidelines

- Rotate the agent bearer token and any SSH password periodically / on staff change.
- Keep the Evony session valid by *not* running concurrent applies and *not* idling in-game.
- Do not ship or sell this tool (ToS violation); keep distribution to the trusted circle.