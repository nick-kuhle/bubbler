"""Bubbler on-device agent — long-poll loop (runs on the jailbroken iPhone).

Loop:
    GET {cloud}/api/agent/events (Bearer)
      └ server holds (~45s) and returns:
           - the next event: run | link | code     -> dispatch
           - or empty {"event": null}              -> reconnect immediately

Run events execute Evony and report through POST /api/agent/runs (+ raw-PNG evidence).
Link events start an interactive login that posts awaiting_phone/awaiting_code and then
*waits* for a subsequent `code` event on the same stream. Test events reopen Evony, sign
in as the member's email without a code and verify the in-game name.

Heartbeat: every poll sends `?v=VER&host=NAME&pid=N`; the cloud stamps agent_health so the
dashboard knows the phone is alive (docs/06). Watchdog: the loop exits when the cloud is
unreachable for `cloud.max_failures` consecutive polls or nothing rounds in
`cloud.max_idle_sec` — any supervisor (launchd KeepAlive / systemd Restart) then relaunches
us fresh instead of letting a hung transport kill the phone silently.

Usage:
    python agent.py --once        # one long-poll round, then exit
    python agent.py               # run forever (supervised by launchd/systemd)
"""

from __future__ import annotations

import argparse
import logging
import os
import queue
import socket
import sys
import threading
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from evony import EvonyController, load_calibration, run_one  # noqa: E402
from iphone.transport import FridaTouch              # noqa: E402
from vision import TemplateLibrary, find_template, ocr_region, parse_shield_countdown  # noqa: E402

log = logging.getLogger("bubbler.agent")

# Reported on every long-poll (cloud stamps it into agent_health so the dashboard can
# tell a healthy phone from a silent one; bump on game-flow or heartbeat contract change).
__version__ = "0.3.0"


class ConfiguredVision:
    """Bind the stateless vision helpers to this device's template library."""

    def __init__(self, library: TemplateLibrary, tesseract_cmd: str):
        self.library = library
        self.tesseract_cmd = tesseract_cmd

    def find_template(self, screen: bytes, template: str):
        return find_template(screen, template, self.library)

    def ocr_region(self, screen: bytes, roi):
        return ocr_region(screen, roi, self.tesseract_cmd)

    @staticmethod
    def parse_shield_countdown(text: str) -> float:
        return parse_shield_countdown(text)


# ---------------------------------------------------------------------------
# config — hand-rolled YAML-subset loader (PyYAML is not installed on-device)


def _strip_comment(s: str) -> str:
    quote = None
    for i, ch in enumerate(s):
        if ch in "\"'":
            if quote == ch:
                quote = None
            elif quote is None:
                quote = ch
        elif ch == "#" and quote is None:
            return s[:i].strip()
    return s.strip()


def _scalar(s: str):
    s = s.strip()
    if not s:
        return None
    if (s[0] == '"' and s[-1] == '"') or (s[0] == "'" and s[-1] == "'"):
        return s[1:-1]
    low = s.lower()
    if low in ("true", "yes"):
        return True
    if low in ("false", "no"):
        return False
    if low in ("null", "~", "none"):
        return None
    try:
        return int(s)
    except ValueError:
        pass
    try:
        return float(s)
    except ValueError:
        pass
    return s


def _tokens(path: str):
    lines = []
    for raw in open(path, "r"):
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        text = _strip_comment(raw.rstrip("\n"))
        if not text:
            continue
        lines.append((len(raw) - len(raw.lstrip(" ")), text))
    return lines


def _parse_map(lines, i, indent):
    node = {}
    while i < len(lines):
        ind, text = lines[i]
        if ind < indent:
            break
        if ind > indent:
            raise ValueError(f"bad indent {ind}>{indent}: {text}")
        if text.startswith("-"):
            break
        key, _, val = text.partition(":")
        key, val = key.strip(), val.strip()
        i += 1
        if val:
            node[key] = _scalar(val)
        elif i < len(lines) and lines[i][0] > indent:
            if lines[i][1].startswith("-"):
                node[key], i = _parse_seq(lines, i, lines[i][0])
            else:
                node[key], i = _parse_map(lines, i, lines[i][0])
        else:
            node[key] = None
    return node, i


def _parse_seq(lines, i, indent):
    out = []
    while i < len(lines):
        ind, text = lines[i]
        if ind < indent or not text.startswith("-"):
            break
        body = text[1:].strip()
        i += 1
        if body and ":" in body:
            key, _, val = body.partition(":")
            item = {key.strip(): _scalar(val.strip())}
            if i < len(lines) and lines[i][0] > indent:
                sub, i = _parse_map(lines, i, lines[i][0])
                item.update(sub)
        else:
            item = _scalar(body)
        out.append(item)
    return out, i


