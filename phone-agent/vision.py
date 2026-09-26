"""Vision helpers for the on-device agent: OpenCV template matching + OCR.

Calibration reference screenshots + ROI maps live in phone-agent/calibration/.
cv2/pytesseract are imported lazily so the agent can run in *no-verify* mode before
calibration exists (vision.enabled=false in config.yaml).
"""

from __future__ import annotations

import logging
from pathlib import Path

log = logging.getLogger("bubbler.vision")


class VisionUnavailable(RuntimeError):
    pass


def _cv2():
    try:
        import cv2
    except ImportError as exc:
        raise VisionUnavailable("opencv-python not installed (no-verify mode)") from exc
    return cv2


def _pytesseract(tesseract_cmd: str):
    try:
        import pytesseract
        pytesseract.pytesseract.tesseract_cmd = tesseract_cmd
    except ImportError as exc:
        raise VisionUnavailable("pytesseract not installed") from exc
    return pytesseract


class TemplateLibrary:
    """Load reference templates from calibration/ once at startup (lazy on use)."""

    def __init__(self, calibration_dir: str, enabled: bool = True):
        self.dir = Path(calibration_dir)
        self.enabled = enabled
        self._templates: dict[str, object] = {}

    def _load(self, name: str):
        if name in self._templates:
            return self._templates[name]
        if not self.enabled:
            raise VisionUnavailable("vision disabled in config")
        img = _cv2().imread(str(self.dir / name))
        if img is None:
            raise VisionUnavailable(f"calibration template missing: {name}")
        self._templates[name] = img
        return img

    def __contains__(self, name: str) -> bool:
        try:
            self._load(name)
            return True
        except VisionUnavailable:
            return False


def find_template(screen_png: bytes, template_name: str, library: TemplateLibrary,
                  threshold: float = 0.85) -> tuple[int, int] | None:
    """Return (x, y) of the template's best match on the given PNG, or None."""
    import numpy as np
    cv2 = _cv2()
    template = library._load(template_name)
    if not isinstance(screen_png, (bytes, bytearray)):
        return None
    arr = np.frombuffer(screen_png, dtype=np.uint8)
    screen = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if screen is None or template is None:
        log.warning("imdecode failed for %s", template_name)
        return None
    res = cv2.matchTemplate(screen, template, cv2.TM_CCOEFF_NORMED)
    _min_val, max_val, _min_loc, max_loc = cv2.minMaxLoc(res)
    if max_val >= threshold:
        return int(max_loc[0]), int(max_loc[1])
    return None


def ocr_region(screen_png: bytes, roi: tuple[int, int, int, int],
               tesseract_cmd: str, upscale: int = 1, psm: int = 7) -> str:
    """OCR (tesseract) a region as (x, y, w, h); returns raw text, e.g. '2d 23h'."""
    import numpy as np
    cv2 = _cv2()
    pytesseract = _pytesseract(tesseract_cmd)
    arr = np.frombuffer(screen_png, dtype=np.uint8)
    screen = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if screen is None:
        return ""
    x, y, w, h = roi
    crop = screen[y:y + h, x:x + w]
    if crop.size == 0:
        return ""
    if upscale > 1:
        crop = cv2.resize(crop, (crop.shape[1] * upscale, crop.shape[0] * upscale),
                          interpolation=cv2.INTER_CUBIC)
    return pytesseract.image_to_string(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY),
                                       config=f"--psm {int(psm)}").strip()


def parse_shield_countdown(text: str) -> float:
    """Parse '2d 23h' -> hours remaining (float)."""
    import re
    text = text.lower().replace(" ", "")
    m = re.search(r"(\d+(?:\.\d+)?)d", text)
    h = re.search(r"(\d+(?:\.\d+)?)h", text)
    days = float(m.group(1)) if m else 0.0
    hours = float(h.group(1)) if h else 0.0
    return days * 24 + hours


if __name__ == "__main__":
    import sys

    _, mode, *rest = sys.argv
    if mode == "parse":
        for s in rest:
            print(s, "->", parse_shield_countdown(s), "h")
    else:
        raise SystemExit("usage: python vision.py parse '2d 23h' ...")