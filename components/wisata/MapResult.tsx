'use client'

import { Fragment, useEffect } from "react"
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet"
import type { DayRoute, HotelLocation } from "@/lib/types"

const DAY_COLORS = ["#EF4444", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4"]

interface MapResultProps {
  routeData: Record<string, DayRoute>
  hotel: HotelLocation
  activeDay: string
}

function MapResizeFix() {
  const map = useMap()
  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize()
    }, 0)
    const onResize = () => {
      map.invalidateSize()
    }
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
      map.setView(points[0], 12)
      return
    }
    map.fitBounds(points, { padding: [40, 40], maxZoom: 14 })
  }, [dayRoute, hotel.lat, hotel.lon, map])

  return null
}

function toLegPolylines(dayRoute: DayRoute, hotel: HotelLocation): [number, number][][] {
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

export default function MapResult({ routeData, hotel, activeDay }: MapResultProps) {
  const activeDayRoute = routeData[activeDay] ?? null

  return (
    <MapContainer center={[-6.2088, 106.8456]} zoom={11} style={{ height: "100%", width: "100%", minHeight: 280 }}>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <MapResizeFix />
      <ActiveDayViewport dayRoute={activeDayRoute} hotel={hotel} />

      <CircleMarker center={[hotel.lat, hotel.lon]} radius={11} color="#111827" fillColor="#facc15" fillOpacity={1}>
        <Popup>Hotel</Popup>
      </CircleMarker>

      {Object.entries(routeData)
        .filter(([dayId]) => dayId === activeDay)
        .map(([dayId, dayRoute]) => {
        const color = DAY_COLORS[parseInt(dayId) % DAY_COLORS.length]
        return (
          <Fragment key={dayId}>
            {toLegPolylines(dayRoute, hotel).map((line, lineIdx) => (
              <Polyline
                key={`${dayId}-line-${lineIdx}`}
                positions={line}
                color={color}
                weight={4}
                opacity={0.9}
              />
            ))}
            {dayRoute.ordered_route.map((poi) => (
              <CircleMarker
                key={`${dayId}-${poi.poi_id}`}
                center={[poi.latitude, poi.longitude]}
                radius={7}
                color={color}
                fillColor={color}
                fillOpacity={1}
              >
                <Tooltip permanent>{poi.order}</Tooltip>
                <Popup>
                  <strong>{poi.name}</strong>
                  <br />
                  Hari ke-{parseInt(dayId) + 1} - Stop {poi.order}
                  <br />
                  {poi.distance_from_prev_km} km dari titik sebelumnya
                </Popup>
              </CircleMarker>
            ))}
          </Fragment>
        )
      })}
    </MapContainer>
  )
}
