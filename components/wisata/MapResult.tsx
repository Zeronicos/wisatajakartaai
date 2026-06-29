'use client'

import { Fragment, useEffect } from 'react'
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet'
import type { DayRoute, HotelLocation } from '@/lib/types'
import { PRINT_DAY_COLORS, toLegPolylines } from '@/lib/printMapGeometry'

interface MapResultProps {
  routeData: Record<string, DayRoute>
  hotel: HotelLocation
  activeDay: string
}

function MapResizeFix() {
  const map = useMap()
  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 0)
    const onResize = () => map.invalidateSize()
    window.addEventListener('resize', onResize)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [map])
  return null
}

function ActiveDayViewport({
  dayRoute,
  hotel,
}: {
  dayRoute: DayRoute | null
  hotel: HotelLocation
}) {
  const map = useMap()
  useEffect(() => {
    if (!dayRoute) return
    const points: [number, number][] = [[hotel.lat, hotel.lon]]
    dayRoute.ordered_route.forEach((poi) => {
      points.push([poi.latitude, poi.longitude])
    })
    if (points.length === 1) {
      map.setView(points[0], 13)
      return
    }
    map.fitBounds(points, { padding: [48, 48], maxZoom: 15 })
  }, [dayRoute, hotel.lat, hotel.lon, map])

  return null
}

export default function MapResult({ routeData, hotel, activeDay }: MapResultProps) {
  const activeDayRoute = routeData[activeDay] ?? null
  const dayIndex = parseInt(activeDay, 10)
  const routeColor = PRINT_DAY_COLORS[dayIndex % PRINT_DAY_COLORS.length]
  const legPolylines = activeDayRoute ? toLegPolylines(activeDayRoute, hotel) : []

  return (
    <MapContainer
      center={[-6.2088, 106.8456]}
      zoom={11}
      className="itinerary-route-map"
      style={{ height: '100%', width: '100%', minHeight: 280 }}
    >
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <MapResizeFix />
      <ActiveDayViewport dayRoute={activeDayRoute} hotel={hotel} />

      {legPolylines.map((line, lineIdx) => (
        <Fragment key={`route-shadow-${lineIdx}`}>
          <Polyline
            positions={line}
            pathOptions={{
              color: '#ffffff',
              weight: 9,
              opacity: 0.85,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
          <Polyline
            positions={line}
            pathOptions={{
              color: routeColor,
              weight: 5.5,
              opacity: 0.95,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        </Fragment>
      ))}

      <CircleMarker
        center={[hotel.lat, hotel.lon]}
        radius={12}
        pathOptions={{ color: '#111827', fillColor: '#facc15', fillOpacity: 1, weight: 2.5 }}
      >
        <Tooltip permanent direction="top" offset={[0, -12]} className="itinerary-map-tooltip itinerary-map-tooltip--hotel">
          Hotel
        </Tooltip>
        <Popup>
          <strong>Hotel</strong>
          <br />
          Titik keberangkatan
        </Popup>
      </CircleMarker>

      {activeDayRoute?.ordered_route.map((poi) => (
        <CircleMarker
          key={`${activeDay}-${poi.poi_id}-${poi.order}`}
          center={[poi.latitude, poi.longitude]}
          radius={11}
          pathOptions={{ color: '#ffffff', fillColor: routeColor, fillOpacity: 1, weight: 3 }}
        >
          <Tooltip
            permanent
            direction="center"
            offset={[0, 0]}
            className="itinerary-map-tooltip itinerary-map-tooltip--dest"
          >
            {poi.order}
          </Tooltip>
          <Popup>
            <strong>{poi.name}</strong>
            <br />
            Destinasi #{poi.order}
            <br />
            {poi.distance_from_prev_km} km dari titik sebelumnya
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
