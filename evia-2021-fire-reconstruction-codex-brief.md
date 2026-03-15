# Evia 2021 wildfire reconstruction for Astro/React — implementation brief for Codex

## Goal

Build a research-grade interactive map for the **Evia 2021 wildfires** that can:

1. show **active-fire detections over time** at hourly/sub-daily resolution,
2. show **burn scar growth by day** for August 2021,
3. show **daily satellite imagery** underneath,
5. run inside an **Astro site** with a **React** map component.

This should be built in a way that is methodologically defensible for OSINT / evidentiary research. Do **not** fake an “hourly burn scar” if the source data only supports daily burn-date inference.

---

## Critical methodological rules

### What the interface must represent

- **Active fire layer** = time-stamped satellite detections from FIRMS.
- **Burn scar layer** = daily cumulative scar derived from burned-area **Burn Date** products.
- **Imagery layer** = daily VIIRS/MODIS-style visual context from NASA GIBS / Worldview.

### What the interface must *not* claim

- Do **not** claim that hotspot points are the fire perimeter.
- Do **not** claim that the burn scar is available hourly.
- Do **not** use NOAA-21 for a 2021 reconstruction.
- Do **not** use present-day NRT feeds as the main historical 2021 source when FIRMS historical standard-processing data exists.

---

## Recommended stack

Use this stack for the first implementation:

- **Astro** for the page shell
- **React** for the map UI
- **Python** scripts for ETL / preprocessing
- **Static JSON/GeoJSON assets** generated ahead of time and served from `/public/data`
- **NASA GIBS WMS or WMTS** as the external imagery source


---

## Data sources to use

## 1) FIRMS historical active-fire detections

Use the **FIRMS Area API** with the historical **Standard Processing** datasets:

- `MODIS_SP`
- `VIIRS_SNPP_SP`
- `VIIRS_NOAA20_SP`

Do **not** use:
- `VIIRS_NOAA21_*` (not relevant for 2021)
- `*_NRT` as the primary historical source for the 2021 reconstruction

Important API facts:
- bbox format is `west,south,east,north`
- `DAY_RANGE` is limited to `1..5`
- historical datasets are available through the same Area API
- API requires a free FIRMS **MAP_KEY** us this one: 4d78e9659a72ba46604301c90b6e8738

### FIRMS source URLs

- FIRMS Area API docs: https://firms.modaps.eosdis.nasa.gov/api/area/
- FIRMS API tutorial / dataset explanation: https://firms.modaps.eosdis.nasa.gov/content/academy/data_api/firms_api_use.html
- FIRMS MAP_KEY: https://firms.modaps.eosdis.nasa.gov/api/map_key/
- FIRMS WMS-Time docs: https://firms.modaps.eosdis.nasa.gov/mapserver/wms-info/
- FIRMS archive / download overview: https://firms.modaps.eosdis.nasa.gov/download/

### Notes

Use FIRMS detections for:
- hourly or sub-daily animation
- timestamped evidence of observed fire fronts / hotspots
- FRP / confidence filtering

Do **not** use them to generate a continuous perimeter.

---

## 2) Burned-area / burn-date products

Use burned-area products for **daily cumulative burn scar growth**, not for hourly animation.

Preferred:
- **VNP64A1 V002** (VIIRS/Suomi NPP Burned Area Monthly, 500 m)

Optional comparison / fallback:
- **MCD64A1 V061** (MODIS Terra+Aqua Burned Area Monthly, 500 m)

### Why these products

These products contain a **Burn Date** layer where each pixel stores the **day-of-year** when it burned.
That lets us derive a daily cumulative burn scar:

- for a selected day `D`, show pixels where `BurnDate > 0 && BurnDate <= D`

This is the correct way to show **scar growth by day**.

### Burned-area source URLs

