# 06 — Runbook

Operational guide for the people running the bubbler day-to-day. In v2 the only moving parts
are **Vercel** and the **phone** — there is no host computer, USB tether, or tunnel.

## 1. Phone bring-up checklist

1. Phone on WiFi, charger wired, jailbreak alive (check: Settings → Developer Mode present /
   a jailbreak app like Sileo opens).
   - After any *full reboot*: open the **Dopamine** app → **Jailbreak** → wait for respring.
     (Semi-untethered; ~1 min, no computer needed.)
2. Confirm the agent daemon is running:
   ```bash
   ssh mobile@<phone-ip>          # setup time only; disable after
   launchctl list | grep bubbler  # expect com.bubbler.agent
   cat /var/jb/usr/libexec/bubbler/agent.log | tail -50
   ```
3. Confirm Evony is installed and auto-updates are **off**.
4. Confirm the cloud is reachable:
   ```bash
   curl -s -H "Authorization: Bearer $TOKEN" https://YOUR-APP.vercel.app/api/agent/events
   ```
   → returns `{"event":null}` (a held empty response) or an event — both mean the line is open.

## 2. Installing / updating the on-device agent

```bash
scp -r phone-agent mobile@<phone-ip>:/var/jb/usr/libexec/bubbler/
ssh mobile@<phone-ip> 'launchctl unload /var/jb/Library/LaunchDaemons/com.bubbler.agent.plist'
ssh mobile@<phone-ip> 'launchctl load   /var/jb/Library/LaunchDaemons/com.bubbler.agent.plist'
```

## 3. Manual one-off bubble (ad-hoc)

Use the web app "Run now" against the account — it enqueues a `run` job, the open long-poll
delivers it within ~1s, the phone applies + verifies + closes + reports. Watch the evidence
screenshot land in the run record.

## 4. Linking / re-link (the interactive case)

1. Member goes to the wizard → enters Evony name + email.
2. Within ~1s the phone types the email and taps "send code" (watch the phone: it will boot
   Evony). The member checks their email for the 6 digits.
3. Member enters the code in the wizard → within ~1s the phone types it and confirms.
4. If the code expired (rare): phone taps resend, wizard says "expired, check email again."
5. Linked.

## 5. Common failures

| Symptom | Likely cause | Fix |
|---|---|---|
| No runs happen at all | Jailbreak inactive after reboot | Open Dopamine → Jailbreak (see §1) |
| `agent.log` empty / daemon not in `launchctl list` | plist not loaded / agent crashed at boot | re-run §2; read log at `/var/jb/usr/libexec/bubbler/agent.log` |
| `{"error":"unauthorized"}` from the events endpoint | token mismatch | update `config.yaml` + Vercel `AGENT_BEARER_TOKEN` |
| `{"event":null}` forever, phone never acts | **not** a failure — phone is just waiting; create a run/link to see action | schedule a run 2 min out, or "Run now" |
| Login shows 6-digit code dialog during a run | session revoked ("Clear Other Devices") or first link | web app → Re-link (new code) |
| Code expires during linking | user too slow one attempt | automatic — phone resends; nothing to do |
| Runs fail template match | Evony updated its UI / orientation changed | re-run calibration, update `phone-agent/calibration/` |
| Shield never goes up | account out of gems for 3-day truce | inform member (needs gems); note in run log |
| Phone screen off / unresponsive | sleep/charge quirk | device is set not to auto-lock; SSH in and restart the agent; physical check |

## 6. Dead-phone detection (no host computer anymore)

The phone must stay jailbroken + online for bubbles to happen. Add a tiny **heartbeat flag**:
the agent already calls Vercel ~every 45s — if a run is missed, the master list will show it.
For a proactive ping, point a free service (ntfy / WhatsApp) at the agent's `agent.log` via a
`tail`cron on the phone or a Vercel job that alerts when no `/api/agent/events` call was seen
for >10 min. This is optional but recommended once the circle grows.

## 7. Test checklist before adding new members

1. `GET /api/agent/events` returns a held `{"event":null}` → the phone is listening.
2. Schedule a run 2 min out for one account → it applies + verifies + closes + reports ok.
3. Idempotency: re-schedule same account while shield >24h → run skipped, ok.
4. Re-link path: clear phone from Evony settings → run fails `needs_code` → wizard re-link
   with a new code succeeds (including one deliberate "expire the code" pass to prove resend).
5. Reboot the phone → Dopamine re-jailbreak (manual) → run still works.