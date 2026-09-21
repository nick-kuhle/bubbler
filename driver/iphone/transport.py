"""Transport layer between the home agent and the jailbroken iPhone.

Two backends:

1. SSH-over-usbmuxd (WORKING) - the wire path today. Open a tunnel with
   `iproxy 4044:22` once, then drive the phone's shell. The phone runs the
   real Evony-app RPC/manual UI via this path for now.
2. Hermes Touch HTTP (TARGET) - once built for rootless Dopamine/arm64e, a
   per-device HTTP API: POST /touch, POST /typeText, GET /screenshot,
   forwarded to 127.0.0.1 via iproxy or its own port.
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass


@dataclass
class Phone:
    ssh_port: int = 4044
    ssh_user: str = "mobile"
    ssh_pass: str = ""
    hermes_url: str = "http://127.0.0.1:8887"
    hermes_enabled: bool = False


def check_tunnel(phone: Phone) -> bool:
    """Confirm the usbmuxd tunnel answers."""
    import socket

    with socket.socket() as s:
        s.settimeout(3)
        try:
            s.connect(("127.0.0.1", phone.ssh_port))
        except OSError:
            return False
    return True


def ssh_exec(phone: Phone, command: str, timeout: int = 60) -> tuple[int, str]:
    """Run a command on the phone over the USB tunnel. Returns (exit_code, stdout)."""
    # TODO(nick): decide auth (key agent / password via secrets). Never log the password.
    cmd = [
        "ssh",
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "-o", "PreferredAuthentications=password",
        "-p", str(phone.ssh_port),
        f"{phone.ssh_user}@127.0.0.1",
        command,
    ]
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        input=phone.ssh_pass + "\n" if phone.ssh_pass else None,
    ).returncode, ""


class HermesTouch:
    """HTTP API target. Fill in as the device build lands (see docs/03)."""

    def __init__(self, base_url: str, enabled: bool = False):
        self.base_url = base_url
        self.enabled = enabled

    def tap(self, x: int, y: int) -> None:
        raise NotImplementedError("Hermes Touch pending rootless/Dopamine verification")

    def type_text(self, text: str) -> None:
        raise NotImplementedError("Hermes Touch pending rootless/Dopamine verification")

    def screenshot(self) -> bytes:
        raise NotImplementedError("Hermes Touch pending rootless/Dopamine verification")


def screenshot_fallback(phone: Phone, out_path: str) -> None:
    """Interim screenshot path over SSH until Hermes Touch lands.

    Note: replace with a jailbreak screenshot CLI (e.g. screencapture via Sileo/SSP)
    or Hermes Touch once available.
    """
    raise NotImplementedError("install a screenshot CLI on the device, or use Hermes Touch")