def load_config(path: str) -> dict:
    lines = _tokens(path)
    if not lines:
        return {}
    if lines[0][1].startswith("-"):
        return _parse_seq(lines, 0, lines[0][0])[0]
    return _parse_map(lines, 0, lines[0][0])[0]


def setup_logging(cfg: dict) -> None:
    level = getattr(logging, str(cfg.get("logging", {}).get("level", "INFO")).upper(), logging.INFO)
    logging.basicConfig(level=level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


# ---------------------------------------------------------------------------
# cloud contract


class CloudClient:
    """Thin HTTPS client to Vercel (outbound only). Bearer token in every request."""

    def __init__(self, base_url: str, token: str, timeout: float = 50):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout
        self._local = threading.local()

    def _http(self) -> requests.Session:
        session = getattr(self._local, "session", None)
        if session is None:
            session = requests.Session()
            session.headers.update({"Authorization": f"Bearer {self.token}"})
            self._local.session = session
        return session

    def next_event(self, hold: int, meta: dict | None = None) -> dict | None:
        """One long-poll round. Returns the event dict or None (held empty).

        `meta` ({version, host, pid}) rides the query string so the cloud can stamp the
        heartbeat (GET /api/agent/events -> lib/agentHealth) on this agent's identity.
        """
        params = {"hold": hold}
        if meta:
            if meta.get("version"):
                params["v"] = meta["version"]
            if meta.get("host"):
                params["host"] = meta["host"]
            if meta.get("pid"):
                params["pid"] = meta["pid"]
        r = self._http().get(
            f"{self.base_url}/api/agent/events",
            params=params,
            timeout=self.timeout + 5,
        )
        r.raise_for_status()
        return r.json().get("event")

    def report_run(self, payload: dict) -> str | None:
        r = self._http().post(f"{self.base_url}/api/agent/runs", json=payload, timeout=30)
        r.raise_for_status()
        return r.json().get("run_id")

    def upload_evidence(self, run_id: str, png: bytes) -> str | None:
        """Raw PNG/JPEG bytes; the route detects the image type from its magic bytes."""
        content_type = "image/jpeg" if png[:3] == b"\xff\xd8\xff" else "image/png"
        r = self._http().post(
            f"{self.base_url}/api/agent/runs/{run_id}/evidence",
            data=png,
            headers={"Content-Type": content_type},
            timeout=30,
        )
        r.raise_for_status()
        return r.json().get("url")

    def report_link(self, link_id: str, payload: dict) -> None:
        log.info("link %s: %s", link_id, payload.get("status"))
        r = self._http().post(
            f"{self.base_url}/api/agent/links/{link_id}/status",
            json=payload,
            timeout=30,
        )
        r.raise_for_status()

    def report_test(self, test_id: str, payload: dict) -> None:
        log.info("test %s: %s", test_id, payload.get("status"))
        r = self._http().post(
            f"{self.base_url}/api/agent/test-connection/{test_id}/status",
            json=payload,
            timeout=30,
        )
        r.raise_for_status()


class CodeRelay:
    """Bridges `link` events and the following `code` events via a queue."""

    def __init__(self):
        self._codes: queue.Queue = queue.Queue()
        self.active_link_id: str | None = None

    def register(self, link_id: str) -> None:
        self.active_link_id = link_id
        try:
            while True:
                self._codes.get_nowait()
        except queue.Empty:
            pass

    def deliver_code(self, event: dict) -> None:
        payload = event.get("payload") or {}
        if self.active_link_id:
            self._codes.put(str(payload.get("code")))

    def get_code(self):
        try:
            return self._codes.get(timeout=90)
        except queue.Empty:
            return None

    def report_expired(self):
        if self.active_link_id:
            log.info("link %s: code expired, awaiting fresh code", self.active_link_id)

    def clear(self) -> None:
        self.active_link_id = None


# ---------------------------------------------------------------------------
# dispatch


def make_components(cfg: dict):
    phone = cfg["phone"]
    transport = FridaTouch(
        phone["evony_bundle_id"],
        host=str(phone.get("frida_host", "127.0.0.1")),
        port=int(phone.get("frida_port", 27042)),
        touch_host=str(phone.get("zxtouch_host", "127.0.0.1")),
        touch_port=int(phone.get("zxtouch_port", 6000)),
    )
    transport.configure_templates(str(phone.get(
        "zxtouch_template_dir",
        (cfg.get("calibration", {}) or {}).get("directory", "calibration"),
    )))
    vision_cfg = cfg.get("vision", {}) or {}
    calibration_cfg = cfg.get("calibration", {}) or {}
    # Keep bring-up safe until the operator captures real templates from this phone.
    enabled = bool(vision_cfg.get("enabled", False))
    calibration = None
    calibration_path = Path(str(calibration_cfg.get(
        "manifest", ROOT / "calibration" / "calibration.json"
    )))
    if not calibration_path.is_absolute():
        calibration_path = ROOT / calibration_path
    if bool(calibration_cfg.get("enabled", False)):
        calibration = load_calibration(str(calibration_path))
    if not enabled:
        evony = EvonyController(transport, vision=None, calibration=calibration)
    else:
        library = TemplateLibrary(
            str(calibration_cfg.get("directory", Path(calibration_path).parent)),
            enabled=True,
        )
        vision = ConfiguredVision(library, str(vision_cfg.get("tesseract_cmd", "tesseract")))
        evony = EvonyController(transport, vision=vision, calibration=calibration)
    return CloudClient(cfg["cloud"]["base_url"], cfg["cloud"]["agent_token"]), evony


def _clamp_shield(hours):
    if hours is None:
        return None
    try:
        h = float(hours)
    except (TypeError, ValueError):
        return None
    return max(0.0, min(3.0, h))


_link_lock = threading.Lock()


def _safe_report(cloud: CloudClient, link_id: str, payload: dict) -> None:
    try:
        cloud.report_link(link_id, payload)
    except Exception as exc:
        log.warning("link %s report failed: %s", link_id, exc)


def _safe_test_report(cloud: CloudClient, test_id: str, payload: dict) -> None:
    try:
        cloud.report_test(test_id, payload)
    except Exception as exc:
        log.warning("test %s report failed: %s", test_id, exc)


_test_lock = threading.Lock()


def run_test(cloud: CloudClient, event: dict, evony: EvonyController, bundle_id: str) -> None:
    """"Test connection": open Evony, sign in as the member's email and verify identity.

    Reuses the proven link credentials path (launch login screen -> type email -> confirm).
    A persisted device session skips the 6-digit code and shows the "login as Player X?"
    prompt; the agent reads the name there (when vision/OCR is calibrated), refuses to
    confirm if it does not match the member's evony_name, then reaches the profile and
    reports the confirmed name. See evony.EvonyController.test_login.
    """
    test_id = (event.get("payload") or {}).get("test_id")
    if not test_id:
        log.warning("test event without test_id; ignoring")
        return
    if not _test_lock.acquire(blocking=False):
        log.warning("test already running; ignoring %s", test_id)
        return
    email = event.get("email", "")
    expected_name = event.get("evony_name", "") or ""
    result = {"status": "failed", "error": "test did not start"}
    try:
        _safe_test_report(cloud, test_id, {"status": "running"})
        flow = evony.test_login(email, expected_name, bundle_id=bundle_id)
        if flow.get("status") == "ok":
            result = {"status": "ok"}
            confirmed = flow.get("confirmed_name")
            if confirmed:
                result["confirmed_name"] = confirmed
                result["verified"] = bool(flow.get("verified", False))
        else:
            result = {"status": "failed", "error": flow.get("error")}
    except Exception as exc:
        log.warning("test %s failed: %s", test_id, exc)
        result = {"status": "failed", "error": str(exc)[:200]}
    finally:
        try:
            evony.force_close_evony(bundle_id)
        except Exception as exc:
            log.warning("test force-close failed: %s", exc)
        _test_lock.release()
    _safe_test_report(cloud, test_id, result)


def run_link(cloud: CloudClient, event: dict, relay: CodeRelay, evony: EvonyController,
             bundle_id: str) -> None:
    """Execute the interactive link flow, feeding codes from the long-poll stream."""
    link_id = (event.get("payload") or {}).get("link_id")
    if not link_id:
        log.warning("link event without link_id; ignoring")
        return
    if not _link_lock.acquire(blocking=False):
        log.warning("link already running; ignoring %s", link_id)
        return
    relay.register(link_id)
    result = {"status": "failed", "error": "unexpected"}
    try:
        cloud.report_link(link_id, {"status": "awaiting_phone"})
        result = evony.link_login(
            event.get("email", ""),
            get_code=relay.get_code,
            report_expired=relay.report_expired,
            on_waiting_code=lambda: _safe_report(cloud, link_id, {"status": "awaiting_code"}),
            bundle_id=bundle_id,
        )
    finally:
        time.sleep(8)
        evony.force_close_evony(bundle_id)
        _link_lock.release()
    cloud.report_link(link_id, result)
    relay.clear()


def handle_event(cloud: CloudClient, evony: EvonyController, relay: CodeRelay | None,
                 event: dict, cfg: dict, wait_link: bool = False) -> None:
    bundle_id = cfg["phone"]["evony_bundle_id"]
    kind = event.get("kind")
    payload = event.get("payload") or {}
    start = time.monotonic()

    if kind not in ("run", "link", "code", "test"):
        log.warning("ignoring unknown event kind: %s", kind)
        return

    if kind == "code":
        if relay and relay.active_link_id:
            relay.deliver_code(event)
        else:
            log.info("stray code event without active link; ignoring")
        return

    if kind == "test":
        run_test(cloud, event, evony, bundle_id)
        return

    if kind == "link":
        t = threading.Thread(target=run_link,
                             args=(cloud, event, relay, evony, bundle_id),
                             daemon=True)
        t.start()
        if wait_link:
            t.join()
        return

    result = run_one(evony, event, bundle_id)
    duration_ms = int((time.monotonic() - start) * 1000)
    report = {
        "job_id": event.get("job_id"),
        "trigger": payload.get("trigger", "schedule"),
        "status": result.get("status", "failed"),
        "shield_hours_remaining": _clamp_shield(result.get("shield_hours_remaining")),
        "duration_ms": duration_ms,
        "error": result.get("error"),
    }
    run_id = cloud.report_run(report)
    if run_id:
        evidence = result.get("screenshot")
        if evidence:
            try:
                ref = cloud.upload_evidence(run_id, evidence)
                if ref:
                    log.info("evidence uploaded: %s", ref)
            except Exception as exc:
                log.warning("evidence upload failed: %s", exc)
    log.info("run reported: %s (job %s)", report["status"], event.get("job_id"))


def main() -> None:
    parser = argparse.ArgumentParser(description="bubbler on-device agent")
    parser.add_argument("--once", action="store_true", help="one long-poll round, then exit")
    parser.add_argument("--config", default=str(ROOT / "config.yaml"))
    args = parser.parse_args()

    cfg = load_config(args.config)
    setup_logging(cfg)
    cloud, evony = make_components(cfg)
    relay = CodeRelay()
    poll_ms = int(cfg.get("runner", {}).get("poll_interval_ms", 3000))
    cloud_cfg = cfg.get("cloud", {}) or {}
    # Watchdog knobs: the supervisor (launchd/systemd) runs us with Restart/KeepAlive, so
    # giving up here is a *relaunch recovery*, not a shutdown (docs/06).
    max_idle = int(cloud_cfg.get("max_idle_sec", 300))
    max_failures = int(cloud_cfg.get("max_failures", 8))

    meta = {
        "version": __version__,
        "host": socket.gethostname(),
        "pid": os.getpid(),
    }
    log.info("agent %s started (cloud=%s, host=%s)", __version__, cfg["cloud"]["base_url"], meta["host"])

    # A healthy loop completes a poll round every ~46s (45s hold + reconnect). We exit if
    # nothing rounds in `max_idle` seconds (a stuck transport/sync flow) or after too many
    # consecutive cloud failures, so launchd/systemd relaunch a fresh process.
    last_activity = time.monotonic()
    consecutive_failures = 0
    while True:
        if time.monotonic() - last_activity > max_idle:
            log.error("no successful poll round for %ss; exiting for supervisor", max_idle)
            sys.exit(1)
        try:
            event = cloud.next_event(45, meta=meta)
        except requests.RequestException as exc:
            consecutive_failures += 1
            log.warning("long-poll failed (%s); reconnecting in %ss", exc, poll_ms // 1000)
            if consecutive_failures >= max_failures:
                log.error("cloud unreachable for %s consecutive polls; exiting for supervisor",
                          consecutive_failures)
                sys.exit(1)
            time.sleep(poll_ms // 1000)
            continue
        consecutive_failures = 0
        last_activity = time.monotonic()

        if event:
            handle_event(cloud, evony, relay, event, cfg, wait_link=args.once)
            last_activity = time.monotonic()
        if args.once:
            break


if __name__ == "__main__":
    main()
