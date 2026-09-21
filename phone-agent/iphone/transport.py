"""Transport: on-device control of the Evony app.

In v2 the agent runs ON the phone, so there is no USB/usbmuxd hop. The control surface is
Hermes Touch's HTTP API on localhost (same tap/type/screenshot contract as planned over USB,
now reached at 127.0.0.1 directly).

Fallbacks if Hermes Touch is not yet built for rootless Dopamine/A12:
  - launch/close via `uiopen`/`launchctl` over a local shell (best-effort, no taps)
  - screenshot via a Sileo `screencapture` CLI
Full tap automation needs Hermes Touch (or AutoTouch/accessibility tweak).
"""

from __future__ import annotations

import logging
import subprocess

import requests

log = logging.getLogger("bubbler.transport")


class HermesDown(RuntimeError):
    pass


class HermesTouch:
    """HTTP client for the on-device Hermes Touch daemon (127.0.0.1)."""

    def __init__(self, base_url: str = "http://127.0.0.1:8887", timeout: float = 30):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def _post(self, path: str, **json) -> dict:
        try:
            r = requests.post(f"{self.base_url}{path}", json=json, timeout=self.timeout)
            r.raise_for_status()
            return r.json() if r.content else {}
        except requests.RequestException as exc:  # covers connection + HTTP errors
            raise HermesDown(str(exc)) from exc

    def _get(self, path: str) -> bytes:
        try:
            r = requests.get(f"{self.base_url}{path}", timeout=self.timeout)
            r.raise_for_status()
            return r.content
        except requests.RequestException as exc:
            raise HermesDown(str(exc)) from exc

    def tap(self, x: int, y: int) -> None:
        """Tap a coordinate on the canonical-layout screen."""
        log.debug("tap %s,%s", x, y)
        self._post("/touch", x=int(x), y=int(y))

    def swipe(self, x1: int, y1: int, x2: int, y2: int) -> None:
        self._post("/swipe", x1=int(x1), y1=int(y1), x2=int(x2), y2=int(y2))

    def type_text(self, text: str) -> None:
        log.debug("type_text (len=%d)", len(text))
        self._post("/typeText", text=text)

    def launch(self, bundle_id: str) -> None:
        """Launch an app by bundle id (Hermes Touch POST /launch if supported)."""
        try:
            self._post("/launch", bundle=bundle_id)
        except HermesDown:
            # best-effort fallback: uiopen URL scheme or launchctl submit
            subprocess.run(
                ["uiopen", f"{bundle_id}://"],  # often unavailable on iOS shell
                capture_output=True,
                check=False,
            )

    def screenshot(self) -> bytes:
        """PNG bytes of the current screen."""
        return self._get("/screenshot")

    def home(self) -> None:
        """Back to the home screen, where possible."""
        try:
            self.tap(10, 10)  # placeholder: exact home/close gesture is calibration-dependent
        except HermesDown:
            pass


def wake_screen(command: str = "wake") -> None:
    """Best-effort wake (Hermes touch / iospinraw tweaks). No-op safe."""
    try:
        subprocess.run([command], capture_output=True, check=False)
    except FileNotFoundError:
        pass


def close_app(bundle_id: str) -> None:
    """Close the app via the selftest/running app mechanism if available; else no-op."""
    # On iOS there is no portable `kill <app>`; Hermes / Accessibility tweaks handle this.
    # This is a placeholder wired to the calibration plan (see docs/04).
    log.info("close_app(%s): deferred to Hermes/accessibility implementation", bundle_id)