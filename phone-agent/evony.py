"""Evony run + link orchestration for the on-device agent.

  run:  launch evony -> world view? -> open bubble -> activate shield -> verify countdown
        -> report (success | failed | expired) -> force-close Evony
  link: launch -> email login -> type email -> send code -> post awaiting_phone/awaiting_code
        -> wait for code event -> type code -> post linked/failed/expired -> force-close

The vision layer (see vision.py) does screen-truth guards against the calibration templates
in calibration/. Until calibration images exist the agent runs in *no-verify* mode: it
follows coordinates if provided, otherwise reports a calibration-not-ready error.

After every run/link the app is force-closed with `killall -9` so the phone is free for the
real user (docs: "force-close app after every run").
"""

from __future__ import annotations

import logging
import json
import time
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger("bubbler.evony")


class CalibrationMissing(RuntimeError):
    pass


def load_calibration(path: str) -> "Calibration":
    """Load the device calibration manifest without requiring PyYAML on iOS.

    The manifest is JSON so the on-device agent only needs Python's standard library;
    screenshot templates remain beside it in the same calibration directory.
    """
    manifest = Path(path)
    try:
        raw = json.loads(manifest.read_text())
    except FileNotFoundError as exc:
        raise CalibrationMissing(f"calibration manifest missing: {manifest}") from exc
    except json.JSONDecodeError as exc:
        raise CalibrationMissing(f"invalid calibration manifest: {manifest}") from exc

    if not isinstance(raw, dict):
        raise CalibrationMissing("calibration manifest must be an object")
    screens = raw.get("screens")
    if not isinstance(screens, dict) or not screens:
        raise CalibrationMissing("calibration manifest has no screens")
    roi = raw.get("shield_countdown_roi")
    if roi is not None:
        if not isinstance(roi, list) or len(roi) != 4 or not all(isinstance(v, int) for v in roi):
            raise CalibrationMissing("shield_countdown_roi must be four integers")
        roi = tuple(roi)
    return Calibration(screens=screens, shield_countdown_roi=roi)


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
        self.t.tap(int(point["x"]), int(point["y"]))

    def tap_pair(self, screen: str, tap: str = "primary") -> None:
        """Tap a calibrated pixel point and its @2x UIKit-point twin.

        Screenshots are 828x1792; ZXTouch may want pixels or points. Hitting both
        is harmless on this loading/login UI and covers either coordinate space.
        """
        if not self.cal or screen not in self.cal.screens:
            raise CalibrationMissing(f"no calibration for screen '{screen}'")
        point = self.cal.screens[screen].get("taps", {}).get(tap)
        if not point:
            raise CalibrationMissing(f"no tap '{tap}' for screen '{screen}'")
        x, y = int(point["x"]), int(point["y"])
        self.t.tap(x, y)
        time.sleep(0.05)
        self.t.tap(max(1, x // 2), max(1, y // 2))

    # -- run flow ------------------------------------------------------
    def open_evony(self, bundle_id: str, settle: float = 0.25) -> None:
        self.t.launch(bundle_id)
        time.sleep(settle)

    def to_world_view(self, email: str) -> str:
        """Return 'world' if we reach the world view, or 'needs_code' if stuck at a code
        prompt, or 'failed'. Types the email if we land on the login screen."""
        if self.on_screen("world_view"):
            return "world"
        if self.on_screen("code_dialog"):
            return "needs_code"
        if self.on_screen("email_login"):
            self.tap_pair("email_login", "email")
            self.t.type_text(email)
            self.tap_pair("email_login", "continue")
            time.sleep(2)
            return "needs_code" if self.on_screen("code_dialog") else "world"
        return "failed"

    def apply_3day_bubble(self) -> dict:
        """One bubble application pass on the world view. Returns a result dict.

        result keys: status(success/failed), shield_hours_remaining, screenshot, error
        """
        try:
            self.tap("world_view", "bubble_menu")
            time.sleep(1)
            self.tap("truce_3day", "select")
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
            return {"status": "failed", "error": "shield indicator not found after activate",
                    "screenshot": shot}
        hours = self.shield_hours(shot)
        return {
            "status": "success" if hours is None or hours >= 1 else "failed",
            "shield_hours_remaining": hours,
            "error": None,
            "screenshot": shot,
        }

    def shield_hours(self, screenshot: bytes):
        if self.v and self.cal and self.cal.shield_countdown_roi:
            text = self.v.ocr_region(screenshot, self.cal.shield_countdown_roi)
            try:
                return self.v.parse_shield_countdown(text)
            except ValueError:
                return None
        return None  # no vision -> can't confirm remaining; status-only

    def force_close_evony(self, bundle_id: str) -> None:
        """Harden the close path, then terminate the Evony process."""
        self.t.force_close(bundle_id)

    # -- link flow -----------------------------------------------------
    def link_login(self, email: str, get_code, report_expired, on_waiting_code=None):
        """Drive the interactive link. `get_code` blocks until the orchestrator delivers the
        submitted 6-digit code (long-poll). Returns result dict (linked/failed/expired)."""
        try:
            self.launch_login_screen()
            time.sleep(0.5)
            self.tap_pair("email_login", "email")
            time.sleep(0.5)
            self.t.type_text(email)
            time.sleep(0.4)
            self.tap_pair("email_login", "continue")
            if on_waiting_code:
                on_waiting_code()
        except CalibrationMissing as extra:
            return {"status": "failed", "error": f"calibration: {extra}"}

        attempts = 0
        while True:
            code = get_code()                       # delivered ≈1s after user submits
            if code is None:
                return {"status": "expired", "error": "code entry window expired"}
            try:
                self.tap_pair("code_dialog", "code")
                time.sleep(0.4)
            except CalibrationMissing:
                pass
            self.t.type_text(code)
            try:
                self.tap_pair("code_dialog", "confirm")
            except CalibrationMissing as extra:
                return {"status": "failed", "error": f"calibration: {extra}"}
            time.sleep(4)
            if self.on_screen("world_view"):
                return {"status": "linked"}
            if self.v is None:
                # no-verify mode: code was typed; operator confirms on the phone
                return {"status": "linked"}
            attempts += 1
            if attempts >= 3:
                return {"status": "failed", "error": "could not confirm code after retries"}
            report_expired()                        # tell the wizard: ask the user again
            self.tap_resend()

    def _account_icon_points(self) -> list[tuple[int, int]]:
        """Top-left account icon: screenshot pixels plus @2x points, with jitter."""
        spec = (self.cal.screens.get("email_login") or {}) if self.cal else {}
        raw = (spec.get("taps") or {}).get("email_button") or {"x": 50, "y": 248}
        x, y = int(raw["x"]), int(raw["y"])
        px = [(x, y), (x - 16, y), (x + 16, y), (x, y - 18), (x, y + 18), (x + 12, y + 12)]
        pts = [(max(1, a // 2), max(1, b // 2)) for a, b in px]
        return [(a, b) for a, b in px + pts if a > 0 and b > 0]

    def launch_login_screen(self) -> None:
        """Hammer the top-left account icon for the whole loading screen.

        The gold person button is only tappable while Evony is loading/connecting.
        It is small and flaky — tap a cluster around it, repeatedly, in both
        pixel and point space, until the Switch Account dialog can appear.
        """
        if not self.cal or "email_login" not in self.cal.screens:
            raise CalibrationMissing("no calibration for screen 'email_login'")
        spec = self.cal.screens["email_login"]
        template = spec.get("template")
        try_tap = getattr(self.t, "try_tap_template", None)
        points = self._account_icon_points()
        deadline = time.monotonic() + 22
        i = 0
        while time.monotonic() < deadline:
            if template and try_tap and try_tap(template):
                time.sleep(0.5)
                return
            x, y = points[i % len(points)]
            self.t.tap(x, y)
            i += 1
            time.sleep(0.1)
        time.sleep(0.3)

    def tap_resend(self) -> None:
        try:
            self.tap("code_dialog", "resend")       # fresh code + fresh 90s window
        except CalibrationMissing:
            log.warning("resend tap not calibrated; relying on user retrigger")


def _best_shot(evony: EvonyController):
    try:
        return evony.t.screenshot()
    except Exception:
        return None


def run_one(evony: EvonyController, event: dict, bundle_id: str) -> dict:
    """Dispatch a single long-poll 'run' event -> result dict the agent reports.

    Result status ∈ success | failed | expired (the runs POST contract). Evony is
    force-closed (killall -9) no matter the outcome so the phone is free for the user.
    ('link' events are handled separately by agent.py because they interleave with
    subsequent 'code' events on the long-poll stream.)
    """
    result = {"status": "failed", "error": "run did not start"}
    try:
        evony.open_evony(bundle_id)
        state = evony.to_world_view(event.get("email", ""))
        if state == "needs_code":
            result = {"status": "expired", "error": "session revoked or new device"}
        elif state == "failed":
            result = {"status": "failed", "error": "could not reach world view"}
        else:
            result = evony.apply_3day_bubble()
    finally:
        result.setdefault("screenshot", _best_shot(evony))
        evony.force_close_evony(bundle_id)
    return result
