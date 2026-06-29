import type { DayRoute, HotelLocation } from '@/lib/types'

export type LatLon = { lat: number; lon: number }

export const PRINT_DAY_COLORS = [
  '#EF4444',
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
]

export interface RouteLegSegment {
  dayIndex: number
  dayNo: number
  legIndex: number
  poiOrder: number
  poiName: string
  distanceKm: number
  polyline: [number, number][]
  color: string
}

export function formatSegmentDistance(km: number): string {
  if (!Number.isFinite(km) || km <= 0) return '—'
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}

function haversineKm(a: [number, number], b: [number, number]): number {
  const toRad = (v: number) => (v * Math.PI) / 180
  const R = 6371
  const dLat = toRad(b[0] - a[0])
  const dLon = toRad(b[1] - a[1])
  const lat1 = toRad(a[0])
  const lat2 = toRad(b[0])
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Titik tengah polyline (berdasarkan panjang segmen) untuk label jarak. */
export function polylineMidpoint(points: [number, number][]): [number, number] {
  if (points.length === 0) return [0, 0]
  if (points.length === 1) return points[0]

  let total = 0
  const segments: Array<{ start: [number, number]; end: [number, number]; len: number }> = []
  for (let i = 1; i < points.length; i += 1) {
    const len = haversineKm(points[i - 1], points[i])
    segments.push({ start: points[i - 1], end: points[i], len })
    total += len
  }
  if (total <= 0) return points[Math.floor(points.length / 2)]

  let remaining = total / 2
  for (const seg of segments) {
    if (remaining <= seg.len) {
      const t = seg.len > 0 ? remaining / seg.len : 0
      return [
        seg.start[0] + t * (seg.end[0] - seg.start[0]),
        seg.start[1] + t * (seg.end[1] - seg.start[1]),
      ]
    }
    remaining -= seg.len
  }
  return points[points.length - 1]
}

export function toLegPolylines(dayRoute: DayRoute, hotel: HotelLocation): [number, number][][] {
  const polylines: [number, number][][] = []
  let prev: [number, number] = [hotel.lat, hotel.lon]

  dayRoute.ordered_route.forEach((poi) => {
    const maybePath = (poi.path_points ?? [])
      .filter((item): item is number[] => Array.isArray(item) && item.length >= 2)
      .map((item) => [Number(item[0]), Number(item[1])] as [number, number])

    if (maybePath.length >= 2) {
      polylines.push(maybePath)
    } else {
      polylines.push([prev, [poi.latitude, poi.longitude]])
    }
    prev = [poi.latitude, poi.longitude]
  })

  return polylines
}

export function routeFitPoints(dayRoute: DayRoute, hotel: HotelLocation): [number, number][] {
  const points: [number, number][] = [[hotel.lat, hotel.lon]]
  dayRoute.ordered_route.forEach((poi) => {
    points.push([poi.latitude, poi.longitude])
  })
  return points
}

/** Profil zoom cetak: rute pendek di-zoom lebih dekat, rute panjang tetap muat. */
export function computePrintMapFitProfile(spanKm: number): {
  boundsPad: number
  maxZoom: number
  minZoom: number
} {
  if (spanKm <= 2.5) return { boundsPad: 0.035, maxZoom: 18, minZoom: 17 }
  if (spanKm <= 5) return { boundsPad: 0.05, maxZoom: 17, minZoom: 15 }
  if (spanKm <= 10) return { boundsPad: 0.07, maxZoom: 16, minZoom: 14 }
  if (spanKm <= 20) return { boundsPad: 0.1, maxZoom: 15, minZoom: 12 }
  if (spanKm <= 40) return { boundsPad: 0.12, maxZoom: 13, minZoom: 11 }
  return { boundsPad: 0.14, maxZoom: 12, minZoom: 10 }
}

export function computeRouteSpanKm(points: [number, number][]): number {
  if (points.length < 2) return 0
  const lats = points.map((p) => p[0])
  const lons = points.map((p) => p[1])
  return haversineKm(
    [Math.min(...lats), Math.min(...lons)],
    [Math.max(...lats), Math.max(...lons)],
  )
}

/** Semua titik rute (hotel, POI, dan vertex polyline) untuk fitBounds akurat. */
export function collectDayRouteBoundsPoints(
  dayRoute: DayRoute,
  hotel: HotelLocation,
): [number, number][] {
  const seen = new Set<string>()
  const out: [number, number][] = []

  const add = (lat: number, lon: number) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return
    const key = `${lat.toFixed(6)},${lon.toFixed(6)}`
    if (seen.has(key)) return
    seen.add(key)
    out.push([lat, lon])
  }

  add(hotel.lat, hotel.lon)
  dayRoute.ordered_route.forEach((poi) => {
    add(poi.latitude, poi.longitude)
  })
  toLegPolylines(dayRoute, hotel).forEach((line) => {
    line.forEach(([lat, lon]) => add(lat, lon))
  })

  return out
}

export function allRouteFitPoints(
  routeData: Record<string, DayRoute>,
  hotel: HotelLocation,
): [number, number][] {
  const points: [number, number][] = [[hotel.lat, hotel.lon]]
  Object.entries(routeData)
    .sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10))
    .forEach(([, dayRoute]) => {
      dayRoute.ordered_route.forEach((poi) => {
        points.push([poi.latitude, poi.longitude])
      })
    })
  return points
}

export function buildDayLegSegments(
  dayRoute: DayRoute,
  hotel: HotelLocation,
  dayIndex: number,
): RouteLegSegment[] {
  const dayNo = dayIndex + 1
  const color = PRINT_DAY_COLORS[dayIndex % PRINT_DAY_COLORS.length]
  const polylines = toLegPolylines(dayRoute, hotel)

  return dayRoute.ordered_route.map((stop, legIndex) => ({
    dayIndex,
    dayNo,
    legIndex,
    poiOrder: stop.order,
    poiName: stop.name,
    distanceKm: stop.distance_from_prev_km,
    polyline: polylines[legIndex] ?? [[hotel.lat, hotel.lon], [stop.latitude, stop.longitude]],
    color,
  }))
}

export function buildAllDayLegSegments(
  routeData: Record<string, DayRoute>,
  hotel: HotelLocation,
): RouteLegSegment[] {
  const segments: RouteLegSegment[] = []

  Object.entries(routeData)
    .sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10))
    .forEach(([dayId, dayRoute]) => {
      const dayIndex = parseInt(dayId, 10)
      const dayNo = dayIndex + 1
      const color = PRINT_DAY_COLORS[dayIndex % PRINT_DAY_COLORS.length]
      const polylines = toLegPolylines(dayRoute, hotel)

      dayRoute.ordered_route.forEach((stop, legIndex) => {
        segments.push({
          dayIndex,
          dayNo,
          legIndex,
          poiOrder: stop.order,
          poiName: stop.name,
          distanceKm: stop.distance_from_prev_km,
          polyline: polylines[legIndex] ?? [[hotel.lat, hotel.lon], [stop.latitude, stop.longitude]],
          color,
        })
      })
    })

  return segments
}
