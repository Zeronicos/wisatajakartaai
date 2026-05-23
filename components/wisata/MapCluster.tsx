'use client'

import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip as LeafletTooltip } from 'react-leaflet'
import type { ClusterResponse, EnrichedPOI, HotelLocation } from '@/lib/types'
import DestinationItineraryCardMini from '@/components/wisata/DestinationItineraryCardMini'

const CLUSTER_COLORS = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4']

interface MapClusterProps {
  clusters: ClusterResponse['clusters']
  hotel: HotelLocation | null
  selectedPOIs: Record<string, EnrichedPOI[]>
  poiDayAssignments?: Record<number, number>
  plannedDays?: number
  /** True saat popup detail destinasi aplikasi dibuka — tidak ada Popup Leaflet di POI agar tidak dobel. */
  onPoiMarkerClick?: (clusterId: string, poi: EnrichedPOI) => void
}

function isSelected(clusterId: string, poiId: number, selectedPOIs: Record<string, EnrichedPOI[]>) {
  return (selectedPOIs[clusterId] || []).some((poi) => poi.poi_id === poiId)
}

export default function MapCluster({
  clusters,
  hotel,
  selectedPOIs,
  poiDayAssignments = {},
  plannedDays,
  onPoiMarkerClick,
}: MapClusterProps) {
  return (
    <MapContainer center={[-6.2088, 106.8456]} zoom={11} style={{ height: '100%', width: '100%' }}>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

      {hotel && (
        <CircleMarker center={[hotel.lat, hotel.lon]} radius={10} color="#111827" fillColor="#facc15" fillOpacity={1}>
          <Popup>Hotel</Popup>
        </CircleMarker>
      )}

      {Object.entries(clusters).map(([clusterId, cluster]) => {
        const color = CLUSTER_COLORS[parseInt(clusterId, 10) % CLUSTER_COLORS.length]
        return cluster.pois.map((poi) => {
          const selected = isSelected(clusterId, poi.poi_id, selectedPOIs)
          const dayAssigned = poiDayAssignments[poi.poi_id]

          return (
            <CircleMarker
              key={`${clusterId}-${poi.poi_id}`}
              center={[poi.latitude, poi.longitude]}
              radius={selected ? 9 : 6}
              color={color}
              fillColor={color}
              fillOpacity={selected ? 0.95 : 0.5}
              eventHandlers={{
                click: () => {
                  onPoiMarkerClick?.(clusterId, poi)
                },
              }}
            >
              <LeafletTooltip
                direction="top"
                offset={[0, -8]}
                opacity={1}
                className="map-cluster-poi-tooltip"
              >
                <DestinationItineraryCardMini
                  poi={poi}
                  accentColor={color}
                  selected={selected}
                  assignedDay={dayAssigned}
                />
              </LeafletTooltip>
            </CircleMarker>
          )
        })
      })}
    </MapContainer>
  )
}
