"""Frida transport for the on-device Evony controller.

The agent and frida-server both run on the jailbroken phone.  The Python Frida binding
attaches to the already-installed app and calls the small Objective-C bridge in
``frida_agent.js``.  No USB, Hermes, or host-side process is required.
"""

from __future__ import annotations

import logging
import socket
import subprocess
import time
from pathlib import Path

log = logging.getLogger("bubbler.transport")
SCRIPT = Path(__file__).with_name("frida_agent.bundle.js")


class FridaDown(RuntimeError):
    pass


class ZXTouchClient:
    """Minimal ZXTouch socket client for system-level Unity input and screenshots."""

    TOUCH = 10
    SCREENSHOT = 30

    def __init__(self, host: str = "127.0.0.1", port: int = 6000, timeout: float = 30):
        self.host = host
        self.port = int(port)
        self.timeout = timeout
        self._socket: socket.socket | None = None
        self._buffer = bytearray()

    def _connect(self) -> socket.socket:
        if self._socket is None:
            self._socket = socket.create_connection((self.host, self.port), self.timeout)
            self._socket.settimeout(self.timeout)
            self._buffer = bytearray()
        return self._socket

    def _reset(self) -> None:
        self.close()
        self._buffer = bytearray()

    def _send(self, task: int, *parts: object) -> None:
        payload = f"{int(task)}{(';;'.join(str(part) for part in parts))}\r\n"
        try:
            self._connect().sendall(payload.encode())
        except OSError:
            self._reset()
            self._connect().sendall(payload.encode())

    def _line(self) -> bytes:
        while b"\r\n" not in self._buffer:
            chunk = self._connect().recv(4096)
            if not chunk:
                raise FridaDown("ZXTouch connection closed")
            self._buffer.extend(chunk)
        end = self._buffer.index(b"\r\n") + 2
        line = bytes(self._buffer[:end])
        del self._buffer[:end]
        return line

    def tap(self, x: int, y: int) -> None:
        x10 = max(0, min(99999, int(round(x * 10))))
        y10 = max(0, min(99999, int(round(y * 10))))
        down = f"11{1:02d}{x10:05d}{y10:05d}"
        up = f"10{1:02d}{x10:05d}{y10:05d}"
        self._send(self.TOUCH, down)
        time.sleep(0.12)
        self._send(self.TOUCH, up)

    def screen_size(self) -> tuple[int, int]:
        self._send(13)
        line = self._line()[:-2].decode(errors="replace").split(";;")
        if len(line) >= 3 and line[0] == "0":
            return int(float(line[1])), int(float(line[2]))
        raise FridaDown(f"ZXTouch screen size failed: {line!r}")

    def type_text(self, text: str) -> None:
        for character in text:
            self._send(24, 1, character)
            self._line()

    def show_keyboard(self) -> None:
        self._send(24, 2, 2)
        self._line()

    def screenshot(self) -> bytes:
        self._send(self.SCREENSHOT)
        header = self._line()[:-2].split(b";;")
        if len(header) != 3 or header[0] != b"0":
            raise FridaDown("ZXTouch screenshot failed")
        size = int(header[2])
        while len(self._buffer) < size:
            chunk = self._connect().recv(size - len(self._buffer))
            if not chunk:
                raise FridaDown("ZXTouch screenshot truncated")
            self._buffer.extend(chunk)
        data = bytes(self._buffer[:size])
        del self._buffer[:size]
        return data

    def switch_to_app(self, bundle_id: str) -> None:
        self._send(11, bundle_id)
        if not self._line().startswith(b"0"):
            raise FridaDown(f"ZXTouch could not foreground {bundle_id}")

    def image_match(self, template_path: str, threshold: float = 0.8):
        self._send(21, template_path, 4, threshold, 0.8)
        response = self._line()[:-2].decode(errors="replace").split(";;")
        if not response or response[0] != "0":
            return None
        return tuple(float(value) for value in response[1:5])

    def close(self) -> None:
        if self._socket is not None:
            self._socket.close()
            self._socket = None


