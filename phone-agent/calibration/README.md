Calibration assets live here: reference screenshots + ROI maps (yaml), captured from the
live device during the calibrate phase (see docs/03 § Calibration and docs/04 § Vision).

Template name (PNG)        Screen it proves
-------------------------  -----------------------------------------
email_login.png            email-login entry button (mobile app only)
code_dialog.png            6-digit code entry (with countdown)
world_view.png             post-login server/world screen
truce_3day.png             the 3-day truce item (2500 gems)
activate_confirm.png       activate / confirm dialogs
shield_active.png          shield indicator (ROI YAML has the countdown crop)

Each screenshot may be paired with a `<name>.yaml` describing tap points, e.g.
email_login.yaml:
    taps:
      email_button:    {x: 50, y: 248}
      email:           {x: 540, y: 780}
      continue:        {x: 540, y: 900}
code_dialog.yaml:
    taps:
      confirm:  {x: 540, y: 700}
      resend:   {x: 540, y: 620}
shield_active.yaml:
    countdown_roi: [x, y, w, h]

Coordinates are relative to the canonical screenshot; the agent scales them if the device
reports a different resolution.

The agent reads `calibration.json` (a standard-library JSON manifest) so PyYAML is not
required on the phone. Example shape:

```json
{
  "screens": {
    "email_login": {
      "template": "email_login.png",
      "taps": {
        "email_button": {"x": 540, "y": 640},
        "email": {"x": 540, "y": 780},
        "continue": {"x": 540, "y": 900}
      }
    }
  },
  "shield_countdown_roi": [100, 100, 300, 80]
}
```

Capture real templates and coordinates from this phone before setting `vision.enabled` to
`true`; the example above is illustrative and is not a usable calibration.
