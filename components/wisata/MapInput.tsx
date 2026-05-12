'use client'

import { useEffect } from "react"
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet"

interface MapInputProps {
  onLocationSelect: (lat: number, lon: number) => void
  selectedLat: number | null
  selectedLon: number | null
  allowMapClick?: boolean
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
      {selectedLat !== null && selectedLon !== null && (
        <CircleMarker center={[selectedLat, selectedLon]} radius={9} color="#111827" fillColor="#facc15" fillOpacity={1} />
      )}
    </MapContainer>
  )
}