- VNP64A1 V002 (preferred): https://www.earthdata.nasa.gov/data/catalog/lpcloud-vnp64a1-002
- VNP64A1 V001 (decommissioned; listed only to avoid using it): https://www.earthdata.nasa.gov/data/catalog/lpcloud-vnp64a1-001
- MCD64A1 V061: https://www.earthdata.nasa.gov/data/catalog/lpcloud-mcd64a1-061

### Download approach

For the first version, **do not automate Earthdata authentication unless necessary**.
Instead:

1. identify the tile(s) intersecting Evia/Attica,
2. manually download the August 2021 granules from Earthdata Search / Earthdata product pages,
3. place them in `data/raw/burned-area/`,
4. let the local ETL script process them.

This reduces first-run implementation failures.

If later automating download, use Earthdata-authenticated HTTPS. Avoid legacy FTP assumptions.

### Why not use the VIIRS-Land NRT page as the main burn-scar source

The VIIRS-Land NRT page is useful for imagery access and scripted NRT downloads, but for a historical 2021 website the core burn-scar logic should come from the standard burned-area products above.

Useful reference only:
- VIIRS-Land NRT overview: https://www.earthdata.nasa.gov/data/instruments/viirs/land-near-real-time-data

---

## 3) NASA GIBS imagery for daily visual context

Use NASA **GIBS** for the base imagery layer.

Use at least one false-color layer useful for burn scar interpretation:
- **VIIRS Corrected Reflectance False Color (M11-I2-I1)**

This is the key visual background layer for showing burn scars.

Optional:
- a true-color layer for orientation
- user toggle between true color and false color

### GIBS source URLs

- GIBS API access basics: https://nasa-gibs.github.io/gibs-api-docs/access-basics/
- NASA GIBS examples repo: https://github.com/nasa-gibs/gibs-web-examples
- VIIRS-Land page explaining why M11-I2-I1 is useful for burned areas:
  https://www.earthdata.nasa.gov/data/instruments/viirs/land-near-real-time-data

### Implementation guidance

For first implementation:
- prefer **GIBS WMS** or **WMTS**
- update the layer `TIME` parameter whenever the selected date changes
- keep all local evidentiary overlays independent of GIBS

---

## Overall build plan

Implement in this order:

1. create the AOI
2. fetch and preprocess FIRMS active-fire data
3. download and preprocess burn-date products
4. build local static data assets
5. build the Astro/React map UI
6. wire one date timeline to all layers
7. add provenance / source legend / method text

---

---

## Step 1 — Define the AOI

Create a single authoritative AOI polygon for the project.

use this rectangle box: W: 19.1°, N: 41.5°, E: 28.8°, S: 34.4°

Use the AOI polygon to:
- clip burned-area products
- filter FIRMS detections
- fit the map view
- reduce payload size

---

## Step 2 — Fetch FIRMS active-fire data

### Required datasets

Fetch all three:
- `MODIS_SP`
- `VIIRS_SNPP_SP`
- `VIIRS_NOAA20_SP`

### Query pattern

Because `DAY_RANGE` is limited to `1..5`, fetch the time window in chunks.

Example date chunks:
- 2021-08-03 for 5 days
- 2021-08-08 for 5 days
- 2021-08-13 for 2 days or another 5-day chunk

### Example endpoint

```text
https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{bbox}/{dayRange}/{startDate}
```

### Example sources

```text
MODIS_SP
VIIRS_SNPP_SP
VIIRS_NOAA20_SP
```

### Example Python download logic

```python
import csv
import io
import os
import requests
from datetime import date, timedelta

MAP_KEY = os.environ["FIRMS_MAP_KEY"]
BBOX = "WEST,SOUTH,EAST,NORTH"  # replace with AOI bbox
SOURCES = ["MODIS_SP", "VIIRS_SNPP_SP", "VIIRS_NOAA20_SP"]
CHUNKS = [
    ("2021-08-03", 5),
    ("2021-08-08", 5),
    ("2021-08-13", 5),
]

for source in SOURCES:
    for start_date, day_range in CHUNKS:
        url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{source}/{BBOX}/{day_range}/{start_date}"
        response = requests.get(url, timeout=60)
        response.raise_for_status()
        with open(f"data/raw/firms/{source}_{start_date}.csv", "w", encoding="utf-8") as f:
            f.write(response.text)
```

