"""Dev server for Windows: runs the API and force-restarts it whenever a backend/contracts .py file changes.

uvicorn's own --reload can hang on Windows (it waits for the old worker, which never exits while live-update
connections are open). This watcher kills the whole process tree and starts a fresh one instead.

Run from the repo root:   .venv\\Scripts\\python scripts\\dev_server.py   (optional: --port 8000)
"""
import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WATCH = [ROOT / "backend", ROOT / "contracts"]
DEBOUNCE_S = 1.5


def signature() -> float:
    newest = 0.0
    for base in WATCH:
        for p in base.rglob("*.py"):
            if "__pycache__" in p.parts:
                continue
            try:
                newest = max(newest, p.stat().st_mtime)
            except OSError:
                pass
    return newest


def start(port: int) -> subprocess.Popen:
    print(f"[dev] starting API on port {port}", flush=True)
    return subprocess.Popen([sys.executable, "-m", "uvicorn", "backend.api.main:app", "--host", "127.0.0.1",
                             "--port", str(port), "--timeout-graceful-shutdown", "2"], cwd=ROOT)


def stop(proc: subprocess.Popen) -> None:
    if proc.poll() is None:
        subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"], capture_output=True)
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            pass


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8000)
    port = ap.parse_args().port
    proc = start(port)
    seen = signature()
    pending_since = None
    try:
        while True:
            time.sleep(1.0)
            now = signature()
            if now != seen:
                seen = now
                pending_since = time.time()  # wait until edits settle (half-saved files)
            if pending_since and time.time() - pending_since >= DEBOUNCE_S:
                pending_since = None
                print("[dev] change detected, restarting", flush=True)
                stop(proc)
                proc = start(port)
            elif proc.poll() is not None and pending_since is None:
                # crashed (for example a syntax error mid-edit): wait for the next change instead of looping
                if signature() != seen or True:
                    time.sleep(2.0)
                    if signature() != seen:
                        continue
                    print("[dev] API exited; waiting for a file change to retry", flush=True)
                    while signature() == seen:
                        time.sleep(1.0)
    except KeyboardInterrupt:
        pass
    finally:
        stop(proc)


if __name__ == "__main__":
    os.chdir(ROOT)
    main()
