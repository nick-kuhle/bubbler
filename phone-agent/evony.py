"""Evony run + link orchestration for the on-device agent.

  run:  launch evony -> world view? -> open bubble -> activate shield -> verify countdown
        -> report (success | failed | expired) -> force-close Evony
  link: launch -> email login -> type email -> send code -> post awaiting_phone/awaiting_code
        -> wait for code event -> type code -> post linked/failed/expired -> force-close
  test: launch -> email login -> type email -> "login as Player X?" -> verify the name
        (OCR, refuse on mismatch) -> confirm -> profile double-check -> force-close

The vision layer (see vision.py) does screen-truth guards against the calibration templates
in calibration/. Until calibration images exist the agent runs in *no-verify* mode: it
follows coordinates if provided, otherwise reports a calibration-not-ready error.

After every run/link the app is force-closed with `killall -9` so the phone is free for the
real user (docs: "force-close app after every run").
"""

from __future__ import annotations

import io
import logging
import json
import re
import time
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger("bubbler.evony")

# How long a login bring-up may keep the game open before we give up and let the
# runner force-close it. The old flow bailed after ~30s and yanked Evony shut under
# the operator mid-login; 90s gives a slow phone boot + a human-time login + bubble.
LOGIN_GRACE_S = 90.0


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
    meta = raw.get("screen") if isinstance(raw.get("screen"), dict) else {}
    cal_w = int(meta.get("width") or 828)
    cal_h = int(meta.get("height") or 1792)
    return Calibration(screens=screens, shield_countdown_roi=roi, screen_size=(cal_w, cal_h))


@dataclass
class Calibration:
    """Named screen targets. Each entry: {template: optional str, taps: [{"x","y"}...]}.

    Populated from phone-agent/calibration/ (see docs/04). Key screens:
      email_login, code_dialog, world_view, truce_3day, activate_confirm, shield_active
    """

    screens: dict[str, dict]
    shield_countdown_roi: tuple[int, int, int, int] | None = None
    screen_size: tuple[int, int] = (828, 1792)


