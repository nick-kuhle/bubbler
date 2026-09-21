Calibration assets live here: reference screenshots + ROI maps (yaml), captured from the
live device during the calibrate phase (see docs/03 § Calibration and docs/04 § Vision).

Template name (PNG)        Screen it proves
-------------------------  -----------------------------------------
email_login.png            email-login entry button (mobile app only)
code_dialog.png            6-digit code entry (with countdown)
world_view.png             post-login server/world screen
truce_3day.png             the 3-day truce item (7500 gems)
activate_confirm.png       activate / confirm dialogs
shield_active.png          shield indicator (ROI YAML has the countdown crop)

Each screenshot may be paired with a `<name>.yaml` describing tap points, e.g.
email_login.yaml:
    taps:
      email_button:    {x: 540, y: 640}
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