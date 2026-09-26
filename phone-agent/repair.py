"""repair.py — the self-repair behind the War Room's "restart agent" button.

This is the exact recovery that brought the stack back on 2026-09-25, kept as code so the
operator does not have to remember it. The failure it fixes: the agent kept long-polling
Vercel (so the heartbeat stayed *online* and the dashboard looked healthy) while its
frida/ZXTouch SSH tunnels were dead, and app control silently fell through to a local
`uiopen` that does not exist on the laptop. Every job then failed with an opaque
"[Errno 2] No such file or directory: 'uiopen'" while nothing looked broken from the cloud.

Order matters:
  1. the phone key must exist   — no key means no tunnels, and no restart can fix that
  2. the phone must answer      — frida-server and ZXTouch are phone-side services
  3. the tunnels are re-opened  — this is what was actually broken
  4. phone control is verified  — frida attaches and ZXTouch returns a screenshot

The agent process itself is *not* restarted here: the caller reports the result and then
exits, and the supervisor (systemd Restart=always / launchd KeepAlive) relaunches it. That
keeps exactly one agent consuming jobs at a time (docs/06).

Usage:  python3 repair.py            # run the repair, print the report
"""

from __future__ import annotations

import os
import socket
import subprocess
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
BOOTSTRAP = HERE / "bootstrap"
ZXTOUCH_BUNDLE_ID = "com.zjx.zxtouch"

TUNNEL_UNIT = "bubbler-tunnel"
FRIDA_PORT = 27042
ZXTOUCH_PORT = 6000


@dataclass
class Step:
    name: str
    ok: bool
    detail: str = ""


@dataclass
class RepairReport:
    ok: bool = True
    steps: list[Step] = field(default_factory=list)
    duration_ms: int = 0
    error: str | None = None

    def add(self, name: str, ok: bool, detail: str = "") -> Step:
        step = Step(name=name, ok=ok, detail=detail)
        self.steps.append(step)
        if not ok:
            self.ok = False
        return step

    def as_dict(self) -> dict:
        return {
            "ok": self.ok,
            "steps": [asdict(s) for s in self.steps],
            "duration_ms": self.duration_ms,
            "error": self.error,
        }


def _log(message: str) -> None:
    print(f"[repair] {message}", flush=True)


def _ssh_key(phone: dict) -> Path:
    raw = str(phone.get("ssh_key") or "").strip()
    if not raw:
        raw = str(Path.home() / ".ssh" / "bubbler_phone_ed25519")
    return Path(os.path.expanduser(raw))


def _ssh_target(phone: dict) -> str:
    return f"{phone.get('ssh_user') or 'mobile'}@{phone.get('ssh_host') or ''}"


def _ssh(phone: dict, command: str, timeout: int = 20, user: str | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        [
            "ssh", "-i", str(_ssh_key(phone)),
            "-o", "BatchMode=yes",
            "-o", "IdentitiesOnly=yes",
            "-o", "ConnectTimeout=8",
            f"{user or phone.get('ssh_user') or 'mobile'}@{phone.get('ssh_host') or ''}",
            command,
        ],
        capture_output=True, text=True, timeout=timeout,
    )


def _root_ssh(phone: dict, command: str, timeout: int = 20) -> subprocess.CompletedProcess | None:
    """Run a command as root on the phone, if a root key is configured.

    frida-server must run as root (it ptraces the game), and the jailbreak's `sudo` asks
    for a password, so the only unattended option is key-based root SSH. Returns None when
    no root key is configured or root login is not set up, so the caller can degrade to a
    clear "start this by hand" message instead of a confusing auth error.
    """
    root_key = str(phone.get("root_ssh_key") or "").strip()
    if not root_key:
        return None
    key = Path(os.path.expanduser(root_key))
    if not key.exists():
        return None
    try:
        return _ssh(phone, command, timeout=timeout, user=str(phone.get("root_ssh_user") or "root"))
    except (subprocess.TimeoutExpired, OSError):
        return None


