/** Fire reconstruction map constants */

/** Map center: northern Evia */
export const MAP_CENTER: [number, number] = [23.3, 38.85];
export const MAP_ZOOM = 9;

/** Date range for the reconstruction */
export const FIRE_START = '2021-08-03';
export const FIRE_END = '2021-08-14';

/** All dates in the reconstruction window */
export const FIRE_DATES: string[] = [];
for (let d = 3; d <= 14; d++) {
  FIRE_DATES.push(`2021-08-${String(d).padStart(2, '0')}`);
}

/** GIBS WMTS base URL (EPSG:3857 / Google Maps compatible) */
export const GIBS_WMTS_BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';

/** GIBS layer identifiers */
export const GIBS_LAYERS = {
  falseColor: 'VIIRS_SNPP_CorrectedReflectance_BandsM11-I2-I1',
  trueColor: 'VIIRS_SNPP_CorrectedReflectance_TrueColor',
} as const;

/** MODIS fallback for dates where VIIRS has no coverage */
export const GIBS_MODIS_FALLBACK: Record<string, { trueColor: string; falseColor: string }> = {
  '2021-08-04': {
    trueColor: 'MODIS_Terra_CorrectedReflectance_TrueColor',
    falseColor: 'MODIS_Terra_CorrectedReflectance_Bands721',
  },
};

/** Fire detection source colors */
export const SOURCE_COLORS: Record<string, string> = {
  MODIS_SP: '#ff6b35',
  VIIRS_SNPP_SP: '#ff2e2e',
  VIIRS_NOAA20_SP: '#ffd700',
};

export const SOURCE_LABELS: Record<string, string> = {
  MODIS_SP: 'MODIS (Terra/Aqua)',
  VIIRS_SNPP_SP: 'VIIRS (Suomi NPP)',
  VIIRS_NOAA20_SP: 'VIIRS (NOAA-20)',
};
