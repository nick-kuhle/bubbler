# Calibration assets (phone-specific)

**Status:** The operator has successfully linked new users and email addresses in the
current setup. The committed `calibration.json` has link-related coordinates for an
iPhone XR (828 × 1792), plus the linked-login `load_confirm` taps (Confirm 579,1100 —
same position as the link-verified email confirm) and **empty, clearly-marked stubs** for
`world_view` / `truce_3day` / `activate_confirm` / `shield_active`. Image templates are
intentionally git-ignored and must be copied to the phone securely. Working linking is
not proof that unattended bubble runs are calibrated.

On-device vision caveat: python wheels for `Pillow`/`cv2`/`pytesseract` are **not
installable on this phone** (no iOS arm64 wheels; source builds fail). Until prebuilt
wheels or a ZXTouch `image_match` (task 21) based state-check exist, the agent runs in
**no-verify mode**: it taps, but refuses identity confirmation it cannot read and fails
flows that need a screen-state check (it reported "switch account dialog did not appear").
Capture the ROIs below and turn vision on only once on-phone vision actually works.

The agent reads **`calibration.json`**, not per-screen YAML files. For example:

```json
{
  "screen": {"width": 828, "height": 1792},
  "screens": {
    "email_login": {
      "template": "email_login.png",
      "taps": {"email_button": {"x": 50, "y": 248}}
    }
  }
}
```

The current controller uses tap coordinates as-is and assumes this screen size/orientation;
it does not scale them to other resolutions. Capture on **this device**, verify exact
screens/tap positions and guard all steps before enabling vision or unattended runs.
Store image templates and ROI metadata in the installed agent's `calibration/` directory
on the phone; do not add raw screenshots showing users/accounts to GitHub.

Required run targets still include `world_view`, `truce_3day`, `activate_confirm`,
`shield_active` and a shield countdown ROI. The code's vision helpers require additional
on-device OpenCV/OCR dependencies if enabled (`vision.enabled` defaults to `false` in
`config.example.yaml`); on-device install and screenshot matching must be tested. See
[game flow](../../docs/04-evony-flow.md) and [cutover checklist](../../docs/07-cutover.md).

## Identity verification for "Test connection"

`agent.py`'s test flow opens Evony, signs in as the member's email, reaches the "login as
Player X?" parchment (no code needed when the device session persists) and confirms the
account. It then opens the profile as a double-check. To make that check authoritative
(**verified=true**), capture two ROIs on THIS phone and add them to `calibration.json`:

1. `login_prompt.name_roi` — the `[x, y, w, h]` box around the account name inside the
   "login as Player X?" dialog. The agent refuses to log in when the OCR'd name does not
   match the member's `evony_name`.
2. `profile.profile_button` + `profile.name_roi` — the world-view tap that opens the
   profile (top-left monarch/keep button) and the box around the name on the profile
   screen (`taps: {"profile_button": {"x": .., "y": ..}}`).

Until those are calibrated the agent still completes the sign-in (the email is the
account's own) but reports `verified: false`, and the dashboard says so instead of
pretending it confirmed the name. Add `"name_roi": [0, 0, 0, 0]`-free entries only after
on-device capture; do not guess coordinates.
## Testing the linked login + calibrating bubble taps

On the phone, from the installed agent directory (`/var/jb/usr/libexec/bubbler/`):

```sh
# 1. Login test: logs in as an already-linked user (no code), saves one
#    screenshot per stage into shots/ — inspect post_email, post_load_confirm
#    and world before trusting the schedule.
python3 test_login.py --email member@example.com

# 2. Record the 3-day-bubble taps interactively (writes calibration.json,
#    keeps a .bak). Only world_view/bubble_menu is ever tap-tested live —
#    activate/confirm taps are typed, never tested (they spend 2500 gems).
python3 test_login.py --email member@example.com --record-taps

# 3. Full pass once taps exist: login + real bubble apply + verify.
python3 test_login.py --email member@example.com --and-bubble
```

Laptop-safe checklist (validates config + manifest, touches no phone):

```sh
python3 test_login.py --dry-run --config config.example.yaml
```

Optional template overrides: crop the load-account Confirm dialog (and the code
dialog) from a `shots/` capture and save them as `load_confirm.png` /
`code_dialog.png` in the installed calibration directory. When `vision.enabled`
is true, these override the pixel heuristics in run-login classification.
