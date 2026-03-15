"""
Process VNP64A1 burned-area HDF into daily cumulative burn scar GeoJSONs.

Reads the Burn Date band, converts sinusoidal pixel coordinates to WGS84,
and for each day generates a cumulative burn scar polygon.

Usage:
    python3 scripts/process-burn-scar.py

Output:
    public/data/evia/burn-scar/cumulative/2021-08-03.geojson
    ...
    public/data/evia/burn-scar/cumulative/2021-08-14.geojson
"""

import json
import sys
from datetime import datetime
from pathlib import Path

import numpy as np

try:
    from pyhdf.SD import SD, SDC
except ImportError:
    print("ERROR: pyhdf not installed. Run: pip3 install --break-system-packages pyhdf")
    sys.exit(1)

try:
    from shapely.geometry import shape, mapping
    from shapely.ops import unary_union
except ImportError:
    print("ERROR: shapely not installed. Run: pip3 install --break-system-packages shapely")
    sys.exit(1)

# ── Config ──

HDF_PATH = Path("data/raw/burned-area/VNP64A1.A2021213.h19v05.002.2023198172838.hdf")
OUT_DIR = Path("public/data/evia/burn-scar/cumulative")

# AOI in WGS84 (focused on Evia/Attica fire region)
AOI = {"west": 22.5, "south": 37.5, "east": 24.5, "north": 39.5}

# Sinusoidal projection parameters (from HDF metadata)
# Tile h19v05
UL_X = 1111950.519677
UL_Y = 4447802.078664
LR_X = 2223901.039344
LR_Y = 3335851.558997
GRID_SIZE = 2400
R = 6371007.181  # Earth radius for sinusoidal projection

PIXEL_SIZE_X = (LR_X - UL_X) / GRID_SIZE
PIXEL_SIZE_Y = (LR_Y - UL_Y) / GRID_SIZE  # negative (Y decreases downward)


def sinusoidal_to_wgs84(x: float, y: float) -> tuple[float, float]:
    """Convert sinusoidal coordinates to WGS84 (lon, lat)."""
    lat_rad = y / R
    lat = np.degrees(lat_rad)
    lon = np.degrees(x / (R * np.cos(lat_rad)))
    return float(lon), float(lat)


def pixel_to_sinusoidal(col: int, row: int) -> tuple[float, float]:
    """Convert pixel (col, row) to sinusoidal (x, y) at pixel center."""
    x = UL_X + (col + 0.5) * PIXEL_SIZE_X
    y = UL_Y + (row + 0.5) * PIXEL_SIZE_Y
    return x, y


def pixel_to_wgs84(col: int, row: int) -> tuple[float, float]:
    """Convert pixel (col, row) to WGS84 (lon, lat)."""
    x, y = pixel_to_sinusoidal(col, row)
    return sinusoidal_to_wgs84(x, y)


def pixel_to_polygon_coords(col: int, row: int) -> list[list[float]]:
    """Generate WGS84 polygon coords for a single pixel."""
    corners_sin = [
        (UL_X + col * PIXEL_SIZE_X, UL_Y + row * PIXEL_SIZE_Y),
        (UL_X + (col + 1) * PIXEL_SIZE_X, UL_Y + row * PIXEL_SIZE_Y),
        (UL_X + (col + 1) * PIXEL_SIZE_X, UL_Y + (row + 1) * PIXEL_SIZE_Y),
        (UL_X + col * PIXEL_SIZE_X, UL_Y + (row + 1) * PIXEL_SIZE_Y),
        (UL_X + col * PIXEL_SIZE_X, UL_Y + row * PIXEL_SIZE_Y),
    ]
    return [list(sinusoidal_to_wgs84(x, y)) for x, y in corners_sin]


def in_aoi(lon: float, lat: float) -> bool:
    """Check if a point is within the AOI."""
    return AOI["west"] <= lon <= AOI["east"] and AOI["south"] <= lat <= AOI["north"]


def main():
    if not HDF_PATH.exists():
        print(f"ERROR: HDF file not found: {HDF_PATH}")
        sys.exit(1)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # Read burn date band
    print(f"[burn-scar] Reading {HDF_PATH.name}")
    f = SD(str(HDF_PATH), SDC.READ)
    burn = f.select("Burn Date").get()
    f.end()

    print(f"[burn-scar] Grid: {burn.shape}, burned pixels total: {(burn > 0).sum()}")

    # Pre-filter: find all burned pixels in our date range that fall within AOI
    # August 2021 = DOY 213 (Aug 1) to DOY 243 (Aug 31)
    # We care about Aug 3-14 = DOY 215-226 for the main fire, but show all Aug burns
    aug_start_doy = 213  # Aug 1
    aug_end_doy = 243    # Aug 31

    burned_rows, burned_cols = np.where((burn >= aug_start_doy) & (burn <= aug_end_doy))
    print(f"[burn-scar] August burned pixels (before AOI filter): {len(burned_rows)}")

    # Convert to WGS84 and filter by AOI
    valid_pixels = []
    for i in range(len(burned_rows)):
        row, col = int(burned_rows[i]), int(burned_cols[i])
        doy = int(burn[row, col])
        lon, lat = pixel_to_wgs84(col, row)
        if in_aoi(lon, lat):
            valid_pixels.append((row, col, doy, lon, lat))

    print(f"[burn-scar] Pixels in AOI: {len(valid_pixels)}")

    if not valid_pixels:
        print("[burn-scar] No burned pixels found in AOI. Check tile coverage.")
        return

    # Generate daily cumulative GeoJSONs
    for day in range(3, 25):  # Aug 3 to Aug 24
        dt = datetime(2021, 8, day)
        target_doy = int(dt.strftime("%j"))
        date_str = dt.strftime("%Y-%m-%d")

        # Cumulative: all burned pixels up to this day
        day_pixels = [(r, c, d, lon, lat) for r, c, d, lon, lat in valid_pixels if d <= target_doy]

        if not day_pixels:
            continue

        # Build pixel polygons
        polys = []
        for row, col, doy, lon, lat in day_pixels:
            coords = pixel_to_polygon_coords(col, row)
            polys.append(shape({"type": "Polygon", "coordinates": [coords]}))

        # Dissolve into a single multipolygon and simplify
        dissolved = unary_union(polys)
        simplified = dissolved.simplify(0.001, preserve_topology=True)

        geojson = {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "properties": {
                    "date": date_str,
                    "pixel_count": len(day_pixels),
                    "area_km2": round(len(day_pixels) * 0.25, 1),  # ~500m pixels = 0.25 km²
                },
                "geometry": mapping(simplified),
            }],
        }

        out_path = OUT_DIR / f"{date_str}.geojson"
        out_path.write_text(json.dumps(geojson), encoding="utf-8")
        size_kb = out_path.stat().st_size / 1024
        print(f"  {date_str}: {len(day_pixels)} pixels, ~{len(day_pixels) * 0.25:.0f} km², {size_kb:.0f} KB")

    print(f"\n[burn-scar] Output: {OUT_DIR}/")


if __name__ == "__main__":
    main()
