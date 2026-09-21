"""Bubbler on-device agent — long-poll loop (runs on the jailbroken iPhone).

Loop (docs/02-architecture.md):
    open GET {cloud}/api/agent/events (bearer token)
      └ server holds (<=~45s) and returns:
           - the next event: run | link | code     -> dispatch
           - or empty {"event": null}              -> reconnect immediately

Run events execute Evony. Link events start an interactive login that then *waits* for a
subsequent `code` event on the same stream (delivered ~1s after the user submits it), and
auto-resends if the phone-side entry expires (docs/04 flow B).

Usage:
    python agent.py --once        # one long-poll round, then exit
    python agent.py               # run forever (as a LaunchDaemon)
"""

from __future__ import annotations

import argparse
import json
import logging
import queue
import sys
import threading
import time
from pathlib import Path

import requests
import yaml

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from evony import Calibration, EvonyController, run_one            # noqa: E402
from iphone.transport import HermesTouch                          # noqa: E402
from vision import TemplateLibrary                                # noqa: E402

log = logging.getLogger("bubbler.agent")


def load_config(path: str) -> dict:
    with open(path, "r") as fh:
        return yaml.safe_load(fh)


def setup_logging(cfg: dict) -> None:
    level = getattr(logging, str(cfg.get("logging", {}).get("level", "INFO")).upper(), logging.INFO)
    logging.basicConfig(level=level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


class CloudClient:
    """Thin HTTPS client to Vercel (outbound only)."""

    def __init__(self, base_url: str, token: str, timeout: float = 50):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})

    def next_event(self, hold: int) -> dict | None:
        """One long-poll round. Returns the event dict or None (held empty)."""
        r = self.session.get(
            f"{self.base_url}/api/agent/events",
            params={"hold": hold},
            timeout=self.timeout + 5,
        )
        r.raise_for_status()
        return r.json().get("event")

    def report_run(self, payload: dict) -> str | None:
        r = self.session.post(f"{self.base_url}/api/agent/runs", json=payload, timeout=30)
        r.raise_for_status()
        return r.json().get("run_id")

    def upload_evidence(self, run_id: str, png: bytes) -> None:
        r = self.session.post(
            f"{self.base_url}/api/agent/runs/{run_id}/evidence",
            files={"file": ("evidence.png", png, "image/png")},
            timeout=30,
        )
        r.raise_for_status()

    def report_link(self, link_id: str, payload: dict) -> None:
        r = self.session.post(
            f"{self.base_url}/api/agent/links/{link_id}/status",
            json=payload,
            timeout=30,
        )
        r.raise_for_status()


class CodeRelay:
    """Bridges `link` events and the following `code` events via a queue."""

    def __init__(self):
        self._codes: queue.Queue = queue.Queue()
        self.active: dict | None = None

    def start_link(self, event: dict) -> "CodeRelay":
        self.active = event
        return self

    def deliver_code(self, event: dict) -> None:
        if self.active and event.get("link_id") == self.active["link_id"]:
            self._codes.put(event["code"])

    def get_code(self):
        return self._codes.get(timeout=120)  # generous; server holds each code w/ TTL

    def report_expired(self):
        # Tell the wizard the previous code expired; it will prompt the user again.
        if self.active:
            log.info("link %s: code expired, awaiting fresh code", self.active["link_id"])


def make_components(cfg: dict):
    agent_cfg = cfg["agent"]
    vision_cfg = cfg.get("vision", {})
    cal = None
    if vision_cfg.get("enabled", True):
        cal = Calibration(
            screens={},  # populated from calibration/ yaml in the calibrate phase
            shield_countdown_roi=None,
        )
    tpl = TemplateLibrary(vision_cfg.get("calibration_dir", "calibration"),
                          enabled=vision_cfg.get("enabled", True))
    vision = tpl if tpl.enabled else None
    transport = HermesTouch(cfg["device"].get("hermes_touch_url", "http://127.0.0.1:8887"))
    evony = EvonyController(transport, vision, cal)
    return CloudClient(agent_cfg["cloud_base_url"], agent_cfg["bearer_token"]), evony


def run_link(cloud: CloudClient, event: dict, relay: CodeRelay, evony: EvonyController,
             bundle_id: str) -> None:
    """Execute the interactive link flow, feeding codes from the long-poll stream."""
    result = {"status": "failed", "error": "unexpected"}
    try:
        evony.open_evony(bundle_id)
        result = evony.link_login(
            event.get("email", ""),
            get_code=relay.get_code,
            report_expired=relay.report_expired,
        )
    finally:
        evony.close_evony()
    cloud.report_link(event["link_id"], result)
    relay.active = None


def handle_event(cloud: CloudClient, evony: EvonyController, relay: CodeRelay | None,
                 event: dict, cfg: dict) -> None:
    bundle_id = cfg["device"]["evony_bundle_id"]
    kind = event.get("kind")
    start = time.monotonic()

    if kind not in ("run", "link", "code"):
        log.warning("ignoring unknown event kind: %s", kind)
        return

    # `code` events feed an in-progress link rather than starting anything
    if kind == "code":
        if relay and relay.active:
            relay.deliver_code(event)
        else:
            log.info("stray code event without active link; ignoring")
        return

    if kind == "link":
        threading.Thread(target=run_link,
                         args=(cloud, event, relay, evony, bundle_id),
                         daemon=True).start()
        return

    # kind == "run"
    result = run_one(evony, event, bundle_id)
    duration_ms = int((time.monotonic() - start) * 1000)
    payload = {
        "job_id": event.get("job_id"),
        "status": result.get("status", "failed"),
        "shield_hours_remaining": result.get("shield_hours_remaining"),
        "duration_ms": duration_ms,
        "error": result.get("error"),
    }
    run_id = cloud.report_run(payload)
    if run_id:
        try:
            cloud.upload_evidence(run_id, evony.t.screenshot())
        except Exception as exc:  # evidence is best-effort
            log.warning("evidence upload failed: %s", exc)
    log.info("run reported: %s (job %s)", payload["status"], event.get("job_id"))


def main() -> None:
    parser = argparse.ArgumentParser(description="bubbler on-device agent")
    parser.add_argument("--once", action="store_true", help="one long-poll round, then exit")
    parser.add_argument("--config", default=str(ROOT / "config.yaml"))
    args = parser.parse_args()

    cfg = load_config(args.config)
    setup_logging(cfg)
    cloud, evony = make_components(cfg)
    relay = CodeRelay()
    agent_cfg = cfg["agent"]

    log.info("agent started (cloud=%s)", agent_cfg["cloud_base_url"])
    while True:
        try:
            event = cloud.next_event(agent_cfg.get("events_hold_seconds", 45))
        except requests.RequestException as exc:
            log.warning("long-poll failed (%s); reconnecting in %ss",
                        exc, agent_cfg.get("reconnect_delay_seconds", 2))
            time.sleep(agent_cfg.get("reconnect_delay_seconds", 2))
            continue

        if event:
            handle_event(cloud, evony, relay, event, cfg)
        if args.once:
            break


if __name__ == "__main__":
    main()