def _port_open(port: int, host: str = "127.0.0.1") -> bool:
    try:
        with socket.create_connection((host, port), timeout=4):
            return True
    except OSError:
        return False


def _systemctl(action: str, unit: str, timeout: int = 30) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["systemctl", "--user", action, unit],
        capture_output=True, text=True, timeout=timeout,
    )


def repair(cfg: dict) -> RepairReport:
    phone = cfg.get("phone", {}) or {}
    report = RepairReport()
    started = time.monotonic()

    # 1. the key must exist — everything downstream depends on it
    key = _ssh_key(phone)
    if not key.exists():
        report.add(
            "phone_key", False,
            f"no SSH key at {key}. Run bootstrap/ensure_phone_key.sh --print-pub "
            f"and authorize it on the phone (an unauthorized key cannot be self-repaired).",
        )
        report.duration_ms = int((time.monotonic() - started) * 1000)
        return report
    report.add("phone_key", True, str(key))

    # 2. the phone must answer SSH at all
    try:
        probe = _ssh(phone, "true", timeout=15)
    except (subprocess.TimeoutExpired, OSError) as exc:
        report.add("phone_reachable", False, f"ssh failed: {exc}")
        report.duration_ms = int((time.monotonic() - started) * 1000)
        return report
    if probe.returncode != 0:
        report.add("phone_reachable", False, (probe.stderr or "ssh refused").strip()[:200])
        report.duration_ms = int((time.monotonic() - started) * 1000)
        return report
    report.add("phone_reachable", True, _ssh_target(phone))

    # 3. frida-server is a phone-side service; relaunch it if the reboot took it down.
    #    NOTE: the jailbreak already runs a launchd KeepAlive job (re.frida.server) as root
    #    with RunAtLoad, so a killed frida comes back on its own within ~5s. Give launchd
    #    that window first — force-starting underneath it races for port 27042 and can
    #    leave the daemon flapping between two owners. Only if launchd has not restored it
    #    do we start it ourselves, which needs root (see _root_ssh).
    def _frida_procs() -> int:
        probe = _ssh(phone, 'ps aux | grep -c "[f]rida-server" || true', timeout=15)
        head = probe.stdout.strip().splitlines()[-1:] or ["0"]
        return int(head[0].strip() or 0)

    try:
        count = _frida_procs()
    except (subprocess.TimeoutExpired, OSError) as exc:
        report.add("frida_server", False, f"check failed: {exc}")
    else:
        if count:
            report.add("frida_server", True, "running")
        else:
            # give launchd's KeepAlive a chance before intervening
            for _ in range(3):
                time.sleep(3)
                try:
                    count = _frida_procs()
                except (subprocess.TimeoutExpired, OSError):
                    break
                if count:
                    break
            if count:
                report.add("frida_server", True, "recovered by launchd KeepAlive")
            else:
                _log("frida-server is still down after waiting for launchd; starting it as root")
                # frida-server only works as root (it ptraces the game) and the jailbreak's
                # sudo asks for a password, so key-based root SSH is the only unattended
                # route. `mobile` cannot start it: the binary is root-owned and it needs
                # uid 0 to attach to the game.
                started = _root_ssh(phone, "/var/jb/usr/sbin/frida-server >/dev/null 2>&1 &", timeout=15)
                if started is None:
                    report.add("frida_server", False,
                               "not running and cannot self-start: frida-server needs root. "
                               "Authorize the laptop key for root SSH (phone.root_ssh_key) or "
                               "start it on the phone: sudo /var/jb/usr/sbin/frida-server")
                elif started.returncode != 0:
                    report.add("frida_server", False,
                               (started.stderr or "root ssh refused").strip()[:200])
                else:
                    time.sleep(3)
                    after = _root_ssh(phone, 'ps aux | grep -c "[f]rida-server" || true', timeout=15)
                    n = int(((after.stdout.strip().splitlines() or ["0"])[-1].strip() or "0")) if after else 0
                    report.add("frida_server", n > 0,
                               "started" if n else "still not running after start (check the phone)")


    # 4. ZXTouch is an app, not a daemon — it must be foregrounded. This is the other
    #    half of the outage: the reboot left the tunnels up-able but nothing to talk to.
    try:
        zx = _ssh(phone, 'ps aux | grep -c "[z]xtouch" || true', timeout=15)
    except (subprocess.TimeoutExpired, OSError) as exc:
        report.add("zxtouch", False, f"check failed: {exc}")
    else:
        running = (zx.stdout.strip().splitlines() or ["0"])[-1].strip()
        if running not in ("", "0"):
            report.add("zxtouch", True, "running")
        else:
            _log("ZXTouch is not running; launching it on the phone")
            try:
                _ssh(phone, f"/var/jb/usr/bin/uiopen --bundleid {ZXTOUCH_BUNDLE_ID}", timeout=15)
                time.sleep(5)
                after = _ssh(phone, 'ps aux | grep -c "[z]xtouch" || true', timeout=15)
                count = (after.stdout.strip().splitlines() or ["0"])[-1].strip()
                report.add("zxtouch", count not in ("", "0"),
                           "launched" if count not in ("", "0") else "did not come up after launch")
            except (subprocess.TimeoutExpired, OSError) as exc:
                report.add("zxtouch", False, f"launch failed: {exc}")

    # 5. re-open the tunnels — the actual repair.
    #    reset-failed FIRST: when the phone reboots, ssh exits, the unit burns through
    #    StartLimitBurst and lands in failed/start-limit-hit. systemd then *refuses* a
    #    plain restart ("start of the service was attempted too often") and never even
    #    tries, so without this the repair cannot recover the exact outage it exists for.
    try:
        _systemctl("reset-failed", TUNNEL_UNIT)
        restarted = _systemctl("restart", TUNNEL_UNIT)
    except (subprocess.TimeoutExpired, OSError) as exc:
        report.add("tunnel_restart", False, f"systemctl failed: {exc}")
    else:
        if restarted.returncode == 0:
            report.add("tunnel_restart", True, f"{TUNNEL_UNIT} restarted")
        else:
            detail = (restarted.stderr or restarted.stdout or "").strip()[:200]
            report.add("tunnel_restart", False, detail or f"exit {restarted.returncode}")

    # 6. prove the forwards are actually listening before declaring victory
    for _ in range(10):
        if _port_open(FRIDA_PORT) and _port_open(ZXTOUCH_PORT):
            break
        time.sleep(1)
    report.add("tunnels_open", _port_open(FRIDA_PORT) and _port_open(ZXTOUCH_PORT),
               f"frida {FRIDA_PORT}={'open' if _port_open(FRIDA_PORT) else 'closed'}, "
               f"zxtouch {ZXTOUCH_PORT}={'open' if _port_open(ZXTOUCH_PORT) else 'closed'}")

    report.duration_ms = int((time.monotonic() - started) * 1000)
    if not report.ok:
        report.error = "; ".join(f"{s.name}: {s.detail}" for s in report.steps if not s.ok) or "repair failed"
    return report


def main() -> int:
    import argparse
    import json

    parser = argparse.ArgumentParser(description="bubbler stack self-repair")
    parser.add_argument("--config", default=str(HERE / "config.yaml"))
    parser.add_argument("--json", action="store_true", help="print the report as JSON")
    args = parser.parse_args()

    import sys
    sys.path.insert(0, str(HERE))
    from agent import load_config  # noqa: E402  (config parsing lives with the agent)

    report = repair(load_config(args.config))
    if args.json:
        print(json.dumps(report.as_dict(), indent=2))
    else:
        for step in report.steps:
            print(f"  [{'PASS' if step.ok else 'FAIL'}] {step.name}"
                  f"{f' — {step.detail}' if step.detail else ''}")
        print(f"  => {'REPAIRED' if report.ok else 'NEEDS ATTENTION'} ({report.duration_ms}ms)")
    return 0 if report.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
