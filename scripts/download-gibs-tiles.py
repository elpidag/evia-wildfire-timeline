"""
Pre-download GIBS tiles for the Evia fire reconstruction.

Downloads all tiles for the study area (Evia/Attica) at zoom levels 7-9
for all fire dates and both imagery layers (true color + false color).

Tiles are saved to public/data/evia/gibs/{layer}/{date}/{z}/{y}/{x}.jpg
and served statically — no live NASA requests during map use.

Usage:
    python3 scripts/download-gibs-tiles.py
"""

import math
import os
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:
    print("ERROR: requests not installed")
    sys.exit(1)

# ── Config ──

GIBS_BASE = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best"
TILE_MATRIX = "GoogleMapsCompatible_Level9"

# Study area: Evia / Attica / broader Greece fire region
LON_MIN, LAT_MIN = 22.0, 37.5
LON_MAX, LAT_MAX = 24.5, 39.5

ZOOM_LEVELS = [7, 8, 9]

DATES = [f"2021-08-{d:02d}" for d in range(3, 15)]

# Layers to download
LAYERS = {
    "viirs-tc": "VIIRS_SNPP_CorrectedReflectance_TrueColor",
    "viirs-fc": "VIIRS_SNPP_CorrectedReflectance_BandsM11-I2-I1",
    "modis-tc": "MODIS_Terra_CorrectedReflectance_TrueColor",
    "modis-fc": "MODIS_Terra_CorrectedReflectance_Bands721",
}

# Only download MODIS for dates where VIIRS has gaps
MODIS_ONLY_DATES = {"2021-08-04"}

OUT_DIR = Path("public/data/evia/gibs")


def tile_range(zoom):
    """Calculate tile x/y range for the study area at a given zoom."""
    def lon_to_x(lon):
        return int((lon + 180) / 360 * (2 ** zoom))

    def lat_to_y(lat):
        return int(
            (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi)
            / 2 * (2 ** zoom)
        )

    return lon_to_x(LON_MIN), lon_to_x(LON_MAX), lat_to_y(LAT_MAX), lat_to_y(LAT_MIN)


def download_tile(layer_id, date, z, y, x, out_path):
    """Download a single GIBS tile."""
    url = f"{GIBS_BASE}/{layer_id}/default/{date}/{TILE_MATRIX}/{z}/{y}/{x}.jpg"
    try:
        resp = requests.get(url, timeout=15)
        if resp.status_code == 200 and len(resp.content) > 100:
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_bytes(resp.content)
            return True
    except Exception:
        pass
    return False


def main():
    # Calculate total tiles
    total = 0
    for z in ZOOM_LEVELS:
        x0, x1, y0, y1 = tile_range(z)
        total += (x1 - x0 + 1) * (y1 - y0 + 1)

    # For each date, download VIIRS (all dates) + MODIS (fallback dates only)
    layers_per_date = {}
    for date in DATES:
        if date in MODIS_ONLY_DATES:
            layers_per_date[date] = {
                "tc": ("modis-tc", LAYERS["modis-tc"]),
                "fc": ("modis-fc", LAYERS["modis-fc"]),
            }
        else:
            layers_per_date[date] = {
                "tc": ("viirs-tc", LAYERS["viirs-tc"]),
                "fc": ("viirs-fc", LAYERS["viirs-fc"]),
            }

    total_tiles = total * len(DATES) * 2  # 2 layer types per date
    print(f"[gibs] Downloading {total_tiles} tiles for {len(DATES)} dates")
    print(f"[gibs] Area: {LON_MIN},{LAT_MIN} to {LON_MAX},{LAT_MAX}")
    print(f"[gibs] Zoom levels: {ZOOM_LEVELS}")
    print()

    downloaded = 0
    skipped = 0
    failed = 0

    for date in DATES:
        for layer_type, (folder_name, layer_id) in layers_per_date[date].items():
            for z in ZOOM_LEVELS:
                x0, x1, y0, y1 = tile_range(z)
                for y in range(y0, y1 + 1):
                    for x in range(x0, x1 + 1):
                        out_path = OUT_DIR / folder_name / date / str(z) / str(y) / f"{x}.jpg"

                        if out_path.exists():
                            skipped += 1
                            continue

                        ok = download_tile(layer_id, date, z, y, x, out_path)
                        if ok:
                            downloaded += 1
                        else:
                            failed += 1

                        # Rate limit: ~20 req/sec to be polite
                        time.sleep(0.05)

            print(f"  {date} {layer_type}: done")

    print(f"\n[gibs] Downloaded: {downloaded}, Skipped: {skipped}, Failed: {failed}")
    print(f"[gibs] Output: {OUT_DIR}/")


if __name__ == "__main__":
    main()
