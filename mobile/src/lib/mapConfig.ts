/** Interactive map config. Approx Country centroids per language + the watercolour
 *  tile key. Leave TILE_KEY empty until a free Stadia/MapTiler key is provided —
 *  the Map tab falls back to the generated watercolour maps until then. */
export const TILE_KEY = 'Q1EATvs5kWE5nLyY8l65'; // MapTiler key.
// MapTiler "aquarelle" = a watercolour-style vector map, matching the brand.
export const MAP_STYLE_URL = `https://api.maptiler.com/maps/aquarelle/style.json?key=${TILE_KEY}`;

export interface LangPoint { lat: number; lng: number }
export const LANG_POINTS: Record<string, LangPoint> = {
  kuku_yalanji: { lat: -16.17, lng: 145.42 }, // Daintree, FNQ
  anindilyakwa: { lat: -13.97, lng: 136.46 }, // Groote Eylandt, NT
  migmaq:       { lat: 45.5,   lng: -63.0 },  // Mi'kma'ki, Nova Scotia
  wbv:          { lat: -27.0,  lng: 116.5 },  // Murchison, WA
};

/** Reference towns near each language's Country, shown as small labels so people
 *  can orient the Country and place-name pins against familiar towns. Factual
 *  reference coordinates (like LANG_POINTS), NOT dictionary data. */
export interface TownPoint { name: string; lat: number; lng: number }
export const TOWNS: Record<string, TownPoint[]> = {
  kuku_yalanji: [
    { name: 'Cairns', lat: -16.92, lng: 145.77 },
    { name: 'Port Douglas', lat: -16.48, lng: 145.46 },
    { name: 'Mossman', lat: -16.46, lng: 145.37 },
    { name: 'Daintree Village', lat: -16.25, lng: 145.32 },
    { name: 'Wujal Wujal', lat: -15.92, lng: 145.31 },
    { name: 'Cooktown', lat: -15.47, lng: 145.25 },
    { name: 'Mareeba', lat: -17.00, lng: 145.43 },
  ],
  anindilyakwa: [
    { name: 'Alyangula', lat: -13.86, lng: 136.42 },
    { name: 'Angurugu', lat: -13.98, lng: 136.45 },
    { name: 'Umbakumba', lat: -13.88, lng: 136.66 },
  ],
  migmaq: [
    { name: 'Listuguj', lat: 48.04, lng: -66.74 },
    { name: 'Gesgapegiag', lat: 48.13, lng: -65.94 },
    { name: 'Halifax', lat: 44.65, lng: -63.58 },
    { name: 'Moncton', lat: 46.09, lng: -64.77 },
  ],
  wbv: [
    { name: 'Mount Magnet', lat: -28.06, lng: 117.84 },
    { name: 'Cue', lat: -27.42, lng: 117.90 },
    { name: 'Meekatharra', lat: -26.59, lng: 118.49 },
  ],
};
