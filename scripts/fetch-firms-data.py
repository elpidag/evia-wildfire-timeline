"""
Fetch FIRMS active-fire detections for the Evia 2021 wildfire reconstruction.

Downloads historical Standard Processing data from MODIS, VIIRS SNPP, and VIIRS NOAA-20.
DAY_RANGE is limited to 1..5, so we fetch in 5-day chunks.

Usage:
    python3 scripts/fetch-firms-data.py
"""

import os
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:
    print("ERROR: 'requests' library not found. Install with: pip3 install requests")
    sys.exit(1)

# ── Config ──

MAP_KEY = "4d78e9659a72ba46604301c90b6e8738"

# AOI bounding box: W, S, E, N (covers Greece broadly for the 2021 fires)
BBOX = "19.1,34.4,28.8,41.5"

SOURCES = ["MODIS_SP", "VIIRS_SNPP_SP", "VIIRS_NOAA20_SP"]

# Fetch August 1-24, 2021 in 5-day chunks
CHUNKS = [
    ("2021-08-01", 5),  # Aug 1-5
    ("2021-08-06", 5),  # Aug 6-10
    ("2021-08-11", 5),  # Aug 11-15
    ("2021-08-16", 5),  # Aug 16-20
    ("2021-08-21", 4),  # Aug 21-24
]

OUT_DIR = Path("data/raw/firms")
BASE_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"

# ── Main ──

def fetch_chunk(source: str, start_date: str, day_range: int) -> str | None:
    """Fetch one chunk of FIRMS data as CSV text."""
    url = f"{BASE_URL}/{MAP_KEY}/{source}/{BBOX}/{day_range}/{start_date}"
    print(f"  GET {source} {start_date} +{day_range}d ... ", end="", flush=True)

    try:
        resp = requests.get(url, timeout=120)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"FAILED: {e}")
        return None

    lines = resp.text.strip().split("\n")
    data_lines = len(lines) - 1 if len(lines) > 1 else 0
    print(f"{data_lines} detections")
    return resp.text


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    total_files = 0
    total_detections = 0

    for source in SOURCES:
        print(f"\n[{source}]")
        for start_date, day_range in CHUNKS:
            csv_text = fetch_chunk(source, start_date, day_range)
            if csv_text is None:
                continue

            out_path = OUT_DIR / f"{source}_{start_date}.csv"
            out_path.write_text(csv_text, encoding="utf-8")
            total_files += 1

            lines = csv_text.strip().split("\n")
            total_detections += max(0, len(lines) - 1)

            # Be polite to the API
            time.sleep(1)

    print(f"\nDone: {total_files} files, {total_detections} total detections")
    print(f"Output: {OUT_DIR}/")


if __name__ == "__main__":
    main()
