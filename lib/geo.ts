/** Jarak Haversine antar dua titik (meter). */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Jarak minimum dari titik ke polyline (meter). */
export function minDistanceToPolylineMeters(
  lat: number,
  lon: number,
  points: number[][],
): number {
  if (!points.length) return Infinity
  let min = Infinity
  for (const point of points) {
    if (point.length < 2) continue
    min = Math.min(min, haversineMeters(lat, lon, point[0], point[1]))
  }
  return min
}

/** URL Google Maps untuk titik koordinat (opsional dengan nama tempat). */
export function buildGoogleMapsUrl(
  latitude: number,
  longitude: number,
  name?: string,
): string | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (latitude === 0 && longitude === 0) return null

  const coords = `${latitude},${longitude}`
  const query = name?.trim() ? `${name.trim()} @${coords}` : coords
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}