### Normalize the output

Merge all CSVs into one canonical dataset with fields like:

```json
{
  "id": "viirs-snpp-2021-08-05-1234-38.8-23.6",
  "source": "VIIRS_SNPP_SP",
  "satellite": "Suomi NPP",
  "latitude": 38.8123,
  "longitude": 23.6123,
  "acq_date": "2021-08-05",
  "acq_time_utc": "12:34",
  "timestamp_utc": "2021-08-05T12:34:00Z",
  "timestamp_local": "2021-08-05T15:34:00+03:00",
  "frp": 21.4,
  "confidence": "nominal",
  "daynight": "D"
}
```

### Frontend rule for animation

- For a selected datetime `T`, show detections where `timestamp_utc <= T`
- Allow toggling:
  - only current time slice
  - cumulative to selected time

Recommended default:
- cumulative to selected time

---

## Step 3 — Download burned-area granules

### Products

Required:
- VNP64A1 V002 for August 2021

Optional comparison:
- MCD64A1 V061 for August 2021

### Download strategy

Use manual Earthdata download for the first implementation:
- find the granule(s) covering Evia,
- download the August 2021 files,
- place them in `data/raw/burned-area/`

If multiple tiles intersect the AOI, include all intersecting tiles and mosaic them.

Do not block the first version on full Earthdata API automation.

---

## Step 4 — Process Burn Date into daily cumulative scar layers

### Correct logic

For each selected date:
1. convert date to **day-of-year**
2. read Burn Date band
3. mark a pixel as burned if:
   - `burnDate > 0`
   - `burnDate <= selectedDOY`
4. clip to AOI
5. polygonize
6. dissolve
7. simplify lightly
8. export as GeoJSON

### Important

This creates a **daily cumulative burn scar**, not an hourly perimeter.

### Suggested output files

```text
public/data/evia/burn-scar/cumulative/2021-08-03.geojson
public/data/evia/burn-scar/cumulative/2021-08-04.geojson
...
public/data/evia/burn-scar/cumulative/2021-08-14.geojson
```

### Python pseudocode

```python
from pathlib import Path
from datetime import datetime
import geopandas as gpd
import numpy as np
import rasterio
from rasterio.mask import mask
from rasterio.features import shapes
from shapely.geometry import shape
from shapely.ops import unary_union

AOI_PATH = "public/data/evia/aoi/evia-aoi.geojson"
BURN_RASTER_PATH = "data/raw/burned-area/VNP64A1_AUG2021.tif"  # derived from downloaded HDF/HDFEOS
OUT_DIR = Path("public/data/evia/burn-scar/cumulative")
OUT_DIR.mkdir(parents=True, exist_ok=True)

aoi = gpd.read_file(AOI_PATH).to_crs(4326)
aoi_geom = [aoi.unary_union.__geo_interface__]

with rasterio.open(BURN_RASTER_PATH) as src:
    clipped, transform = mask(src, aoi_geom, crop=True)
    burn = clipped[0]

for d in range(3, 15):
    dt = datetime(2021, 8, d)
    doy = int(dt.strftime("%j"))

    mask_arr = np.where((burn > 0) & (burn <= doy), 1, 0).astype("uint8")

    geoms = []
    for geom, value in shapes(mask_arr, transform=transform):
        if value == 1:
            geoms.append(shape(geom))

    if not geoms:
        continue

    dissolved = unary_union(geoms)

    gdf = gpd.GeoDataFrame(
        [{"date": dt.strftime("%Y-%m-%d"), "geometry": dissolved}],
        crs=src.crs
    ).to_crs(4326)

    gdf["geometry"] = gdf["geometry"].simplify(0.0005, preserve_topology=True)
    gdf.to_file(OUT_DIR / f"{dt.strftime('%Y-%m-%d')}.geojson", driver="GeoJSON")
```

