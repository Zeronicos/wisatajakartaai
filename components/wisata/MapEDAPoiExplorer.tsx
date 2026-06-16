'use client'

import { useEffect } from 'react'
import type { LatLngBoundsExpression } from 'leaflet'
import { Circle, CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import type { BusRouteLine, POILocation, SimpleLocation, StopLocation } from '@/lib/types'
import { POI_NEARBY_MINIMARKET_RADIUS_M, POI_NEARBY_RESTAURANT_RADIUS_M } from '@/lib/edaPoiNearby'
import { getRouteTypeColor } from '@/lib/routeTypeColors'

interface MapEDAPoiExplorerProps {
  pois: POILocation[]
  selectedPoiId: number | null
  onSelectPoi: (poiId: number) => void
  bounds: LatLngBoundsExpression
  nearbyRestaurants: SimpleLocation[]
  nearbyMinimarkets: SimpleLocation[]
  nearbyStops: StopLocation[]
  nearbyRoutes: BusRouteLine[]
  showNearbyRestaurants: boolean
  showNearbyMinimarkets: boolean
  showNearbyRoutes: boolean
}

function FlyToSelectedPoi({
  poi,
  selectedPoiId,
}: {
  poi: POILocation | null
  selectedPoiId: number | null
}) {
  const map = useMap()

  useEffect(() => {
    if (!poi || selectedPoiId === null) return
    map.flyTo([poi.latitude, poi.longitude], 15, { duration: 0.65 })
  }, [map, poi, selectedPoiId])

  return null
}

function AutoFitBounds({
  bounds,
  enabled,
}: {
  bounds: LatLngBoundsExpression
  enabled: boolean
}) {
  const map = useMap()

  useEffect(() => {
    if (!enabled) return
    map.fitBounds(bounds, { padding: [24, 24] })
  }, [map, bounds, enabled])

  return null
}

export default function MapEDAPoiExplorer({
  pois,
  selectedPoiId,
  onSelectPoi,
  bounds,
  nearbyRestaurants,
  nearbyMinimarkets,
  nearbyStops,
  nearbyRoutes,
  showNearbyRestaurants,
  showNearbyMinimarkets,
  showNearbyRoutes,
}: MapEDAPoiExplorerProps) {
  const selectedPoi = pois.find((p) => p.id === selectedPoiId) ?? null

  return (
    <MapContainer center={[-6.2088, 106.8456]} zoom={11} style={{ height: '100%', width: '100%' }}>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <AutoFitBounds bounds={bounds} enabled={selectedPoiId === null} />
      <FlyToSelectedPoi poi={selectedPoi} selectedPoiId={selectedPoiId} />

      {selectedPoi && showNearbyRoutes
        ? nearbyRoutes.map((route) => (
            <Polyline
              key={`${route.route_id}-${route.shape_id}`}
              positions={route.points.map((point) => [point[0], point[1]])}
              pathOptions={{
                color: route.line_color ?? getRouteTypeColor(route.route_type),
                weight: 4,
                opacity: 0.9,
              }}
            >
              <Popup>
                <strong>{route.route_name}</strong>
                <br />
                Jalur TJ aktif — {route.route_type_label}
              </Popup>
            </Polyline>
          ))
        : null}

      {selectedPoi && showNearbyRoutes
        ? nearbyStops.map((stop, idx) => (
            <CircleMarker
              key={`${stop.stop_id ?? stop.stop_name}-${idx}`}
              center={[stop.stop_lat, stop.stop_lon]}
              radius={5}
              pathOptions={{
                color: '#1D4ED8',
                weight: 2,
                fillColor: '#3B82F6',
                fillOpacity: 0.85,
              }}
            >
              <Popup>
                <strong>{stop.stop_name}</strong>
                <br />
                Halte TransJakarta
              </Popup>
            </CircleMarker>
          ))
        : null}

      {selectedPoi && showNearbyMinimarkets
        ? nearbyMinimarkets.map((mini, idx) => (
            <CircleMarker
              key={`${mini.name}-${mini.latitude}-${idx}`}
              center={[mini.latitude, mini.longitude]}
              radius={4}
              pathOptions={{
                color: '#059669',
                weight: 1,
                fillColor: '#10B981',
                fillOpacity: 0.85,
              }}
            >
              <Popup>
                <strong>{mini.name}</strong>
                <br />
                Minimarket (radius {POI_NEARBY_MINIMARKET_RADIUS_M} m)
              </Popup>
            </CircleMarker>
          ))
        : null}

      {selectedPoi && showNearbyRestaurants
        ? nearbyRestaurants.map((resto, idx) => (
            <CircleMarker
              key={`${resto.name}-${resto.latitude}-${idx}`}
              center={[resto.latitude, resto.longitude]}
              radius={4}
              pathOptions={{
                color: '#C2410C',
                weight: 1,
                fillColor: '#F97316',
                fillOpacity: 0.85,
              }}
            >
              <Popup>
                <strong>{resto.name}</strong>
                <br />
                Restoran (radius {POI_NEARBY_RESTAURANT_RADIUS_M} m)
              </Popup>
            </CircleMarker>
          ))
        : null}

      {pois.map((poi) => {
        const isSelected = poi.id === selectedPoiId
        const dimmed = selectedPoiId !== null && !isSelected
        return (
          <CircleMarker
            key={poi.id}
            center={[poi.latitude, poi.longitude]}
            radius={isSelected ? 10 : 6}
            pathOptions={{
              color: isSelected ? '#B91C1C' : '#EF4444',
              weight: isSelected ? 3 : 1,
              fillColor: isSelected ? '#DC2626' : '#EF4444',
              fillOpacity: dimmed ? 0.35 : isSelected ? 0.95 : 0.75,
            }}
            eventHandlers={{
              click: () => onSelectPoi(poi.id),
            }}
          >
            <Popup>
              <strong>{poi.name}</strong>
              <br />
              {poi.category} — {poi.subcategory}
              <br />
              {poi.district}
            </Popup>
          </CircleMarker>
        )
      })}

      {selectedPoi ? (
        <>
          <Circle
            center={[selectedPoi.latitude, selectedPoi.longitude]}
            radius={POI_NEARBY_RESTAURANT_RADIUS_M}
            pathOptions={{
              color: showNearbyRestaurants ? '#F97316' : '#94A3B8',
              weight: 1.5,
              fillColor: showNearbyRestaurants ? '#F97316' : '#94A3B8',
              fillOpacity: 0.06,
              dashArray: '6 4',
            }}
          />
          {showNearbyMinimarkets ? (
            <Circle
              center={[selectedPoi.latitude, selectedPoi.longitude]}
              radius={POI_NEARBY_MINIMARKET_RADIUS_M}
              pathOptions={{
                color: '#10B981',
                weight: 1,
                fillColor: 'transparent',
                fillOpacity: 0,
                dashArray: '3 6',
              }}
            />
          ) : null}
          <CircleMarker
            center={[selectedPoi.latitude, selectedPoi.longitude]}
            radius={16}
            pathOptions={{
              color: '#B91C1C',
              weight: 2,
              fillColor: 'transparent',
              fillOpacity: 0,
              dashArray: '4 4',
            }}
          />
        </>
      ) : null}
    </MapContainer>
  )
}
