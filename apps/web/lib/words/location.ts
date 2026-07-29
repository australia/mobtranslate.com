export interface SuggestedLocation {
  latitude: number;
  longitude: number;
}

export function parseSuggestedLocation(value: unknown): SuggestedLocation {
  const candidate = value && typeof value === 'object'
    ? value as { latitude?: unknown; longitude?: unknown }
    : null;
  const latitude = Number(candidate?.latitude);
  const longitude = Number(candidate?.longitude);
  if (
    !Number.isFinite(latitude)
    || latitude < -90
    || latitude > 90
    || !Number.isFinite(longitude)
    || longitude < -180
    || longitude > 180
  ) {
    throw new Error('Location suggestions require valid latitude and longitude values.');
  }
  return { latitude, longitude };
}
