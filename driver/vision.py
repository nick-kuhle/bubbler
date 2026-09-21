"""Vision helpers: OpenCV template matching + tesseract OCR.

Calibration reference screenshots + ROI maps live in driver/calibration/.
See docs/04-evony-flow.md for the exact targets.
"""

from __future__ import annotations

from pathlib import Path

import cv2


class TemplateLibrary:
    """Load reference templates + ROI maps once at startup."""

    def __init__(self, calibration_dir: str):
        self.dir = Path(calibration_dir)
        self.templates = {}  # name -> (img, roi) filled by load()

    def load(self) -> None:
        # TODO(team): load each calibration PNG + its ROI map (yaml per template).
        raise NotImplementedError


def find_template(screen: object, name: str, threshold: float = 0.85) -> tuple[int, int] | None:
    """Return (x, y) of the template's best match on the given screen, or None."""
    # TODO(team): cv2.matchTemplate over screen BGR numpy array; threshold on maxVal.
    raise NotImplementedError


def ocr_region(screen: object, roi: tuple[int, int, int, int]) -> str:
    """OCR (tesseract) the countdown ROI, e.g. '2d 23h'. Returns raw text."""
    # TODO(team): crop screen to roi, run pytesseract.image_to_string, strip.
    raise NotImplementedError


def parse_shield_countdown(text: str) -> float:
    """Parse '2d 23h' -> hours remaining (float)."""
    d = h = 0.0
    text = text.lower()
    if "d" in text:
        d = float(text.split("d")[0])
    if "h" in text:
        h = float(text.split("d")[-1].split("h")[0])
    return d * 24 + h