### Practical note

The raw burned-area products come as HDF/HDFEOS.
Add a preprocessing step that extracts the Burn Date subdataset to GeoTIFF before the script above.

It is acceptable for the first version to do that conversion manually or via GDAL command-line tools.

---

## Step 6 — Build the Astro page

Create a page like:

```astro
---
import EviaFireMap from "../components/EviaFireMap";
---

<html lang="en">
  <head>
    <title>Evia 2021 Fire Reconstruction</title>
  </head>
  <body>
    <EviaFireMap client:only="react" />
  </body>
</html>
```

---

## Step 7 — Build the React map component

### UI requirements

The map UI should have:

- a **date slider** for 2021-08-03 → 2021-08-14
- an optional **time slider** for the active-fire layer
- toggles for:
  - Active Fires
  - Burn Scar (derived)
  - Copernicus Validation
  - True Color
  - False Color (M11-I2-I1)
- a legend
- a provenance / methodology panel

### Synchronization rules

When the selected date changes:
- update GIBS `TIME`
- load the correct daily burn-scar GeoJSON
- filter/show active-fire detections for that date range

### Default behavior

Default layers on:
- false-color GIBS imagery
- active fires
- derived burn scar

Validation layers should default off or semi-transparent.

---

## Step 8 — Implement the GIBS layer

### Preferred first implementation

Use a GIBS WMS or WMTS source whose date/time can be changed when the user changes the selected day.

Keep a helper like:

```ts
export function gibsDateParam(date: string) {
  return date; // YYYY-MM-DD
}
```

Then update the imagery source params with the selected date.

### Example implementation shape

```ts
const selectedDate = "2021-08-10";

// pseudocode only
gibsLayer.getSource().updateParams({
  TIME: selectedDate,
});
```

### Layer choices

Include:
- false color burn-scar-friendly layer (M11-I2-I1)
- optional true color layer for orientation

Do not hard-code unsupported layer identifiers without checking GIBS capabilities.
Use official GIBS capabilities or the examples repo patterns.

---

## Step 9 — Implement local overlay layers

### Active fires

Load all detections once from local JSON/GeoJSON.
Filter in memory by selected datetime and toggles.

### Burn scar

Do **not** load all days at once unless the files are tiny.
Load the selected day’s GeoJSON on demand.

---

## Styling guidance

Use distinct visual language:

- **Active fires**:
  - circles
  - size by FRP
  - color by source or confidence
- **Derived burn scar**:
  - semi-transparent filled polygon
- **Imagery**:
  - base layer only, no misleading color edits

Add clear legend text:
- “Active-fire detections”
- “Daily cumulative burn scar (derived from Burn Date)”
- “Copernicus EMS validation perimeter”

---

## Time handling

This matters.

### Store canonical timestamps in UTC

FIRMS acquisition times are UTC.
Store canonical values in UTC and only format into local time for display.

Recommended:
- `timestamp_utc` for filtering
- `timestamp_local` for tooltips/UI

### Local display timezone

For Greece in August 2021, display times in local time where useful, but keep UTC internally consistent.

---

## Performance guidance

For this Evia-only study window, static assets are sufficient.

Recommended payload strategy:
- active fires: one merged JSON/GeoJSON file
- burn scar: one GeoJSON per day
- Copernicus: one GeoJSON per checkpoint

If later scaling to many fires or years:
- convert to vector tiles / PMTiles
- add server-side tile generation
- cache imagery

Do **not** over-engineer the first version.

---

## Explicit non-goals for the first version