class EvonyController:
    def __init__(self, transport, vision, calibration: Calibration | None):
        self.t = transport
        self.v = vision
        self.cal = calibration
        self._device_size: tuple[int, int] | None = None
        # Optional hook(stage: str, png: bytes) used by test_login.py to save
        # stage screenshots for login verification + bubble-tap calibration.
        # The daemon path leaves it None (no extra screenshots taken).
        self.shot_hook = None
        # Detail of the most recent login_linked_account() call for run reports.
        self.last_login: dict = {}

    # -- debug screenshots ---------------------------------------------
    def _snap(self, stage: str):
        """Screenshot this stage when a shot_hook is installed, else no-op."""
        if self.shot_hook is None:
            return None
        try:
            shot = self.t.screenshot()
        except Exception as exc:
            log.warning("stage %s: screenshot failed: %s", stage, exc)
            return None
        try:
            self.shot_hook(stage, shot)
        except Exception as exc:
            log.warning("stage %s: shot hook failed: %s", stage, exc)
        return shot

    # -- guards --------------------------------------------------------
    def on_screen(self, name: str, screenshot: bytes | None = None) -> bool:
        """Truth-guard: are we on the named screen?"""
        if not self.cal or name not in self.cal.screens:
            return False
        if self.v is None:
            return False  # no-verify mode: template guards unavailable
        spec = self.cal.screens[name]
        template = spec.get("template")
        if not template:
            return False
        try:
            screen = screenshot if screenshot else self.t.screenshot()
        except Exception:
            return False
        try:
            return self.v.find_template(screen, template) is not None
        except Exception:
            return False

    def device_xy(self, x: int, y: int) -> tuple[int, int]:
        # ZXTouch screenshots are 828x1792 — same as iOS screenshots. Do not scale.
        return int(x), int(y)

    def tap(self, screen: str, tap: str = "primary") -> None:
        if not self.cal or screen not in self.cal.screens:
            raise CalibrationMissing(f"no calibration for screen '{screen}'")
        point = self.cal.screens[screen].get("taps", {}).get(tap)
        if not point:
            raise CalibrationMissing(f"no tap '{tap}' for screen '{screen}'")
        x, y = self.device_xy(int(point["x"]), int(point["y"]))
        self.t.tap(x, y)

    def tap_pair(self, screen: str, tap: str = "primary") -> None:
        self.tap(screen, tap)

    # -- run flow ------------------------------------------------------
    def open_evony(self, bundle_id: str, settle: float = 0.25) -> None:
        self.t.launch(bundle_id)
        time.sleep(settle)

    def to_world_view(self, email: str, bundle_id: str | None = None) -> str:
        """Log in as `email` and return 'world', 'needs_code' or 'failed'.

        Scheduled runs ALWAYS switch account via email, even if Evony looks
        already logged in — the phone serves many users and the previous
        session may belong to someone else. Detail lands in self.last_login.
        """
        res = self.login_linked_account(email, bundle_id=bundle_id)
        return res.get("status", "failed")

    # -- scheduled-run login (already-linked account, no code) ---------
    def login_linked_account(
        self,
        email: str,
        bundle_id: str | None = None,
        post_email_timeout: float = 15.0,
        world_timeout: float = 60.0,
        expected_name: str | None = None,
    ) -> dict:
        """Log in as an already-linked user: launch -> loading-icon taps ->
        type email -> Confirm -> verify the load-account dialog -> tap its
        Confirm (no 6-digit code).

        The load-account confirm ('…load the Lv30 account <name>?') is the
        account-switch gate: Evony only shows it once the typed email is
        accepted, so reaching the world without it means the switch never
        happened and whoever was already on the phone is still logged in — we
        refuse that as `failed` instead of claiming a wrong-account world.

        When `expected_name` is given AND name OCR is calibrated, the displayed
        name is verified before Confirm is tapped (refuse on mismatch).

        Returns {status, error?} with status one of:
          world      — post-login load-account confirm tapped, world actually reached
          needs_code — Evony asked for a 6-digit code: the device session was
                       revoked ("Clear Other Devices" / new device).
          failed     — anything else; `error` says what to check/fix.
        """
        self.last_login = {}
        try:
            if not self.launch_login_screen(bundle_id):
                return self._login_result(
                    "failed", "switch account dialog did not appear")
            if not email or "@" not in str(email):
                return self._login_result(
                    "failed", "run event has no email")
            log.info("dialog up; waiting before email")
            time.sleep(1.8)
            log.info("entering run email (len=%d)", len(email))
            pre: dict = {}

            def _snapshot_dialog():
                pre["sig"] = self._dialog_signature(self._grab())

            self._enter_email(email, after_type=_snapshot_dialog)
            self._snap("post_email")

            state = self._wait_for_post_email_state(post_email_timeout,
                                                    pre.get("sig"))
            log.info("post-email state: %s", state)
            if state == "code":
                return self._login_result(
                    "needs_code",
                    "Evony asked for a 6-digit code; session revoked, re-link required")
            if state == "email":
                # Confirm tap did not register; retry once before giving up.
                log.info("still on email entry; retrying confirm tap")
                pre["sig"] = self._dialog_signature(self._grab())
                self._tap_email_confirm()
                self._snap("post_email_retry")
                state = self._wait_for_post_email_state(post_email_timeout,
                                                        pre.get("sig"))
                log.info("post-email state after retry: %s", state)
                if state == "code":
                    return self._login_result(
                        "needs_code",
                        "Evony asked for a 6-digit code; session revoked, re-link required")
                if state != "load":
                    return self._login_result(
                        "failed", "email confirm did not advance past email entry")
            if state == "none":
                # The load-account confirm may lag a beat behind the email
                # confirm — give it a short window before treating 'no dialog'
                # as the auto-restore case.
                if self._wait_for_load_confirm(12.0):
                    state = "load"
                    log.info("post-email state revised: load")
                elif self._wait_for_world(20.0):
                    self._snap("world")
                    return self._login_result(
                        "failed",
                        "world reached without a load-account confirm; "
                        "account switch unverified (previous user may still be logged in)")
                return self._login_result(
                    "failed", "no confirmation dialog after email confirm")

            # Linked path: verify + tap the load-account Confirm (last step).
            accepted, confirmed = self._accept_load_confirm(expected_name)
            if not accepted:
                return self._login_result(
                    "failed",
                    "load-account would reach a different account: "
                    f"{confirmed or 'unknown'}")
            if confirmed:
                self.last_login["confirmed_name"] = confirmed
            self._snap("post_load_confirm")
            time.sleep(3.0)
            if self._code_dialog_visible():
                return self._login_result(
                    "needs_code",
                    "Evony asked for a 6-digit code after load confirm; re-link required")
            if self._wait_for_world(world_timeout):
                self._snap("world")
                return self._login_result("world")
            if self._dialog_visible():
                log.info("load-account dialog still up; tapping confirm again")
                self._confirm_load_account()
                if self._wait_for_world(30.0):
                    self._snap("world")
                    return self._login_result("world")
            if self._code_dialog_visible():
                return self._login_result(
                    "needs_code",
                    "Evony asked for a 6-digit code; session revoked, re-link required")
            return self._login_result(
                "failed", "world view not reached after load confirm")
        except CalibrationMissing as exc:
            return self._login_result("failed", f"calibration: {exc}")

    def _login_result(self, status: str, error: str | None = None) -> dict:
        res = {"status": status}
        if error:
            res["error"] = error
        self.last_login = dict(res)
        log.info("login result: %s%s", status, f" ({error})" if error else "")
        return res

    def missing_bubble_taps(self) -> list[str]:
        """Names of bubble taps not yet calibrated, e.g. 'world_view/bubble_menu'."""
        required = [
            ("world_view", "bubble_menu"),
            ("truce_3day", "select"),
            ("activate_confirm", "activate"),
            ("activate_confirm", "confirm"),
        ]
        missing = []
        for screen, tap in required:
            point = ((self.cal.screens.get(screen) or {}).get("taps", {})
                     .get(tap)) if self.cal else None
            if not point or point.get("x") is None or point.get("y") is None:
                missing.append(f"{screen}/{tap}")
        return missing

    def apply_3day_bubble(self) -> dict:
        """One bubble application pass on the world view. Returns a result dict.

        result keys: status(success/failed), shield_hours_remaining, screenshot, error
        """
        missing = self.missing_bubble_taps()
        if missing:
            return {
                "status": "failed",
                "error": ("bubble taps not calibrated: " + ", ".join(missing)
                          + ". Capture them with: python test_login.py --email <linked> "
                            "--record-taps (see phone-agent/calibration/README.md)"),
            }
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
    def link_login(self, email: str, get_code, report_expired, on_waiting_code=None, bundle_id: str | None = None):
        """Drive the interactive link. `get_code` blocks until the orchestrator delivers the
        submitted 6-digit code (long-poll). Returns result dict (linked/failed/expired)."""
        try:
            if not self.launch_login_screen(bundle_id):
                return {"status": "failed", "error": "switch account dialog did not appear"}
            if not email or "@" not in str(email):
                return {"status": "failed", "error": "link event has no email"}
            log.info("dialog up; waiting before email")
            time.sleep(1.8)
            log.info("entering email (len=%d)", len(email))
            self._enter_email(email)
            if not self._wait_for_code_dialog(12.0):
                log.warning("verify-email dialog not detected after email confirm")
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
                self._enter_code(code)
                self._confirm_load_account()
            except CalibrationMissing as extra:
                return {"status": "failed", "error": f"calibration: {extra}"}
            time.sleep(28)
            if self.on_screen("world_view"):
                return {"status": "linked"}
            if self._code_dialog_visible():
                attempts += 1
                if attempts >= 3:
                    return {"status": "failed", "error": "code was not accepted"}
                report_expired()
                self.tap_resend()
                continue
            if self._dialog_visible():
                log.info("load-account dialog still up; tapping confirm again")
                self._confirm_load_account()
                time.sleep(20)
                if self._dialog_visible() or self._code_dialog_visible():
                    return {"status": "failed", "error": "load-account confirm did not complete"}
            return {"status": "linked"}

    def _login_icon_point(self) -> tuple[int, int]:
        spec = (self.cal.screens.get("email_login") or {}) if self.cal else {}
        raw = (spec.get("taps") or {}).get("email_button") or {"x": 50, "y": 248}
        return int(raw["x"]), int(raw["y"])

    def _find_login_icon(self) -> tuple[int, int] | None:
        """Live position of the gold login icon on the loading screen: top-left
        of the `email_login` template match plus a calibrated icon offset.
        Evony only shows the icon during the splash/connecting window (~3-10s
        after launch), so the caller must press it fast and re-locate each poll.
        Returns None when vision/calibration can't pin it down this poll."""
        if self.v is None or not self.cal:
            return None
        spec = self.cal.screens.get("email_login") or {}
        tmpl = spec.get("template")
        offset = spec.get("icon_offset") or [44, 50]
        if not tmpl:
            return None
        try:
            raw, _img = self._grab_both()
            if raw is None:
                return None
            hit = self.v.find_template(raw, tmpl)
            if hit is None:
                return None
            return int(hit[0] + offset[0]), int(hit[1] + offset[1])
        except Exception:
            return None

    def _grab_raw(self):
        try:
            return self.t.screenshot()
        except Exception as exc:
            log.warning("screenshot failed: %s", exc)
            return None

    def _grab_both(self):
        """Return (raw_png_bytes, decoded PIL image) or (None, None)."""
        shot = self._grab_raw()
        if shot is None:
            return None, None
        try:
            from PIL import Image
            img = Image.open(io.BytesIO(shot)).convert("RGB")
        except Exception as exc:
            log.warning("screenshot decode failed: %s", exc)
            return None, None
        if img.size[0] < 800 or img.size[1] < 1600:
            return None, None
        return shot, img

    def _grab(self):
        return self._grab_both()[1]

    def _template_hit(self, shot: bytes | None, screen_name: str) -> bool | None:
        """Template check when vision is enabled; None when unavailable.

        Lets the operator drop dialog crops (e.g. the load-confirm screenshot)
        into calibration/ as `load_confirm.png` / `code_dialog.png` to override
        the pixel heuristics below.
        """
        if shot is None or self.v is None or not self.cal:
            return None
        spec = self.cal.screens.get(screen_name) or {}
        tmpl = spec.get("template")
        if not tmpl or not (self.v.library.dir / tmpl).is_file():
            return None
        try:
            return self.v.find_template(shot, tmpl) is not None
        except Exception:
            return None

    def _is_splash(self, img) -> bool:
        hits = n = 0
        for x in range(40, 780, 16):
            for y in range(80, 520, 16):
                r, g, b = img.getpixel((x, y))
                n += 1
                if r > 140 and g < 140 and b < 90 and r > g + 40 and r > b + 60:
                    hits += 1
        return n > 0 and (hits / n) >= 0.12

    def _is_switch_account(self, img) -> bool:
        rows_ok = rows = 0
        for y in range(720, 1000, 16):
            hits = n = 0
            for x in range(160, 670, 10):
                r, g, b = img.getpixel((x, y))
                n += 1
                parchment = (
                    155 <= r <= 200 and 135 <= g <= 175 and 90 <= b <= 135
                    and abs(r - g) <= 35 and (g - b) >= 20 and (r - b) >= 35
                )
                if parchment:
                    hits += 1
            rows += 1
            if n and hits / n >= 0.5:
                rows_ok += 1
        if not (rows > 0 and (rows_ok / rows) >= 0.35):
            return False
        cr, cg, cb = img.getpixel((250, 1100))
        return cr > 70 and cr > cg + 30 and cg < 90

    def _code_dialog_visible(self) -> bool:
        img = self._grab()
        if img is None:
            return False
        if self._code_dialog_present(img):
            log.info("verification code dialog visible")
            return True
        return False

    @staticmethod
    def _code_dialog_present(img) -> bool:
        cr, cg, cb = img.getpixel((250, 1100))
        red_cancel = cr > 70 and cr > cg + 30 and cg < 90
        if red_cancel:
            return False
        rows_ok = rows = 0
        for y in range(720, 1000, 16):
            hits = n = 0
            for x in range(160, 670, 10):
                r, g, b = img.getpixel((x, y))
                n += 1
                parchment = (
                    155 <= r <= 200 and 135 <= g <= 175 and 90 <= b <= 135
                    and abs(r - g) <= 35 and (g - b) >= 20 and (r - b) >= 35
                )
                if parchment:
                    hits += 1
            rows += 1
            if n and hits / n >= 0.5:
                rows_ok += 1
        return rows > 0 and (rows_ok / rows) >= 0.35

    def _is_load_confirm_dialog(self, img) -> bool:
        """True when the dark '…load the Lv30 account <name>?  Cancel | Confirm'
        overlay is on screen — the last step of an already-linked login.
        Structurally distinct from the parchment dialogs and from the (bright)
        world: a near-black overlay with two thin white text lines and the
        Cancel|Confirm button pair with an empty gap between them."""
        if img is None:
            return False
        w, h = img.size
        if w < 800 or h < 1600:
            return False

        def cov(y0, y1, x0, x1):
            hits = n = 0
            for y in range(y0, y1, 3):
                for x in range(x0, x1, 3):
                    r, g, b = img.getpixel((x, y))
                    n += 1
                    if (r + g + b) / 3 > 120:
                        hits += 1
            return (hits / n) if n else 0.0

        tot = n = 0
        for y in range(400, 1500, 40):
            for x in range(80, 750, 40):
                r, g, b = img.getpixel((x, y))
                tot += (r + g + b) / 3
                n += 1
        mean = tot / n
        if mean > 45.0:
            return False
        text = cov(841, 931, 92, 734)           # '…delete your current progress…' lines
        cancel = cov(1005, 1086, 180, 360)      # Cancel  (left button)
        confirm = cov(1005, 1086, 480, 700)     # Confirm (right button)
        gap = cov(1005, 1086, 385, 455)         # between the two buttons
        if text >= 0.10 and cancel >= 0.08 and confirm >= 0.05 and gap < 0.05:
            log.info("load-account confirm detected "
                     "(text=%.2f cancel=%.2f confirm=%.2f gap=%.2f mean=%.1f)",
                     text, cancel, confirm, gap, mean)
            return True
        return False

    def _world_looks_reached(self, img) -> bool:
        """True when the post-login world view looks reached: the app is not on
        a transition (splash) and no dialog is visible (parchment login/code or
        the dark load-account confirm)."""
        if img is None:
            return False
        if self._is_splash(img):
            return False
        if self._is_switch_account(img) or self._code_dialog_present(img):
            return False
        if self._is_load_confirm_dialog(img):
            return False
        return True

    def _wait_for_code_dialog(self, timeout: float = 20.0) -> bool:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self._code_dialog_visible():
                return True
            time.sleep(1.4)
        return False

    # -- post-email dialog classification (scheduled-run login) --------
    # After Confirm on the email entry, a linked account lands on the
    # load-account Confirm (last step, no code); a revoked session lands on
    # the 6-digit code dialog instead. Both share the parchment dialog chrome,
    # so we classify with: red-cancel pixel + code-box pixels + a dialog
    # content signature taken after typing, before the confirm tap.
    def _parchment_present(self, img) -> bool:
        rows_ok = rows = 0
        for y in range(720, 1000, 16):
            hits = n = 0
            for x in range(160, 670, 10):
                r, g, b = img.getpixel((x, y))
                n += 1
                parchment = (
                    155 <= r <= 200 and 135 <= g <= 175 and 90 <= b <= 135
                    and abs(r - g) <= 35 and (g - b) >= 20 and (r - b) >= 35
                )
                if parchment:
                    hits += 1
            rows += 1
            if n and hits / n >= 0.5:
                rows_ok += 1
        return rows > 0 and (rows_ok / rows) >= 0.35

    @staticmethod
    def _red_cancel_present(img) -> bool:
        cr, cg, cb = img.getpixel((250, 1100))
        return cr > 70 and cr > cg + 30 and cg < 90

    def _code_boxes_visible(self, img) -> bool:
        """True when the six code input boxes look present (bright box faces
        where parchment would otherwise be)."""
        bright = 0
        for x in (130, 241, 352, 463, 573, 684):
            r, g, b = img.getpixel((x, 813))
            if min(r, g, b) > 165 and b > 150:
                bright += 1
        return bright >= 4

    def _email_field_visible(self, img) -> bool:
        """True when ONE wide input box spans the email band — as opposed to
        the six separate code boxes. Decided on the gaps between code-box
        columns (x ≈ 186/297/408/519/629): bright gaps mean a continuous
        field; parchment gaps mean separate boxes (or no field at all)."""
        hits = n = 0
        for y in range(795, 865, 6):
            for x in (186, 297, 408, 519, 629):
                for dx in (-3, 0, 3):
                    r, g, b = img.getpixel((x + dx, y))
                    n += 1
                    if min(r, g, b) > 200:
                        hits += 1
        return n > 0 and (hits / n) >= 0.5

    def _dialog_signature(self, img):
        """Coarse content hash of the dialog region for before/after compare."""
        if img is None:
            return None
        sig = []
        for y in range(720, 1140, 30):
            for x in range(160, 670, 34):
                r, g, b = img.getpixel((x, y))
                sig.append((r >> 4, g >> 4, b >> 4))
        return sig

    @staticmethod
    def _sig_changed(before, after, threshold: float = 0.10) -> bool | None:
        if not before or not after or len(before) != len(after):
            return None
        diff = sum(1 for a, b in zip(before, after) if a != b)
        return (diff / len(before)) >= threshold

    def _classify_post_email(self, raw, img, pre_sig) -> str:
        """One poll: 'code' | 'load' | 'email' | 'none' | 'ambiguous'."""
        if self._template_hit(raw, "code_dialog"):
            return "code"
        if self._template_hit(raw, "load_confirm"):
            return "load"
        if img is None:
            return "ambiguous"
        if self._is_load_confirm_dialog(img):
            return "load"  # dark overlay, not the parchment dialogs
        if not self._parchment_present(img):
            return "none"
        red = self._red_cancel_present(img)
        boxes = self._code_boxes_visible(img)
        changed = self._sig_changed(pre_sig, self._dialog_signature(img))
        log.info("post-email poll: red=%s boxes=%s changed=%s",
                 red, boxes, changed)
        if boxes and not red:
            return "code"  # strong code signature, independent of similarity
        if changed is False:
            return "email"  # dialog content identical: confirm tap missed
        if red and changed:
            return "load"
        if red and not self._email_field_visible(img):
            return "load"  # no pre-snapshot fallback: parchment+red, no input
        if red:
            return "email"
        return "ambiguous"  # parchment, no red, no boxes (yet)

    def _wait_for_post_email_state(self, timeout: float = 15.0,
                                   pre_sig=None) -> str:
        """Poll until the post-email screen settles.

        Returns 'code' | 'load' | 'email' | 'none'. An ambiguous parchment
        (no red cancel, no boxes yet) resolves to 'code' — the legacy
        link-verified signature — because mis-tapping Confirm on a code
        dialog is worse than reporting needs_code and re-linking.
        """
        deadline = time.monotonic() + timeout
        last = "none"
        while time.monotonic() < deadline:
            raw, img = self._grab_both()
            state = self._classify_post_email(raw, img, pre_sig)
            if state in ("code", "load"):
                return state
            if state != "ambiguous":
                last = state
            elif last == "none":
                last = "ambiguous"
            time.sleep(1.4)
        if last == "ambiguous":
            log.info("post-email ambiguous parchment; treating as code dialog")
            return "code"
        return last

    def _wait_for_world(self, timeout: float = 60.0) -> bool:
        """True once the post-login world view looks reached: no splash, no
        parchment dialog, no dark load-account confirm, for two consecutive
        polls (or a world_view template hit when vision is enabled)."""
        deadline = time.monotonic() + timeout
        calm = 0
        while time.monotonic() < deadline:
            raw, img = self._grab_both()
            if self._template_hit(raw, "world_view"):
                log.info("world view confirmed by template")
                return True
            if self._world_looks_reached(img):
                calm += 1
                if calm >= 2:
                    log.info("world view reached (no splash/dialog)")
                    return True
            else:
                calm = 0
            time.sleep(2.0)
        return False

    def _enter_email(self, email: str, after_type=None) -> None:
        """Type the email and tap Confirm. `after_type` (optional hook) runs
        after typing, before the confirm tap — the run login uses it to snapshot
        the dialog so it can tell 'confirm missed' from 'advanced'."""
        log.info("tap email field")
        for n in range(1, 7):
            log.info("email field tap #%s", n)
            self.t.tap(414, 830)
            time.sleep(0.4)
        time.sleep(2.2)
        self.t.type_text(email)
        time.sleep(1.6)
        try:
            self.t.hide_keyboard()
        except Exception:
            pass
        time.sleep(1.2)
        if after_type is not None:
            try:
                after_type()
            except Exception as exc:
                log.warning("after_type hook failed: %s", exc)
        self._tap_email_confirm()

    def _tap_email_confirm(self) -> None:
        """Tap the parchment email-entry Continue. Touch first on a neutral
        parchment spot to finish any keyboard-dismiss animation, then press
        (hold) the button — instant taps drop during that transition."""
        try:
            self.t.tap(414, 720)
        except Exception:
            pass
        log.info("tap parchment neutral, then confirm")
        time.sleep(0.6)
        self.t.press(579, 1100, hold=0.25)
        time.sleep(2.8)

    def _code_spec(self) -> dict:
        return (self.cal.screens.get("code_dialog") or {}) if self.cal else {}

    def _code_tap(self, name: str, default: tuple[int, int]) -> tuple[int, int]:
        raw = (self._code_spec().get("taps") or {}).get(name) or {}
        return int(raw.get("x", default[0])), int(raw.get("y", default[1]))

    def _enter_code(self, code: str) -> None:
        digits = "".join(ch for ch in str(code or "") if ch.isdigit())
        if len(digits) != 6:
            raise CalibrationMissing(f"code must be 6 digits, got {code!r}")
        box_x, box_y = self._code_tap("code", (130, 813))
        log.info("tap first code box %s,%s", box_x, box_y)
        self.t.tap(box_x, box_y)
        time.sleep(0.5)
        self.t.tap(box_x, box_y)
        time.sleep(1.2)
        keypad = self._code_spec().get("keypad") or {}
        defaults = {
            "1": (142, 1244), "2": (414, 1244), "3": (686, 1244),
            "4": (142, 1362), "5": (414, 1362), "6": (686, 1362),
            "7": (142, 1474), "8": (414, 1474), "9": (686, 1474),
            "0": (414, 1586),
        }
        for i, digit in enumerate(digits, 1):
            raw = keypad.get(digit) or {}
            x, y = int(raw.get("x", defaults[digit][0])), int(raw.get("y", defaults[digit][1]))
            log.info("code digit %s/%s tap %s,%s", i, digit, x, y)
            self.t.tap(x, y)
            time.sleep(0.35)
        time.sleep(0.5)
        done_x, done_y = self._code_tap("done", (605, 1146))
        log.info("tap keyboard Done %s,%s", done_x, done_y)
        self.t.tap(done_x, done_y)
        time.sleep(0.6)
        try:
            self.t.hide_keyboard()
        except Exception:
            pass
        time.sleep(1.2)
        confirm_x, confirm_y = self._code_tap("confirm", (580, 1082))
        log.info("tap code confirm %s,%s", confirm_x, confirm_y)
        self.t.tap(confirm_x, confirm_y)

    def _load_confirm_point(self, default: tuple[int, int]) -> tuple[int, int]:
        """Tap point for the Confirm button on the dark load-account dialog."""
        if self.cal:
            spec = (self.cal.screens.get("load_confirm") or {})
            raw = ((spec.get("taps") or {}).get("confirm")
                   or (self._code_spec().get("taps") or {}).get("load_confirm"))
            if raw:
                return int(raw["x"]), int(raw["y"])
        return default

    def _confirm_load_account(self) -> None:
        x, y = self._load_confirm_point((579, 1100))
        log.info("waiting for load-account dialog")
        time.sleep(2.4)
        log.info("tap load-account confirm %s,%s", x, y)
        self.t.tap(x, y)

    def _wait_for_load_confirm(self, timeout: float = 12.0) -> bool:
        """True once the dark load-account confirm overlay appears."""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            raw, img = self._grab_both()
            if self._is_load_confirm_dialog(img):
                return True
            if self._template_hit(raw, "load_confirm"):
                return True
            time.sleep(1.0)
        return False

    def _load_confirm_name(self, checks: int = 1, interval: float = 0.5) -> str | None:
        """OCR the account name off the dark load-account confirm, or None.

        The ROI is the whole second text line ('…load the Lv30 account J.Blake');
        we keep only the trailing name after the last 'account/los tokens ('cuenta'
        in the Spanish rendering) and clean OCR garbage. The dialog animates in,
        so on a mid-frame OCR we retry a few times and only return text that
        reads like a plausible name. When the dialog is localized (it renders in
        the language of the account being *loaded*), the English 'account' token
        is absent and we return None — the caller then proceeds unverified, which
        is safe because merely seeing the dialog already proves the typed email
        was accepted.
        """
        if not self.v or not self.cal:
            return None
        spec = self.cal.screens.get("load_confirm") or {}
        roi = spec.get("name_roi")
        if not roi or len(roi) != 4:
            return None
        for attempt in range(checks):
            try:
                shot = self.t.screenshot()
                text = self.v.ocr_region(shot, tuple(int(v) for v in roi))
            except Exception as exc:
                log.warning("load-account name OCR failed: %s", exc)
                return None
            text = re.sub(r"^.*\baccount\b\s*", "", text.strip().rstrip("?!.")).strip()
            if self._plausible_name(text):
                return text
            if attempt + 1 < checks:
                time.sleep(interval)
        return None

    @staticmethod
    def _plausible_name(text: str) -> bool:
        """A readable in-game name: not OCR garbage (like 'g P S e A e M e'),
        has at least one real word (>=2 letters), and is not absurdly long."""
        if not text or len(text) > 40:
            return False
        tokens = text.split()
        if tokens and len(tokens) >= 3 and all(len(t) == 1 for t in tokens):
            return False  # spaced single-letter garbage
        return bool(re.search(r"[A-Za-z]{2,}", text))

    def _accept_load_confirm(self, expected_name: str | None) -> tuple[bool, str | None]:
        """Verify the load-account name (when known + calibratable) and tap Confirm.

        Returns (ok, confirmed_name). Like _accept_login_prompt: when the name
        cannot be read we proceed unverified, because merely *seeing* the dialog
        proves the typed email was accepted. A readable name that mismatches the
        expected member is the only hard refusal.
        """
        name = self._load_confirm_name(checks=3, interval=0.6)
        if name is None:
            log.warning("cannot read the load-account name (vision/calibration off "
                        "or unreadable frame); proceeding unverified")
            self._confirm_load_account()
            return True, None
        if expected_name and not _names_match(name, expected_name):
            log.warning("load-account name '%s' does NOT match expected '%s'; refusing",
                        name, expected_name)
            return False, name
        log.info("load-account name '%s'%s", name,
                 f" matches expected '{expected_name}'"
                 if expected_name else " (no expected check)")
        self._confirm_load_account()
        return True, name

    def _dialog_visible(self) -> bool:
        img = self._grab()
        if img is None:
            return False
        ok = self._is_switch_account(img)
        if ok:
            log.info("switch account dialog visible")
        return ok

    def _wait_for_splash(self, timeout: float = 18.0) -> bool:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            img = self._grab()
            if img is not None:
                if self._is_switch_account(img):
                    log.info("switch account already visible during splash wait")
                    return True
                if self._is_splash(img):
                    log.info("evony splash visible")
                    return True
            time.sleep(0.45)
        return False

    def launch_login_screen(self, bundle_id: str | None = None) -> bool:
        """Open Evony and wait up to LOGIN_GRACE_S (90s) for the switch-account dialog.

        The email-login dialog is found by screenshot heuristics; Evony on this phone
        can boot slowly and the operator may want the full window to finish a login +
        bubble. The old code bailed after ~30s and force-closed the game under whoever
        was on it, so now we keep the game open and gently re-tap the login icon for
        the whole grace window instead of aborting early.
        """
        if not self.cal or "email_login" not in self.cal.screens:
            raise CalibrationMissing("no calibration for screen 'email_login'")
        primary = self._login_icon_point()
        points: list[tuple[int, int]] = []
        for point in (primary, (44, 250), (56, 250), (40, 236)):
            if point not in points:
                points.append(point)
        log.info("login icon presses (px): %s", points)
        if bundle_id:
            self.t.launch(bundle_id)
        start = time.monotonic()
        deadline = start + LOGIN_GRACE_S
        last_tap = 0.0
        tap_count = 0
        locate = 0
        while time.monotonic() < deadline:
            if self._dialog_visible():
                return True
            now = time.monotonic()
            if now - last_tap >= 0.9:
                # Prefer the live icon center from the template; fall back to the
                # calibrated fixed points. Evony auto-logs-in as the previous user
                # once the loading screen passes, so press early and often.
                icon = self._find_login_icon()
                if icon is not None:
                    x, y = icon
                    locate += 1
                else:
                    x, y = points[tap_count % len(points)]
                tap_count += 1
                log.info("login icon press %s,%s #%s%s (+%.0fs)",
                         x, y, tap_count, " (located)" if locate else "", now - start)
                try:
                    # Press (hold), not tap: the app drops instant taps while the
                    # loading/connecting screen is still up, so the gold person icon
                    # would otherwise never open the switch-account dialog.
                    self.t.press(x, y, hold=0.4)
                except Exception as exc:
                    log.warning("login press failed: %s", exc)
                last_tap = now
            time.sleep(0.45)
        if locate == 0:
            log.warning("login icon was never located on the loading screen; "
                        "fixed-point presses only")
        log.warning("switch-account dialog did not appear within %ss", LOGIN_GRACE_S)
        return False

    def tap_resend(self) -> None:
        try:
            self.tap("code_dialog", "resend")       # fresh code + fresh 90s window
        except CalibrationMissing:
            log.warning("resend tap not calibrated; relying on user retrigger")

    # -- test-connection flow -------------------------------------------
    def test_login(self, email: str, expected_name: str,
                   bundle_id: str | None = None) -> dict:
        """Non-interactive "Test connection" sign-in.

        Mirrors link_login's credentials path (launch login screen -> type email ->
        confirm) but, with a persisted device session, Evony skips the 6-digit code and
        shows the "login as Player X?" parchment. Identity is confirmed on that prompt:
        the name is OCR'd (when the operator has calibrated `login_prompt.name_roi`) and
        we REFUSE to tap Login if it doesn't match the member's evony_name. Afterwards
        the profile is double-checked when a `profile` screen is calibrated.

        Returns {"status": "ok" | "failed", "error"?, "confirmed_name"?, "verified": bool}.
        """
        try:
            if not self.launch_login_screen(bundle_id):
                return {"status": "failed", "error": "switch account dialog did not appear"}
            if not email or "@" not in str(email):
                return {"status": "failed", "error": "test has no email"}
            log.info("dialog up; waiting before email")
            time.sleep(1.8)
            log.info("entering email (len=%d)", len(email))
            self._enter_email(email)
            return self._finish_test_login(expected_name or "")
        except CalibrationMissing as extra:
            return {"status": "failed", "error": f"calibration: {extra}"}

    def _finish_test_login(self, expected_name: str) -> dict:
        prompt_name: str | None = None
        state = self._post_email_state(20.0)
        if state == "needs_code":
            return {"status": "failed",
                    "error": "session revoked or new device — re-link from the wizard"}
        if state == "login_prompt":
            matched, prompt_name = self._accept_login_prompt(expected_name)
            if not matched:
                return {"status": "failed",
                        "error": f"login would reach a different account: {prompt_name or 'unknown'}"}
            if not self._wait_parchment_gone(25.0):
                return {"status": "failed", "error": "login confirm did not complete"}
        elif state == "world":
            log.info("already on the world view after email confirm")
        elif state == "unknown":
            return {"status": "failed",
                    "error": "could not reach the Evony login result after email confirm"}
        else:  # pragma: no cover — exhaustive
            return {"status": "failed", "error": "unexpected post-email state"}

        # Post-login identity double-check: open the profile and read the name.
        verified = state == "login_prompt" and bool(prompt_name)
        profile = self._profile_verification(expected_name, verified)
        confirmed = profile.get("confirmed_name") or prompt_name or None
        result = {"status": "ok", "verified": bool(profile.get("verified", verified))}
        if confirmed:
            result["confirmed_name"] = confirmed
        err = profile.get("error")
        if err:
            # Profile confirmed a *different* account: we are on the wrong profile.
            result = {"status": "failed", "error": err}
        return result

    def _post_email_state(self, timeout: float = 20.0) -> str:
        """After typing email + confirm: 'needs_code' | 'login_prompt' | 'world' | 'unknown'."""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            img = self._grab()
            if img is None:
                time.sleep(1.0)
                continue
            if self._code_dialog_visible():
                log.info("test: code dialog appeared (session revoked or fresh device)")
                return "needs_code"
            if self._is_switch_account(img):
                log.info("test: 'login as Player X?' parchment visible")
                return "login_prompt"
            if self.on_screen("world_view"):
                return "world"
            time.sleep(1.0)
        log.warning("test: no known post-email state within %ss", timeout)
        return "unknown"

    def _prompt_name(self) -> str | None:
        """Read the account name from the "login as Player X?" parchment, or None."""
        if not self.v or not self.cal:
            return None
        spec = self.cal.screens.get("login_prompt") or {}
        roi = spec.get("name_roi")
        if not roi or len(roi) != 4:
            return None
        try:
            shot = self.t.screenshot()
            text = self.v.ocr_region(shot, tuple(int(v) for v in roi))
        except Exception as exc:
            log.warning("prompt-name OCR failed: %s", exc)
            return None
        return text.strip() or None

    def _accept_login_prompt(self, expected_name: str) -> tuple[bool, str | None]:
        """OCR the prompt's name; tap Login only when it matches, else refuse."""
        prompt_name = self._prompt_name()
        if prompt_name is None:
            # No vision/ROI: the prompt is for the typed email's own account, so the
            # login is safe, but we cannot *verify* the name yet — report verified=false.
            log.warning("cannot read the login-prompt name (vision/calibration off); "
                        "proceeding unverified")
            self._confirm_load_account()
            return True, None
        if _names_match(prompt_name, expected_name):
            log.info("login prompt name '%s' matches expected '%s'", prompt_name, expected_name)
            self._confirm_load_account()
            return True, prompt_name
        log.warning("login prompt name '%s' does NOT match expected '%s'; refusing",
                    prompt_name, expected_name)
        return False, prompt_name

    def _wait_parchment_gone(self, timeout: float = 25.0) -> bool:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            img = self._grab()
            if img is None:
                time.sleep(1.0)
                continue
            if not self._is_switch_account(img):
                return True
            time.sleep(1.5)
        log.warning("load-account parchment still visible after %ss", timeout)
        return False

    def _profile_verification(self, expected_name: str,
                              fallback_verified: bool) -> dict:
        """Open the profile and OCR its name as a post-login double-check.

        Skipped (fallback only) until the operator calibrates a `profile` screen with a
        `profile_button` tap and a `name_roi` on THIS phone (docs/04, calibration README).
        """
        if not self.cal or "profile" not in self.cal.screens:
            return {"verified": fallback_verified}
        spec = self.cal.screens["profile"]
        button = (spec.get("taps") or {}).get("profile_button")
        roi = spec.get("name_roi")
        if not button or not roi or len(roi) != 4:
            return {"verified": fallback_verified}
        if not self.v:
            return {"verified": fallback_verified}
        try:
            self.tap("profile", "profile_button")
            time.sleep(2.2)
            shot = self.t.screenshot()
            text = (self.v.ocr_region(shot, tuple(int(v) for v in roi)) or "").strip()
        except Exception as exc:
            log.warning("profile verification failed: %s", exc)
            return {"verified": fallback_verified}
        if not text:
            return {"verified": fallback_verified}
        if _names_match(text, expected_name):
            log.info("profile name '%s' matches expected '%s'", text, expected_name)
            return {"verified": True, "confirmed_name": text}
        return {"verified": False, "confirmed_name": text,
                "error": f"profile shows a different account: {text}"}


def _names_match(a: str | None, b: str | None) -> bool:
    """Case/format-insensitive name equality (ignores the font's spacing/punctuation)."""
    def norm(s) -> str:
        return "".join(ch.lower() for ch in str(s or "") if ch.isalnum())
    x, y = norm(a), norm(b)
    return bool(x) and x == y


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
        # to_world_view launches Evony itself and ALWAYS switches account to
        # the event's email (the phone serves many users; whoever was logged
        # in last may be someone else).
        state = evony.to_world_view(event.get("email", ""), bundle_id=bundle_id)
        detail = (evony.last_login or {}).get("error")
        if state == "needs_code":
            result = {"status": "expired",
                      "error": detail or "session revoked or new device"}
        elif state == "failed":
            result = {"status": "failed",
                      "error": detail or "could not reach world view"}
        else:
            result = evony.apply_3day_bubble()
    finally:
        result.setdefault("screenshot", _best_shot(evony))
        evony.force_close_evony(bundle_id)
    return result
