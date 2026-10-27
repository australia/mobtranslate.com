/**
 * The prototype area: Kalinga Station. Shared by the server (weather and
 * river feeds) and the phone (sun and moon for the fishing outlook).
 */
export const FIELD_AREA = {
  id: 'kalinga',
  name: 'Kalinga Station',
  /** For sun and moon times; a minute of sun time is about 25 km, so the station centre does. */
  centre: { lat: -15.2, lon: 143.85 },
  /**
   * Where weather is asked for. A coarse grid point near the station, so the
   * weather service never learns a fishing spot.
   */
  weatherPoint: { lat: -15.25, lon: 143.75 },
  river: { site: '105001B', name: 'Hann River at Sandy Creek', shortName: 'Hann River' },
  /** Queensland time: UTC+10 all year, no daylight saving. */
  utcOffsetMinutes: 600,
} as const;
