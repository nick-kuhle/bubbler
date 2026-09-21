# 06 — Runbook

Operational guide for the people running the home agent + device day-to-day.

## 1. Device bring-up checklist

1. Phone plugged into the N150 via USB; charger attached.
2. `idevice_id -l` → the XR's UDID `00008020-001D4CE10AB8003A` appears.
   - If empty: `sudo systemctl restart usbmuxd`, replug, unlock, accept "Trust This Computer".
3. If the jailbreak was rebooted out: open **Dopamine** on the phone → **Jailbreak** → wait
   for respring. (Semi-untethered; no computer needed.)
4. Ensure **Evony** is installed and auto-updates are **off** (phone-level and App Store).

## 2. Open the USB SSH tunnel

```bash
iproxy 4044:22 &
# verify
nc -z 127.0.0.1 4044 && echo open
ssh -p 4044 mobile@127.0.0.1   # password = the Dopamine-set user password
```

Note: local ports < 1024 need root on Linux — use 4044 (or any unprivileged port).

## 3. Manual one-off bubble (ad-hoc)

Use the web app "Run now" against the account; watch:
- scheduler claims the job → agent opens Evony → applies → verifies → closes → reports.
- Evidence screenshot in the run record.

## 4. Common failures

| Symptom | Likely cause | Fix |
|---|---|---|
| `Device '...' not found` / tunnel refused | usbmuxd stopped | `sudo systemctl restart usbmuxd`; replug |
| `UNIX authentication refused` | wrong password / auth method | use preferred `password` method; verify Dopamine password |
| Login shows 6-digit code dialog | session revoked ("Clear Other Devices") or first link | web app → Re-link (new code); enter fresh code once |
| Runs fail template match | Evony updated its UI / orientation changed | re-run calibration, update `driver/calibration/` |
| Shield never goes up | account out of gems for 3-day truce | inform member (needs gems); note in run log |
| iPhone screen off / unresponsive | sleep/charge quirk | the device is set not to auto-lock; SSH+Hermes wake; physical check |

## 5. Data recovery reference (done once, for the record)

The pre-wipe pull used the jailbroken phone over the same USB path:

```bash
iproxy 4044:22 &
# photos were copied from /var/mobile/Media/DCIM (rsync over ssh), verified by count
# messages: /var/mobile/Library/SMS/sms.db* + Attachments/ (tar stream over ssh)
# downloads: /var/mobile/Library/Mobile Documents/com~apple~CloudDocs/Downloads/
# local: ~/iPhone_backup/{sms,downloads,DCIM...}
# integrity: sqlite3 ~/iPhone_backup/sms/sms.db 'PRAGMA integrity_check;'  → ok
```

## 6. Test checklist before adding new members

1. `GET /jobs/due` empty → no phantom runs.
2. Schedule a run 2 min out for one account → it applies + verifies + closes + reports ok.
3. Idempotency: re-schedule same account while shield >24h → run skipped, ok.
4. Re-link path: clear phone from Evony settings → run fails `needs_code` → re-link with new
   code succeeds.
5. Reboot the phone → Dopamine re-jailbreak → run still works (semi-untethered path).