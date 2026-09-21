"""Run orchestration for the bubbler home agent.

Flow (per docs/04-evony-flow.md):

    claim job -> guard (shield>24h?) -> open Evony -> navigate -> apply 3d truce
    -> verify shield+countdown -> close Evony -> report to cloud

Starter skeleton: real screen guards/templates must be implemented per calibration.
"""

from __future__ import annotations

import argparse
import time
from dataclasses import dataclass


@dataclass
class RunReference:
    user_id: str
    evony_name: str


def apply_3day_bubble(phone, vision, evony_name: str) -> dict:
    """One bubble application pass. Returns a result dict.

    result keys: status(ok/failed/needs_code), shield_hours_remaining,
                 duration_ms, error
    """
    start = time.monotonic()
    # TODO(team): implement with transport + vision primitives:
    #   launch Evony
    #   guard each screen (world_view, email_login, code_dialog)
    #   if code_dialog -> return {"status": "needs_code"}
    #   open bubble -> select 3-day truce (7500 gems) -> activate -> confirm
    #   screenshot -> find_template(shield_active) + ocr_region(countdown ROI)
    #   close Evony
    raise NotImplementedError("implement after calibration images are available")


def run_once(phone, vision) -> None:
    """Fetch one due job from the cloud and execute it (see docs/02 API contract)."""
    # TODO(team): GET /jobs/due (bearer token), claim with lease, call apply_3day_bubble,
    #             POST /runs + POST /runs/{id}/evidence.
    raise NotImplementedError


def main() -> None:
    parser = argparse.ArgumentParser(description="bubbler home agent")
    parser.add_argument("--once", action="store_true", help="run a single pass and exit")
    parser.add_argument("--daemon", action="store_true", help="poll the cloud every minute")
    args = parser.parse_args()
    # TODO(team): load config.yaml, build Phone + TemplateLibrary, run loop with lock.
    raise NotImplementedError


if __name__ == "__main__":
    main()