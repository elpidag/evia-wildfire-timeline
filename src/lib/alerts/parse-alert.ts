import type { AlertType, Gazetteer, GeocodedLocation } from './schema';

/**
 * Classify alert type based on Greek keywords in the text.
 */
export function classifyAlertType(text: string): AlertType {
  const lower = text.toLowerCase();

  if (lower.includes('εκκενώστε') || lower.includes('εκκένωση') || lower.includes('απομακρυνθείτε')) {
    return 'evacuation';
  }

  if (lower.includes('κλείστε') || lower.includes('παραμείνετε') || lower.includes('μείνετε')) {
    return 'shelter_in_place';
  }

  if (lower.includes('κίνδυνος') || lower.includes('επικίνδυν')) {
    return 'fire_danger';
  }

  return 'general';
}

/**
 * Expand single-word hashtags into compound location names.
 *
 * Twitter parses "#Αγία Σκέπη" as hashtag "Αγία" + plain text "Σκέπη".
 * This function reads the word following each hashtag in the text and checks
 * if the concatenated or underscore-joined form exists in the gazetteer.
 */
export function expandCompoundHashtags(
  text: string,
  hashtags: Array<{ tag: string; start: number; end: number }>,
  gazetteer: Gazetteer
): Array<{ tag: string; start: number; end: number }> {
  return hashtags.map((h) => {
    // Read the word(s) immediately after the hashtag's end position
    const after = text.substring(h.end);
    const match = after.match(/^([^\s,;.#‼!⚠🆘]+)(?:\s+([^\s,;.#‼!⚠🆘]+))?/);
    if (!match) return h;

    const word1 = match[1];
    const word2 = match[2];

    // Try compound keys (most specific first)
    const candidates: string[] = [];
    if (word2) {
      candidates.push(h.tag + word1 + word2);
      candidates.push(h.tag + '_' + word1 + '_' + word2);
    }
    candidates.push(h.tag + word1);
    candidates.push(h.tag + '_' + word1);

    for (const candidate of candidates) {
      const entry = gazetteer[candidate];
      if (entry && entry.lat !== null) {
        return { ...h, tag: candidate };
      }
    }

    return h;
  });
}

/**
 * Extract from/to locations based on hashtag positions relative to "προς" (towards).
 * Hashtags before "προς" = from locations (danger zone)
 * Hashtags after "προς" = to locations (safe destination)
 */
export function extractFromToLocations(
  text: string,
  hashtags: Array<{ tag: string; start: number; end: number }>,
  gazetteer: Gazetteer,
  fireRegion?: string
): { from: GeocodedLocation[]; to: GeocodedLocation[] } {
  const prosIndex = text.indexOf('προς');

  const fromLocations: GeocodedLocation[] = [];
  const toLocations: GeocodedLocation[] = [];

  for (const hashtag of hashtags) {
    // Try region-specific override first (e.g. "Παλαιοχώρι@evia"), then plain tag
    const regionKey = fireRegion ? `${hashtag.tag}@${fireRegion}` : null;
    const entry = (regionKey && gazetteer[regionKey]) || gazetteer[hashtag.tag];
    if (!entry || entry.lat === null || entry.lon === null) {
      continue;
    }

    const geocoded: GeocodedLocation = {
      tag: hashtag.tag,
      lat: entry.lat,
      lon: entry.lon,
      nameEn: entry.nameEn
    };

    if (prosIndex === -1) {
      // No "προς" — all hashtags are from-locations
      fromLocations.push(geocoded);
    } else if (hashtag.start < prosIndex) {
      fromLocations.push(geocoded);
    } else {
      toLocations.push(geocoded);
    }
  }

  return { from: fromLocations, to: toLocations };
}

/**
 * Determine the primary fire region for an alert based on its hashtag locations.
 * Uses majority vote from geocoded hashtag regions.
 */
export function determineFireRegion(
  hashtags: Array<{ tag: string }>,
  gazetteer: Gazetteer
): string {
  // Explicit region qualifiers (null-coord entries like #Ηλείας, #Ευβοίας, #Αττικής)
  // override the majority vote — they're direct signals from the tweet author
  for (const hashtag of hashtags) {
    const entry = gazetteer[hashtag.tag];
    if (entry && entry.lat === null && entry.region !== 'other') {
      return entry.region;
    }
  }

  // Fallback: majority vote from geocoded hashtag regions
  const regionCounts = new Map<string, number>();

  for (const hashtag of hashtags) {
    const entry = gazetteer[hashtag.tag];
    if (!entry || entry.region === 'other') continue;
    regionCounts.set(entry.region, (regionCounts.get(entry.region) ?? 0) + 1);
  }

  if (regionCounts.size === 0) return 'other';

  let bestRegion = 'other';
  let bestCount = 0;
  for (const [region, count] of regionCounts) {
    if (count > bestCount) {
      bestCount = count;
      bestRegion = region;
    }
  }

  return bestRegion;
}

/**
 * Compute the centroid of a set of geocoded locations.
 */
export function computeCentroid(locations: GeocodedLocation[]): [number, number] | null {
  if (locations.length === 0) return null;

  let sumLon = 0;
  let sumLat = 0;
  for (const loc of locations) {
    sumLon += loc.lon;
    sumLat += loc.lat;
  }

  return [sumLon / locations.length, sumLat / locations.length];
}

/**
 * Build evacuation edges: pairs of (from → to) coordinates.
 */
export function buildEvacuationEdges(
  from: GeocodedLocation[],
  to: GeocodedLocation[]
): Array<{ from: [number, number]; to: [number, number] }> {
  if (from.length === 0 || to.length === 0) return [];

  const edges: Array<{ from: [number, number]; to: [number, number] }> = [];

  for (const f of from) {
    for (const t of to) {
      edges.push({
        from: [f.lon, f.lat],
        to: [t.lon, t.lat]
      });
    }
  }

  return edges;
}