Do not spend the first implementation cycle on:
- full Earthdata auth automation
- server-side PostGIS
- custom raster tile servers
- “hourly burn scar” generation
- AI / ML spread estimation

Build the evidentiary synchronized map first.

---

## Acceptance criteria

The implementation is correct if all of the following are true:

1. The date slider updates the imagery date correctly.
2. The active-fire layer shows time-stamped detections from FIRMS historical standard-processing datasets.
3. NOAA-21 is not used anywhere for 2021.
4. The burn-scar layer changes by **day**, not by hour.
5. The burn-scar layer is derived from Burn Date logic, not from hotspot interpolation.
7. The map legend and methodology panel clearly distinguish:
   - detections
   - derived scar
   - validation perimeters
   - imagery
8. The site runs as a normal Astro page with a client-side React map component.

---

## Common mistakes to avoid

1. **Wrong**: using the current live FIRMS map as the primary data backend  
   **Right**: preprocess historical 2021 FIRMS data into local assets

2. **Wrong**: animating the burn scar hourly from hotspots  
   **Right**: animate hotspots hourly, burn scar daily

3. **Wrong**: using only one sensor  
   **Right**: include MODIS + VIIRS SNPP + VIIRS NOAA-20 historical detections

4. **Wrong**: using VNP64A1 V001 because it is easy to find  
   **Right**: prefer VNP64A1 V002

5. **Wrong**: mixing UTC and local time without discipline  
   **Right**: store UTC, display local time if desired


7. **Wrong**: waiting on perfect automation before building the map  
   **Right**: manually download the burn-date granules first, then automate later

---

## Nice-to-have improvements after the first version

- add a split-view slider (imagery vs imagery)
- add source-specific toggles for SNPP / NOAA-20 / MODIS
- add FRP threshold slider
- add tooltip with acquisition time and source
- add a “compare to Copernicus” mode
- add witness media / news markers with timestamps
- add exportable citation / provenance metadata for each frame

---

## Minimal implementation task list for Codex

1. create the Astro page and React map component
2. add OpenLayers and render a base map
3. add GIBS imagery layer with date-driven `TIME`
4. add a date slider
5. add FIRMS ETL scripts and local active-fire JSON output
6. render active-fire points with filtering by selected datetime
7. add burn-date preprocessing script and one GeoJSON per day
8. load/display burn-scar GeoJSON for the selected day
10. add legend + provenance panel
11. verify all acceptance criteria

---

## Source list to consult, in order

Read these in this order before coding.

### Primary implementation sources

1. FIRMS Area API  
   https://firms.modaps.eosdis.nasa.gov/api/area/

2. FIRMS API tutorial / examples  
   https://firms.modaps.eosdis.nasa.gov/content/academy/data_api/firms_api_use.html

3. FIRMS WMS-Time docs  
   https://firms.modaps.eosdis.nasa.gov/mapserver/wms-info/

4. NASA GIBS access basics  
   https://nasa-gibs.github.io/gibs-api-docs/access-basics/

5. NASA GIBS examples repo  
   https://github.com/nasa-gibs/gibs-web-examples

6. VNP64A1 V002 product page  
   https://www.earthdata.nasa.gov/data/catalog/lpcloud-vnp64a1-002

7. MCD64A1 V061 product page  
   https://www.earthdata.nasa.gov/data/catalog/lpcloud-mcd64a1-061

8. VIIRS-Land NRT imagery overview  
   https://www.earthdata.nasa.gov/data/instruments/viirs/land-near-real-time-data

### Context / validation sources

10. NASA Earth Observatory article on Greece fires  
    https://science.nasa.gov/earth/earth-observatory/fire-consumes-large-swaths-of-greece-148682/

---

## Final instruction to Codex

The correct conceptual model is:

- **hourly/sub-daily detections** from FIRMS historical datasets,
- **daily cumulative scar** from Burn Date products,
- **daily imagery** from GIBS,
- all synchronized by one common timeline.
