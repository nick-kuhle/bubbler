# 05 — Security & privacy (current state and cutover gates)

This is for a trusted circle, but the GitHub repository is currently public and the
planned web app will be internet-facing. **Do not expose real member accounts in
production until app authentication and code retention are fixed.** Working Evony
email/code linking is not proof that web sign-in is secure.

## Authentication

Web sign-in is now ownership-verified. `POST /api/auth/code` emails a 6-digit one-time
code (10-minute TTL, single use, stored only as a SHA-256 hash in `email_codes`,
constant-time compare, 5-guess cap, per-email 30s cooldown plus a 10-minute window rate
limit), and `POST /api/auth/login` issues the session cookie **only after** that code
verifies. A verified code creates the account on first use — the response's `created`
flag routes brand-new users to the Link-Account wizard — and logs in existing users. The
session table/cookie transport is unchanged, and `verifyBearer()` for agent routes still
accepts a valid user session token alongside `AGENT_BEARER_TOKEN`.

Delivery requires a mail provider (100%-free starter tiers are plenty for a small circle):
Resend (`RESEND_API_KEY` + `MAIL_FROM`) or any SMTP relay (`SMTP_HOST`/`SMTP_PORT`/
`SMTP_USER`/`SMTP_PASS` + `MAIL_FROM`). With neither configured, production fails closed
(`503 email-not-configured`) and local dev logs the code instead of sending. Set
`AUTH_SEED` (comma-separated allowlist) on a public deployment so only members may request
codes, keep `AUTH_OPERATOR` set for the admin, and get `AGENT_BEARER_TOKEN` rotation in
place before unattended phone use. Do not use Vercel deployment protection as a
substitute for user authentication, and never log code values, tokens or emails in traces/PRs.

## Code handling: correct the privacy promise

The former proposed copy, “the 6-digit code is used once and never stored,” is **not true
of the current implementation**. `POST /api/wizard/link/{id}/code` inserts the code as
plaintext in a `jobs(kind=code)` payload with a ~95-second expiry. `claimNext()` clears
the payload when claiming it, but the claimed row remains; an expired pending row is no
longer delivered but is not automatically deleted. Delivery is not acknowledged/retried
if the response is lost. The UI must not promise never-stored codes. Add expiry cleanup,
atomic claim/retry semantics, and accurate user-facing privacy text before production.
Never log code values, tokens or user emails in debug traces/PRs. Re-test linking after
changing this flow.

## Target phone boundary (not verified after host removal)

The agent should make **outbound HTTPS** requests to Vercel over WiFi; Vercel must never
need an inbound connection to the phone. The bearer secret lives only in the phone's
mode-0600 `config.yaml` and Vercel environment settings, not source control.

- Keep frida-server on `127.0.0.1:27042` and ZXTouch limited to loopback if the installed
  package allows it; verify the actual listening interfaces on the phone.
- SSH over WiFi is for *setup/debug only*, with key-based access. Disable or firewall it
  after bring-up; do not expose it to the public internet. On-device operations should
  not depend on the host's SSH key or LAN address.
- Phone loss or full reboot stops the semi-untethered jailbreak; Dopamine must be run
  manually again. Without the jailbreak and agent, schedules cannot run. Add health
  monitoring/alerts before relying on unattended operation.

## Data, storage and secrets

- Member emails and Evony names live in the app DB; emails are sent to the agent as needed
  for game login. Host a **persistent managed Postgres** for Vercel and limit who can
  read backups. No production DB/SQLite file should be in GitHub; calibration screenshots
  and evidence may include account details and also need restricted storage.
- Evidence is currently written to **public** Vercel Blob URLs. Do not enable uploads
  with sensitive screenshots until access/retention rules are decided.
- Keep passwords, phone SSH keys, PATs, agent bearer tokens, Vercel env files and real
  `config.yaml` out of Git, PRs, logs and chat. The tracked empty SQLite fixture is removed
  from the current tree, but that does not erase older Git history; audit history before
  relying on it to be free of personal data. Back up any *actual* local DB securely and
  migrate it separately — never add it to GitHub to move it to Vercel.
- Rotate the agent token after cutover (and on loss/compromise). For GitHub development,
  use the already configured `gh` session; the phone can clone a public repo without a PAT
  (or use a read-only deploy key if the repo becomes private).

## Risk notes

An allowed email no longer logs you in without inbox access, but a stolen agent
credential can still claim jobs/control the game. A dead phone misses work. Automated gameplay also
violates Evony's Terms of Service and has account-ban risk. Limit use to the trusted circle;
no open signup or commercial distribution.
