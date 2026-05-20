'use client'

import { useEffect } from "react"
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet"

interface MapInputProps {
  onLocationSelect: (lat: number, lon: number) => void
  selectedLat: number | null
  selectedLon: number | null
  allowMapClick?: boolean
  hotelMarkers?: Array<{ id: number; name: string; district?: string; latitude: number; longitude: number }>
  onHotelMarkerSelect?: (hotelId: number) => void
}

function ClickHandler({
  onLocationSelect,
  allowMapClick,
}: {
  onLocationSelect: (lat: number, lon: number) => void
  allowMapClick: boolean
}) {
  useMapEvents({
    click(event) {
      if (!allowMapClick) return
      onLocationSelect(event.latlng.lat, event.latlng.lng)
    },
  })
  return null
}

function AutoCenter({
  selectedLat,
  selectedLon,
}: {
  selectedLat: number | null
  selectedLon: number | null
}) {
  const map = useMap()
  useEffect(() => {
    if (selectedLat !== null && selectedLon !== null) {
      map.setView([selectedLat, selectedLon], 14, { animate: true })
    }
  }, [map, selectedLat, selectedLon])
  return null
}

export default function MapInput({
  onLocationSelect,
  selectedLat,
  selectedLon,
  allowMapClick = true,
  hotelMarkers = [],
  onHotelMarkerSelect,
}: MapInputProps) {
  return (
    <MapContainer
      center={[-6.2088, 106.8456]}
      zoom={12}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler onLocationSelect={onLocationSelect} allowMapClick={allowMapClick} />
      <AutoCenter selectedLat={selectedLat} selectedLon={selectedLon} />
      {hotelMarkers.map((hotel) => (
        <CircleMarker
          key={`hotel-marker-${hotel.id}`}
          center={[hotel.latitude, hotel.longitude]}
          radius={3}
          color="#16a34a"
          fillColor="#16a34a"
          fillOpacity={0.7}
          eventHandlers={
            onHotelMarkerSelect
              ? {
                  click: () => onHotelMarkerSelect(hotel.id),
                }
              : undefined
          }
        >
          <Tooltip permanent={false} direction="top" offset={[0, -6]} opacity={0.95}>
            <div className="text-xs">
              <p className="font-semibold">{hotel.name}</p>
              <p className="text-[11px]">{hotel.district || "DKI Jakarta"}</p>
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
      {selectedLat !== null && selectedLon !== null && (
        <CircleMarker center={[selectedLat, selectedLon]} radius={9} color="#111827" fillColor="#facc15" fillOpacity={1} />
      )}
    </MapContainer>
  )
}
