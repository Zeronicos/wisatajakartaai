'use client'

import { useCallback, useEffect, useMemo, useRef, Fragment } from 'react'
import L from 'leaflet'
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import type { DayRoute, HotelLocation } from '@/lib/types'
import {
  PRINT_DAY_COLORS,
  collectDayRouteBoundsPoints,
  computePrintMapFitProfile,
  computeRouteSpanKm,
  toLegPolylines,
} from '@/lib/printMapGeometry'

const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

interface PrintDayRouteMapProps {
  dayRoute: DayRoute
  hotel: HotelLocation
  dayIndex: number
  dayNo: number
  compact?: boolean
}

function FitRouteViewport({
  dayRoute,
  hotel,
  mapWidth,
  mapHeight,
}: {
  dayRoute: DayRoute
  hotel: HotelLocation
  mapWidth: number
  mapHeight: number
}) {
  const map = useMap()

  const fitRoute = useCallback(() => {
    map.invalidateSize(false)

    const points = collectDayRouteBoundsPoints(dayRoute, hotel)
    if (points.length === 0) return

    if (points.length === 1) {
      map.setView(points[0], 17, { animate: false })
      return
    }

    const spanKm = computeRouteSpanKm(points)
    const profile = computePrintMapFitProfile(spanKm)
    const bounds = L.latLngBounds(points)
    bounds.pad(profile.boundsPad)

    const padY = Math.max(28, Math.round(mapHeight * 0.07))
    const padX = Math.max(22, Math.round(mapWidth * 0.055))

    map.fitBounds(bounds, {
      padding: [padY, padX],
      maxZoom: profile.maxZoom,
      animate: false,
    })

    const currentZoom = map.getZoom()
    if (currentZoom < profile.minZoom) {
      map.setZoom(profile.minZoom, { animate: false })
    }
  }, [dayRoute, hotel, map, mapHeight, mapWidth])

  useEffect(() => {
    let cancelled = false
    const timers: number[] = []

    const scheduleFit = (delay: number) => {
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return
          map.invalidateSize()
          fitRoute()
        }, delay),
      )
    }

    map.whenReady(() => {
      scheduleFit(0)
      scheduleFit(120)
      scheduleFit(450)
      scheduleFit(950)
    })

    const onResize = () => {
      map.invalidateSize()
      fitRoute()
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelled = true
      timers.forEach((id) => window.clearTimeout(id))
      window.removeEventListener('resize', onResize)
    }
  }, [map, fitRoute])

  return null
}

function TileReadyNotifier({ onReady }: { onReady: () => void }) {
  const map = useMap()

  useEffect(() => {
    let signaled = false
    let pending = 0
    let loaded = 0

    const signal = () => {
      if (signaled) return
      signaled = true
      onReady()
    }

    const onStart = () => {
      pending += 1
    }

    const onDone = () => {
      loaded += 1
      if (pending > 0 && loaded >= pending) {
        window.setTimeout(signal, 200)
      }
    }

    map.whenReady(() => {
      map.on('tileloadstart', onStart)
      map.on('tileload', onDone)
      map.on('tileerror', onDone)
      window.setTimeout(signal, 4000)
    })

    return () => {
      map.off('tileloadstart', onStart)
      map.off('tileload', onDone)
      map.off('tileerror', onDone)
    }
  }, [map, onReady])

  return null
}

/** Peta cetak per hari — polyline rute + hotel + destinasi bernomor. */
export default function PrintDayRouteMap({
  dayRoute,
  hotel,
  dayIndex,
  dayNo,
  compact = false,
}: PrintDayRouteMapProps) {
  const width = 900
  const height = compact ? 460 : 620
  const routeColor = PRINT_DAY_COLORS[dayIndex % PRINT_DAY_COLORS.length]
  const wrapRef = useRef<HTMLElement>(null)
  const legPolylines = useMemo(() => toLegPolylines(dayRoute, hotel), [dayRoute, hotel])

  const markReady = useCallback(() => {
    wrapRef.current?.setAttribute('data-print-map-ready', '1')
  }, [])

  useEffect(() => {
    wrapRef.current?.setAttribute('data-print-map-ready', '0')
  }, [dayRoute, hotel, dayIndex])

  return (
    <figure
      ref={wrapRef}
      className="print-day-map-wrap print-day-leaflet-map"
      data-print-map-ready="0"
      data-print-day={dayNo}
    >
      <div className="print-day-map-stack print-day-leaflet-stack" style={{ width, height }}>
        <MapContainer
          center={[-6.2088, 106.8456]}
          zoom={11}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          attributionControl
          dragging={false}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          touchZoom={false}
          boxZoom={false}
          keyboard={false}
          preferCanvas
        >
          <TileLayer attribution="&copy; OpenStreetMap contributors" url={OSM_TILE_URL} />
          <FitRouteViewport dayRoute={dayRoute} hotel={hotel} mapWidth={width} mapHeight={height} />
          <TileReadyNotifier onReady={markReady} />

          <CircleMarker
            center={[hotel.lat, hotel.lon]}
            radius={15}
            pathOptions={{ color: '#111827', fillColor: '#facc15', fillOpacity: 1, weight: 2.5 }}
          >
            <Tooltip permanent direction="top" offset={[0, -12]} className="print-map-tooltip print-map-tooltip--hotel">
              Hotel
            </Tooltip>
          </CircleMarker>

          {legPolylines.map((line, lineIdx) => (
            <Fragment key={`print-line-${dayIndex}-${lineIdx}`}>
              <Polyline
                positions={line}
                pathOptions={{ color: '#ffffff', weight: 8, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }}
              />
              <Polyline
                positions={line}
                pathOptions={{ color: routeColor, weight: 5.5, opacity: 0.94, lineCap: 'round', lineJoin: 'round' }}
              />
            </Fragment>
          ))}

          {dayRoute.ordered_route.map((poi) => (
            <CircleMarker
              key={`print-stop-${dayIndex}-${poi.poi_id}`}
              center={[poi.latitude, poi.longitude]}
              radius={12}
              pathOptions={{ color: '#ffffff', fillColor: routeColor, fillOpacity: 1, weight: 3 }}
            >
              <Tooltip permanent direction="center" offset={[0, 0]} className="print-map-tooltip print-map-tooltip--stop">
                {poi.order}
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      <figcaption className="print-day-map-caption">
        Peta Hari {dayNo} ·{' '}
        <span className="print-day-map-legend-dot print-day-map-legend-dot--hotel" /> Hotel ·{' '}
        <span className="print-day-map-legend-dot" style={{ backgroundColor: routeColor }} /> Destinasi (nomor urut) ·
        garis = rute
      </figcaption>
    </figure>
  )
}
