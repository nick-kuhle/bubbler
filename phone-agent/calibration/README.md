# Calibration assets (phone-specific)

**Status:** The operator has successfully linked new users and email addresses in the
current setup. The committed `calibration.json` has link-related coordinates for an
iPhone XR (828 × 1792); it has **no complete world view / 3-day truce / shield verification
entries**. Image templates are intentionally git-ignored and must be copied to the phone
securely. Working linking is not proof that unattended bubble runs are calibrated.

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
