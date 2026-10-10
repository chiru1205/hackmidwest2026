"""Usage: python scripts/simulate.py [count] [lat] [lng]  -- starts the crowd simulation and prints stats."""
import sys
import time

import httpx

BASE = "http://localhost:8000"


def main() -> None:
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    lat = float(sys.argv[2]) if len(sys.argv) > 2 else 39.0420
    lng = float(sys.argv[3]) if len(sys.argv) > 3 else -94.5950
    try:
        r = httpx.post(f"{BASE}/api/admin/simulate", json={"count": count, "lat": lat, "lng": lng}, timeout=30)
        print("simulate:", r.status_code, r.text)
        time.sleep(max(2.0, count / 25.0 + 1))
        print("stats:", httpx.get(f"{BASE}/api/stats", timeout=10).json())
    except Exception as e:
        print(f"could not reach {BASE}: {type(e).__name__}: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
