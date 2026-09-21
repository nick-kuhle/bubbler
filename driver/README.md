# Home agent (Python driver) — starter skeleton

Bare-bones structure for the always-on agent on the N150. Stubs are documented so a dev team
can fill in the real implementation. See `../docs/` for the full spec.

## Layout

```
driver/
  evony.py             # orchestration: run flow, run lock, reporting
  vision.py            # OpenCV template match + tesseract OCR
  iphone/transport.py  # USB transport: iproxy+SSH (working) / Hermes Touch HTTP (target)
  config.example.yaml  # config template (NO secrets)
  requirements.txt     # python deps
  calibration/         # reference screenshots + ROI maps (populated in calibrate phase)
```

## Quick start (dev)

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp config.example.yaml config.yaml   # fill in real values (never commit config.yaml)
# device must be plugged in, tunnel open:
iproxy 4044:22 &
python evony.py --once   # run a manual test pass against the configured account
```

**No secrets in the repo** — `config.yaml` is git-ignored; commit only `config.example.yaml`.