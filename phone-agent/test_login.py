"""Linked-account login test + bubble-tap calibration helper.

Run ON THE PHONE over SSH (it drives Evony through the local ZXTouch socket):

    cd /var/jb/usr/libexec/bubbler
    python3 test_login.py --email member@example.com

What it does:
  1. Launches Evony, taps the loading-screen login icon, types the email,
     taps Confirm — exactly like the link flow.
  2. For an already-linked account Evony skips the 6-digit code and shows the
     load-account Confirm instead ("login as <user>"); the script taps it.
  3. Waits for the world view, saving one screenshot per stage into
     --shots-dir for visual verification.
  4. Force-closes Evony, exactly like a real scheduled run.

Modes:
  (default)      login test only; exit 0 when the world view is reached.
  --and-bubble   after login, also attempt apply_3day_bubble() (fails with the
                 exact missing taps until calibration is done).
  --record-taps  after login, interactively record the 3-day-bubble tap
                 coordinates into calibration.json (backup: .bak).
  --dry-run      no phone needed: validates config + manifest and prints the
                 bubble-tap checklist. Safe to run on a laptop.

Exit codes: 0 ok, 1 login/bubble failed, 2 usage/config error.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from evony import CalibrationMissing, EvonyController, load_calibration  # noqa: E402

log = logging.getLogger("bubbler.test_login")

SCREEN_W, SCREEN_H = 828, 1792

TAP_ORDER = [
    ("world_view", "bubble_menu",
     "world view -> tap that OPENS the truce/item menu"),
    ("truce_3day", "select",
     "truce list -> tap the 3-day Truce Agreement row (2500 gems)"),
    ("activate_confirm", "activate",
     "truce detail -> tap Activate/Use"),
    ("activate_confirm", "confirm",
     "final dialog -> tap Confirm (TYPE ONLY, never tap-test: spends gems!)"),
]


# ---------------------------------------------------------------------------
# screenshots


class ShotSaver:
    def __init__(self, shots_dir: Path):
        self.dir = shots_dir
        self.dir.mkdir(parents=True, exist_ok=True)
        self.n = 0

    def __call__(self, stage: str, png: bytes) -> None:
        self.n += 1
        stamp = datetime.now().strftime("%H%M%S")
        name = f"{self.n:02d}_{stage}_{stamp}.png"
        (self.dir / name).write_bytes(png)
        (self.dir / f"latest_{stage}.png").write_bytes(png)
        log.info("shot %-18s -> %s (%d bytes)", stage, name, len(png))


# ---------------------------------------------------------------------------
# dry run (no phone)


def manifest_path_from_config(cfg: dict) -> Path:
    raw = str((cfg.get("calibration", {}) or {}).get(
        "manifest", ROOT / "calibration" / "calibration.json"))
    p = Path(raw)
    return p if p.is_absolute() else ROOT / p


def dry_run(cfg_path: str) -> int:
    # NOTE: no agent.py import here — agent.py needs `requests`, which a laptop
    # may not have. This checklist only scans the config text for key lines.
    import re

    def _scan(key: str, default: str = "") -> str:
        try:
            text = Path(cfg_path).read_text()
        except FileNotFoundError:
            return default
        m = re.search(rf"^\s*{re.escape(key)}:\s*\"?([^\"#\n]+)\"?", text,
                      re.MULTILINE)
        return m.group(1).strip() if m else default

    if not Path(cfg_path).exists():
        # config.example.yaml documents the shape; manifest check still useful.
        print(f"config not found: {cfg_path} (phone-only file; continuing)")
    print(f"config: {cfg_path}")
    print(f"  evony_bundle_id: {_scan('evony_bundle_id', 'MISSING')}")
    print(f"  zxtouch: {_scan('zxtouch_host', '?')}:{_scan('zxtouch_port', '?')}")
    mpath = Path(_scan("manifest", str(ROOT / "calibration" / "calibration.json")))
    if not mpath.is_absolute():
        mpath = ROOT / mpath
    print(f"manifest: {mpath}")
    try:
        cal = load_calibration(str(mpath))
    except CalibrationMissing as exc:
        print(f"  INVALID: {exc}")
        return 2
    print(f"  screens: {', '.join(sorted(cal.screens))}")
    probe = EvonyController(transport=None, vision=None, calibration=cal)
    missing = probe.missing_bubble_taps()
    print("bubble taps:")
    for screen, tap, desc in TAP_ORDER:
        point = (cal.screens.get(screen, {}).get("taps", {}) or {}).get(tap)
        mark = f"{point['x']},{point['y']}" if point else "MISSING"
        print(f"  [{'x' if point else ' '}] {screen}/{tap:10s} {mark:12s} ({desc})")
    print(f"  shield_countdown_roi: {cal.shield_countdown_roi or 'MISSING (optional)'}")
    if missing:
        print("result: login test can run; bubble needs: " + ", ".join(missing))
    else:
        print("result: fully calibrated — --and-bubble should attempt a real apply")
    return 0


# ---------------------------------------------------------------------------
# interactive tap recording


def _read_point(prompt: str):
    while True:
        raw = input(f"{prompt} [x y / skip]: ").strip().lower()
        if raw in ("skip", "s", ""):
            return None
        parts = raw.replace(",", " ").split()
        if len(parts) == 2 and all(p.lstrip("-").isdigit() for p in parts):
            x, y = int(parts[0]), int(parts[1])
            if 0 <= x <= SCREEN_W and 0 <= y <= SCREEN_H:
                return {"x": x, "y": y}
            print(f"  out of range; screen is {SCREEN_W}x{SCREEN_H}")
        else:
            print("  type two numbers, e.g. 414 830, or 'skip'")


def record_taps(evony: EvonyController, mpath: Path, shots_dir: Path) -> None:
    world_shot = shots_dir / "latest_world.png"
    print("\n=== bubble-tap calibration ===")
    if world_shot.exists():
        print(f"Reference world screenshot: {world_shot}")
        print("Open it (scp to your laptop) and read pixel coordinates")
        print(f"(image is {SCREEN_W}x{SCREEN_H}; origin top-left).")
    else:
        print("WARNING: no latest_world.png; coords still accepted.")
    print("For the truce/activate screens, navigate Evony MANUALLY on the phone")
    print("and screenshot each screen, or read coords from a screen ruler.")
    print("NEVER tap-test activate/confirm: the final Confirm spends 2500 gems.\n")

    try:
        manifest = json.loads(mpath.read_text())
    except FileNotFoundError:
        print(f"manifest not found: {mpath}")
        return
    screens = manifest.setdefault("screens", {})

    for screen, tap, desc in TAP_ORDER:
        cur = (screens.get(screen, {}).get("taps", {}) or {}).get(tap)
        print(f"-- {screen}/{tap}: {desc}")
        if cur:
            print(f"   current: {cur['x']},{cur['y']}")
        point = _read_point(f"   {screen}/{tap}")
        if point is not None:
            screens.setdefault(screen, {}).setdefault("taps", {})[tap] = point
            screens[screen].pop("note", None) if screens[screen].get("taps") else None

    raw = input("shield countdown ROI [x y w h / skip]: ").strip().lower()
    parts = raw.replace(",", " ").split()
    if len(parts) == 4 and all(p.lstrip("-").isdigit() for p in parts):
        manifest["shield_countdown_roi"] = [int(p) for p in parts]

    bak = mpath.with_suffix(".json.bak")
    bak.write_text(mpath.read_text() if mpath.exists() else "{}")
    mpath.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"\nwrote {mpath} (backup {bak})")

    try:
        evony.cal = load_calibration(str(mpath))
    except CalibrationMissing as exc:
        print(f"manifest invalid after edit: {exc}")
        return
    missing = evony.missing_bubble_taps()
    print("missing bubble taps now: " + (", ".join(missing) if missing else "none"))

    # The ONLY safe live tap-test: opening the menu navigates, spends nothing.
    if ("world_view/bubble_menu" not in missing
            and input("\nTap-test world_view/bubble_menu in the live game? [y/N]: "
                       ).strip().lower() == "y"):
        print("tapping bubble_menu in 2s (Ctrl-C aborts)...")
        time.sleep(2)
        evony.tap("world_view", "bubble_menu")
        time.sleep(2)
        evony._snap("taptest_bubble_menu")
        print("check latest_taptest_bubble_menu.png: the truce menu should be open.")


# ---------------------------------------------------------------------------
# live test


def live_test(args) -> int:
    from agent import load_config, make_components

    try:
        cfg = load_config(args.config)
    except FileNotFoundError:
        print(f"config not found: {args.config}")
        return 2
    bundle_id = (cfg.get("phone", {}) or {}).get("evony_bundle_id")
    if not bundle_id:
        print("config phone.evony_bundle_id is missing")
        return 2

    _cloud, evony = make_components(cfg)
    saver = ShotSaver(Path(args.shots_dir))
    evony.shot_hook = saver
    print(f"shots -> {saver.dir.resolve()}")
    print(f"login as: {args.email} (bundle {bundle_id})")

    try:
        res = evony.login_linked_account(
            args.email, bundle_id=bundle_id,
            world_timeout=args.world_timeout)
        print("LOGIN: " + json.dumps(res))
        if res.get("status") != "world":
            return 1
        if args.and_bubble:
            res2 = evony.apply_3day_bubble()
            printable = {k: v for k, v in res2.items() if k != "screenshot"}
            if res2.get("screenshot"):
                saver("bubble_result", res2["screenshot"])
            print("BUBBLE: " + json.dumps(printable))
            if res2.get("status") != "success":
                return 1
        if args.record_taps:
            record_taps(evony, manifest_path_from_config(cfg),
                        Path(args.shots_dir))
        return 0
    except KeyboardInterrupt:
        print("\naborted; closing Evony")
        return 1
    finally:
        try:
            evony.force_close_evony(bundle_id)
            print("Evony closed")
        except Exception as exc:
            log.warning("force close failed: %s", exc)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--email", default="",
                        help="already-linked Evony email to log in as")
    parser.add_argument("--config", default=str(ROOT / "config.yaml"))
    parser.add_argument("--shots-dir", default=str(ROOT / "shots"))
    parser.add_argument("--world-timeout", type=float, default=60.0)
    parser.add_argument("--and-bubble", action="store_true",
                        help="attempt apply_3day_bubble() after login")
    parser.add_argument("--record-taps", action="store_true",
                        help="interactively record bubble taps after login")
    parser.add_argument("--dry-run", action="store_true",
                        help="validate config + manifest only (no phone)")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    if args.dry_run:
        return dry_run(args.config)
    if not args.email or "@" not in args.email:
        print("need --email <linked-address> (or use --dry-run)")
        return 2
    return live_test(args)


if __name__ == "__main__":
    raise SystemExit(main())
