# 07 — Cutover: local machine → phone + GitHub + Vercel

**Not complete as of 2026-09-23.** The operator has successfully tested *Evony* email/code
linking with new users and different emails in the current setup. This playbook moves the
runtime off the local machine **without treating that link milestone as proof of a
standalone deployment or autonomous bubble runs**. Do not *decommission* the working
setup until all required checks below pass; pause its agent when testing the phone so
there is only one consumer.

| Concern | Final home | Must not live in GitHub |
|---|---|---|
| Source, docs, reviewed release | GitHub plus a read-only checkout on the phone | Real credentials, member DB, evidence, private calibration images |
| Browser UI, API, job/schedule logic | Vercel (`webapp/`) | Local SQLite in a function or a laptop-hosted backend |
| Users/jobs/runs, evidence, service secrets | Managed Postgres, Vercel Blob, Vercel environment settings | SQLite snapshots, blob tokens, bearer tokens |
| Evony, agent, Frida, ZXTouch, private config/calibration | Jailbroken phone on WiFi + power | Phone SSH keys, `config.yaml`, screenshots with member data |
| Laptop/desktop | Optional setup/debug terminal only | Any always-on agent, USB tunnel, local API or production DB |

## Gate 0 — Preserve the known-good state

- Record which process currently runs the agent, which backend/DB it talks to, and the
  *revision* that passed the new-user/new-email link tests. The repo alone does not tell
  us where the active process or real member database currently lives. Never assume this
  checkout's `webapp/data/bubbler.db` is the live data source: its tracked fixture was
  empty. Back up any real local database **outside GitHub**, with encryption and a tested
  restore. Back up the phone's current calibration/config separately and securely.
- Keep real account IDs, emails and one-time codes out of GitHub PRs and support chats.
  GitHub authentication is already configured for this coding session; **do not create a
  fine-grained PAT for us**. The repository is currently public, so the phone can clone
  it read-only over HTTPS. If it becomes private, prefer a phone-specific **read-only
  deploy key**; do not store a PAT in source, the phone's repo or chat.
- Arrange a reversible window and **one active agent at a time**. The present queue has
  no atomic claim or retry; two simultaneous agents can take the same job.

## Gate 1 — Fix production blockers in code (before real-user Vercel release)

1. Implement actual emailed, one-time web sign-in and an invite-only policy. Right now
   `POST /api/auth/login` creates a session from an email string with no inbox proof;
   `AUTH_SEED` is optional. Restrict agent endpoints to a separate credential, and add
   unauthorized/operator access tests. **Do not deploy real member data publicly before
   this is addressed.** Use only protected staging with synthetic data while working on it.
2. Make `claimNext()` an atomic claim with a lease/ack/retry or other recoverable queue
   design; bind submitted codes to the correct active link, purge expired code rows,
   handle lost long-poll responses and resend explicitly. Re-test the 90-second code
   window and update the privacy text to match actual DB retention. Check Vercel's
   long-running-function limits/cost for a 45-second hold on the chosen plan.
3. Make migrations safe against live data: `webapp/lib/db.ts` currently runs
   `DROP TABLE IF EXISTS schedules` on every `npm run build`. Test on a backup/staging
   Postgres DB first and implement a non-destructive versioned migration/import plan.
   If the active setup has users/slots/sessions in SQLite, explicitly map/migrate what is
   needed (and decide which sessions should be invalidated); **do not** upload a DB file
   to GitHub, Blob or Vercel's ephemeral filesystem.
4. Remove the laptop-specific SSH-key path and LAN address in
   `phone-agent/iphone/transport.py`; verify `uiopen` and process-close work locally in
   the phone's LaunchDaemon context. Update `phone-agent/bootstrap/install.sh` to install
   from the on-phone checkout without overwriting secrets, and do not load the daemon
   until dependencies, local services, config and calibration are ready.
5. Finish the 3-day truce calibration/vision/run tests and the skip/failed-run/re-link
   paths before enabling unattended schedules. The successful Evony link test proves
   none of these. Add a last-seen/alert mechanism so an offline phone is noticed.

These are **open gates**, not claims that this PR has implemented them.

## Gate 2 — Prepare Vercel, without moving real users yet

- Connect the GitHub repo to a Vercel project, set **Root Directory = `webapp`**, select
  Next.js and Node 22+; let Vercel deploy reviewed GitHub revisions. `npm run build`
  currently runs DB migrations: fix Gate 1 first, then test build/deploy against a
  dedicated staging database, not the real data. Ensure the app accepts the production
  hostname and the phone's `cloud.base_url` uses the same HTTPS origin.
- Provision a **persistent** hosted Postgres database and configure `DATABASE_URL` (or
  `POSTGRES_URL`) in Vercel's **build and runtime** environments, with pooling appropriate
  for serverless. Confirm the deployed app uses Postgres and retains synthetic users/jobs
  across cold starts/deployments; if the URL is missing, the current adapter falls back
  to *ephemeral* SQLite, which is not a valid production configuration.
