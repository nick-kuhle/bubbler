# 05 — Security & privacy (current state and cutover gates)

This is for a trusted circle, but the GitHub repository is currently public and the
planned web app will be internet-facing. **Do not expose real member accounts in
production until app authentication and code retention are fixed.** Working Evony
email/code linking is not proof that web sign-in is secure.

## Authentication: blocking issue

`POST /api/auth/login` currently accepts an email and immediately issues a session cookie;
it does **not** email a one-time link or verify ownership of the address. `AUTH_SEED` can
restrict which addresses are accepted, but when unset it accepts *any* email, and a known
allowed/`AUTH_OPERATOR` address could be impersonated. `verifyBearer()` for agent routes
also accepts a valid user session token as well as `AGENT_BEARER_TOKEN`.

Before a public Vercel release with real data: implement and test real email ownership
verification (one-time, short-lived magic link or equivalent), require an explicit invite
allowlist, protect operator-only actions, and make the agent endpoints accept *only* a
separate agent credential with rotation/revocation. Do not use Vercel deployment protection
as a substitute for user authentication. A GitHub PAT is **not** an agent token.

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

Knowing an allowed email address currently grants a login without inbox access; a stolen
agent credential can claim jobs/control the game. A dead phone misses work. Automated gameplay also
violates Evony's Terms of Service and has account-ban risk. Limit use to the trusted circle;
no open signup or commercial distribution.
