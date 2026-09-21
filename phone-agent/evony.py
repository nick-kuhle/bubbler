"""Evony run + link orchestration for the on-device agent.

Flow (per docs/04-evony-flow.md):

  run:  claim -> guard shield>24h? -> launch evony -> world view? -> open bubble
        -> 3-day truce (7500 gems) -> activate -> confirm -> verify countdown -> close
        -> report
  link: launch -> email login -> type email -> send code
        -> wait for code event -> type code -> confirm or RESEND -> verify world view
        -> report

The vision layer (see vision.py) does screen-truth guards against the calibration templates
in calibration/. Until calibration images exist the agent runs in *no-verify* mode: it
follows coordinates if provided, otherwise reports a calibration-not-ready error.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

log = logging.getLogger("bubbler.evony")


class CalibrationMissing(RuntimeError):
    pass


@dataclass
class Calibration:
    """Named screen targets. Each entry: {template: optional str, taps: [{"x","y"}...]}.

    Populated from phone-agent/calibration/ (see docs/04). Key screens:
      email_login, code_dialog, world_view, truce_3day, activate_confirm, shield_active
    """

    screens: dict[str, dict]
    shield_countdown_roi: tuple[int, int, int, int] | None = None


class EvonyController:
    def __init__(self, transport, vision, calibration: Calibration | None):
        self.t = transport
        self.v = vision
        self.cal = calibration

    # -- guards --------------------------------------------------------
    def on_screen(self, name: str, screenshot: bytes | None = None) -> bool:
        """Truth-guard: are we on the named screen?"""
        if not self.cal or name not in self.cal.screens:
            return False
        spec = self.cal.screens[name]
        template = spec.get("template")
        if not template:
            return False
        screen = screenshot if screenshot else self.t.screenshot()
        return self.v.find_template(screen, template) is not None

    def tap(self, screen: str, tap: str = "primary") -> None:
        if not self.cal or screen not in self.cal.screens:
            raise CalibrationMissing(f"no calibration for screen '{screen}'")
        point = self.cal.screens[screen].get("taps", {}).get(tap)
        if not point:
            raise CalibrationMissing(f"no tap '{tap}' for screen '{screen}'")
        self.t.tap(point["x"], point["y"])

    # -- run flow ------------------------------------------------------
    def open_evony(self, bundle_id: str) -> None:
        self.t.launch(bundle_id)
        time.sleep(6)  # cold launch; swap for wait-for-world-view guard when calibrated

    def to_world_view(self, email: str) -> str:
        """Return 'world' if we reach the world view, or 'needs_code' if stuck at a code
        prompt, or 'failed'. Types the email if we land on the login screen."""
        if self.on_screen("world_view"):
            return "world"
        if self.on_screen("code_dialog"):
            return "needs_code"
        if self.on_screen("email_login"):
            self.tap("email_login", "email")
            self.t.type_text(email)
            self.tap("email_login", "continue")
            time.sleep(2)
            return "needs_code" if self.on_screen("code_dialog") else "world"
        return "failed"

    def apply_3day_bubble(self) -> dict:
        """One bubble application pass on the world view. Returns a result dict.

        result keys: status(ok/failed/needs_code), shield_hours_remaining,
                     duration_ms, error
        """
        start = time.monotonic()
        try:
            self.tap("world_view", "bubble_menu")
            time.sleep(1)
            self.tap("truce_3day", "select")     # 3-day Truce, 7500 gems
            time.sleep(1)
            self.tap("activate_confirm", "activate")
            time.sleep(1)
            self.tap("activate_confirm", "confirm")
            time.sleep(2)
        except CalibrationMissing as exc:
            return {"status": "failed", "error": f"calibration: {exc}"}

        # Verify
        shot = self.t.screenshot()
        if not self.on_screen("shield_active", shot):
            return {"status": "failed", "error": "shield indicator not found after activate"}
        hours = self.shield_hours(shot)
        return {
            "status": "ok" if hours is None or hours >= 1 else "failed",
            "shield_hours_remaining": hours,
            "error": None,
        }

    def shield_hours(self, screenshot: bytes):
        if self.v and self.cal and self.cal.shield_countdown_roi:
            text = self.v.ocr_region(screenshot, self.cal.shield_countdown_roi)
            try:
                return self.v.parse_shield_countdown(text)
            except ValueError:
                return None
        return None  # no vision -> can't confirm remaining; status-only

    # -- link flow -----------------------------------------------------
    def link_login(self, email: str, get_code, report_expired):
        """Drive the interactive link. `get_code` blocks until the orchestrator delivers the
        submitted 6-digit code (long-poll). Returns result dict."""
        try:
            self.launch_login_screen()
            self.t.type_text(email)
            self.tap("email_login", "continue")  # triggers Evony to email the code
        except CalibrationMissing as exc:
            return {"status": "failed", "error": f"calibration: {exc}"}

        attempts = 0
        while True:
            code = get_code()                       # delivered ≈1s after user submits
            if code is None:
                return {"status": "failed", "error": "no code delivered"}
            self.t.type_text(code)
            try:
                self.tap("code_dialog", "confirm")
            except CalibrationMissing as exc:
                return {"status": "failed", "error": f"calibration: {exc}"}
            time.sleep(3)
            if self.on_screen("world_view"):
                return {"status": "linked"}
            attempts += 1
            if attempts >= 3:
                return {"status": "failed", "error": "could not confirm code after retries"}
            report_expired()                        # tell the wizard: ask the user again
            self.tap_resend()

    def launch_login_screen(self) -> None:
        # Navigate from launch to the email-login entry (calibration-dependent).
        self.tap("email_login", "email_button")

    def tap_resend(self) -> None:
        try:
            self.tap("code_dialog", "resend")       # fresh code + fresh 90s window
        except CalibrationMissing:
            log.warning("resend tap not calibrated; relying on user retrigger")

    def close_evony(self) -> None:
        self.t.home()


def run_one(evony: EvonyController, event: dict, bundle_id: str) -> dict:
    """Dispatch a single long-poll 'run' event -> result dict the agent reports.

    ('link' events are handled separately by agent.py because they interleave with
    subsequent 'code' events on the long-poll stream.)
    """
    evony.open_evony(bundle_id)
    try:
        state = evony.to_world_view(event.get("email", ""))
        if state == "needs_code":
            return {"status": "needs_code", "error": "session revoked or new device"}
        if state == "failed":
            return {"status": "failed", "error": "could not reach world view"}
        return evony.apply_3day_bubble()
    finally:
        evony.close_evony()