- Set `AUTH_OPERATOR`, an enforced invite list (`AUTH_SEED`) and the separate
  `AGENT_BEARER_TOKEN` in Vercel *after* the auth fix; set `BLOB_READ_WRITE_TOKEN` only
  if evidence uploads are ready, with a retention/access decision (Blob URLs are
  currently public). Use distinct preview/staging and production data/secrets.
  **Never** add `.env.local`, URLs with embedded DB passwords, or tokens to this repo.
- From a controlled client, expect 401 for an unauthenticated agent request. Once the
  agent credential and DB are configured, check one **empty** held request returns
  `{ "event": null }` before using real jobs. An ad-hoc authenticated request consumes
  pending jobs, so do it only when there are none and the agent is stopped. Confirm actual
  hold duration and function logs; “~1 second” is not an SLA.

## Gate 3 — Prepare the phone from GitHub (not from an always-on laptop)

- On the phone, install `git` and Procursus Python with `requests`/`Pillow`, an **iOS
  arm64e-compatible** Python Frida binding matching frida-server, and the rootless ZXTouch
  service. Verify local control over `127.0.0.1:27042` and `127.0.0.1:6000`; verify
  installed listen addresses (including ZXTouch) are not internet-exposed.
- Use SSH over WiFi only for setup. In the phone user's home directory, obtain the
  reviewed source revision; for the currently public repo, for example:
  ```sh
  cd /var/mobile
  git clone https://github.com/nick-kuhle/bubbler.git
  cd bubbler
  git log -1 --oneline   # check this is the reviewed release revision
  ```
  When the repo becomes private, use a read-only deploy key instead. Do not copy a laptop
  SSH private key onto the phone. The source checkout is **not** the installed daemon;
  the plist expects `/var/jb/usr/libexec/bubbler/agent.py`.
- Once Gate 1's installer change is reviewed, run it on the phone in a root shell from
  the checkout root. Put a private, mode-0600 `config.yaml` **only** in the installed
  agent directory; set `cloud.base_url` to the real Vercel HTTPS URL,
  `cloud.agent_token` to the separate Vercel agent token, and both Frida/ZXTouch hosts
  to `127.0.0.1`. Transfer device-specific template images securely to its calibration
  directory; they are intentionally git-ignored. Never start the daemon before config
  and dependencies are ready. The current installer starts immediately, so **fix it
  first**; merely copying `phone-agent/` by `scp -r` to the plist's directory yields
  the wrong path.
- With the old agent stopped and no jobs pending, run a **single** on-phone agent poll
  (`python3 /var/jb/usr/libexec/bubbler/agent.py --once`) and check its log, then enable
  the LaunchDaemon and verify it reconnects on WiFi with no USB/tunnel/host process.
  If this fails, leave the local fallback available; do not run two agents together.

## Gate 4 — Acceptance tests, then retire the local host

- With production auth in place, repeat **two fresh Evony links with different new
  emails** against Vercel with only the *phone* agent running. Confirm wizard status
  `linked`, in-game load-account confirmation and Evony shutdown, without exposing
  codes in logs. Also test resend/expired code and a dropped/WiFi-interrupted long-poll.
- On a consenting test account with sufficient gems, validate “Run now,” evidence in
  Postgres/Blob, >24h shield skip, a failed/needs-code path and one real UTC scheduled
  slot. Assert that *one* job yields *one* run, even across retry/redeploy; never assume
  a claimed job automatically retries today.
- Respring the phone and re-check the agent, then **full reboot** it (manually re-run
  Dopamine) and re-check. Test WiFi loss/reconnect, external last-seen alert and a
  missed-slot recovery policy. Measure actual long-poll and browser-status latency.
- Freeze local writes, take a final encrypted DB backup, migrate/verify counts and the
  correct user/slot mappings (no member data in Git), then stop the local backend/agent.
  Repoint the phone only after Vercel data is authoritative. Monitor at least a full
  schedule cycle. Rotate tokens held by the old host, disable setup SSH exposure and
  remove any USB/tunnel/runtime dependencies. **Rollback:** stop the phone agent before
  re-enabling the old agent, restore a tested backup if needed, and never let both
  write/claim from the same queue.

**Information needed to execute the next phase:** identify where the active agent and
real DB live now; confirm the Vercel project and whether a managed Postgres/Blob store
already exist; and provide a *reachable phone address/SSH alias with key-based access*
through a secure setup (not a password/PAT in chat). This sandbox may not have network
access to your WiFi/LAN, so we may need you to run the on-phone commands; we can still
review outputs with secrets and account details redacted. We should perform the code
changes and staging checks before requesting any live phone access.