class FridaTouch:
    """Control the foreground app through a local frida-server session."""

    def __init__(self, bundle_id: str, host: str = "127.0.0.1", port: int = 27042,
                 touch_host: str = "127.0.0.1", touch_port: int = 6000,
                 timeout: float = 30):
        self.bundle_id = bundle_id
        self.host = host
        self.port = int(port)
        self.timeout = timeout
        self._device = None
        self._session = None
        self._script = None
        self._touch = ZXTouchClient(touch_host, touch_port, timeout)
        self._touch_template_dir = ""

    def _ensure_script(self):
        if self._script is not None:
            return self._script
        try:
            import frida
        except ImportError as exc:
            raise FridaDown(
                "Python Frida bindings are missing; install the phone's frida package"
            ) from exc

        try:
            manager = frida.get_device_manager()
            if self._device is None:
                self._device = manager.add_remote_device(f"{self.host}:{self.port}")
            app = next(
                (item for item in self._device.enumerate_applications()
                 if item.identifier == self.bundle_id and item.pid > 0),
                None,
            )
            if app is None:
                raise FridaDown(f"{self.bundle_id} is not running")
            self._session = self._device.attach(app.pid)
            self._script = self._session.create_script(SCRIPT.read_text())
            self._script.load()
            return self._script
        except Exception as exc:
            self._script = None
            self._session = None
            raise FridaDown(f"could not attach to {self.bundle_id}: {exc}") from exc

    def _call(self, method: str, *args):
        try:
            return getattr(self._ensure_script().exports_sync, method)(*args)
        except FridaDown:
            raise
        except Exception as exc:
            self._script = None
            raise FridaDown(f"Frida {method} failed: {exc}") from exc

    def tap(self, x: int, y: int) -> None:
        log.info("tap %s,%s", x, y)
        self._touch.tap(int(x), int(y))

    def screen_size(self) -> tuple[int, int]:
        return 828, 1792

    def swipe(self, x1: int, y1: int, x2: int, y2: int) -> None:
        self._touch._send(self._touch.TOUCH, f"12{5:02d}{int(x1 * 10):05d}{int(y1 * 10):05d}")
        time.sleep(0.08)
        self._touch._send(self._touch.TOUCH, f"12{5:02d}{int(x2 * 10):05d}{int(y2 * 10):05d}")
        time.sleep(0.08)
        self._touch._send(self._touch.TOUCH, f"10{5:02d}{int(x2 * 10):05d}{int(y2 * 10):05d}")

    def type_text(self, text: str) -> None:
        log.debug("type_text (len=%d)", len(text))
        try:
            self._touch.show_keyboard()
        except Exception:
            pass
        self._touch.type_text(str(text))

    def launch(self, bundle_id: str) -> None:
        """Kill Evony, then start it without waiting for the splash to finish."""
        if bundle_id != self.bundle_id:
            raise FridaDown(f"transport configured for {self.bundle_id}, not {bundle_id}")
        close_app(bundle_id)
        time.sleep(0.5)
        key = Path("/tmp/opencode/bubbler_phone_ed25519")
        cmd = ["uiopen", "--bundleid", bundle_id]
        if key.exists():
            cmd = ["ssh", "-i", str(key), "-o", "BatchMode=yes", "-o", "ConnectTimeout=6",
                   "mobile@192.168.1.166", f"uiopen --bundleid {bundle_id}"]
        subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def wait_for_template(self, template_name: str, timeout: float = 30) -> bool:
        if not self._touch_template_dir:
            raise FridaDown("ZXTouch template directory is not configured")
        path = str(Path(self._touch_template_dir) / template_name)
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self._touch.image_match(path, threshold=0.75):
                return True
            time.sleep(0.5)
        return False

    def try_tap_template(self, template_name: str, threshold: float = 0.62):
        if not self._touch_template_dir:
            return None
        path = str(Path(self._touch_template_dir) / template_name)
        match = self._touch.image_match(path, threshold=threshold)
        if not match:
            return None
        x, y, width, height = match
        cx, cy = round(x + width / 2), round(y + height / 2)
        self._touch.tap(cx, cy)
        return cx, cy

    def tap_template(self, template_name: str, timeout: float = 30) -> bool:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.try_tap_template(template_name):
                return True
            time.sleep(0.2)
        return False

    def configure_templates(self, directory: str) -> None:
        self._touch_template_dir = directory

    def _ensure_device(self):
        if self._device is not None:
            return self._device
        try:
            import frida
            manager = frida.get_device_manager()
            self._device = manager.add_remote_device(f"{self.host}:{self.port}")
            return self._device
        except ImportError as exc:
            raise FridaDown("Python Frida bindings are not installed on this device") from exc
        except Exception as exc:
            raise FridaDown(f"could not connect to frida-server: {exc}") from exc

    def screenshot(self) -> bytes:
        return self._touch.screenshot()

    def home(self) -> None:
        # App termination below is the reliable close path; Frida intentionally does not
        # synthesize the iPhone home gesture.
        return None

    def force_close(self, bundle_id: str) -> None:
        if bundle_id != self.bundle_id:
            raise FridaDown(f"transport configured for {self.bundle_id}, not {bundle_id}")
        close_app(bundle_id)
        self._script = None
        self._session = None
        self._touch.close()

    def _kill_remote_processes(self) -> bool:
        """Kill matching app processes through the Frida device, including SSH-tunnel mode."""
        if self._device is None:
            return False
        killed = False
        for app in self._device.enumerate_applications():
            if app.identifier == self.bundle_id and app.pid > 0:
                self._device.kill(app.pid)
                killed = True
        self._script = None
        self._session = None
        if killed:
            time.sleep(1)
        return killed


def close_app(bundle_id: str) -> None:
    """Kill Evony once, then wait until it is gone."""
    leaf = bundle_id.rsplit(".", 1)[-1]
    names = [bundle_id, leaf, leaf.capitalize(), "Evony"]
    key = Path("/tmp/opencode/bubbler_phone_ed25519")
    if key.exists():
        remote = " ; ".join(f"killall -9 {n} >/dev/null 2>&1" for n in names)
        remote += (
            '; i=0; while [ $i -lt 8 ]; do '
            'ps aux | grep -i "[e]vony" | grep -v grep >/dev/null || break; '
            'sleep 0.35; i=$((i+1)); done'
        )
        subprocess.run(
            ["ssh", "-i", str(key), "-o", "BatchMode=yes", "-o", "ConnectTimeout=6",
             "mobile@192.168.1.166", remote],
            capture_output=True, check=False,
        )
        time.sleep(0.3)
        return
    for name in names:
        subprocess.run(["killall", "-9", name], capture_output=True, check=False)
    time.sleep(1.0)


def wake_screen(command: str = "wake") -> None:
    """Best-effort wake using an installed jailbreak utility."""
    try:
        subprocess.run([command], capture_output=True, check=False)
    except FileNotFoundError:
        pass
