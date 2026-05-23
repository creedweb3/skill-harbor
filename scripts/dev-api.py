"""Dev API — watchfiles restarts uvicorn instead of uvicorn --reload (stable on Windows)."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1] / "backend"

cmd = [
    sys.executable,
    "-m",
    "watchfiles",
    "--filter",
    "python",
    "--verbosity",
    "warning",
    f"{sys.executable} -m uvicorn main:app --host 127.0.0.1 --port 8765",
    "studio",
    "main.py",
]

raise SystemExit(subprocess.call(cmd, cwd=BACKEND))
