'use client'

import type { LatLngBoundsExpression } from "leaflet"
import { CircleMarker, MapContainer, Polyline, Popup, Rectangle, TileLayer, useMap } from "react-leaflet"
import type { EDAData } from "@/lib/types"
import { getRouteTypeColor } from "@/lib/routeTypeColors"

interface MapEDAProps {
  data: EDAData
  activeLayer: string
  mapMode: "points" | "density" | "districts"
  selectedRouteTypes: number[]
}

function AutoFitBounds({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap()
  map.fitBounds(bounds, { padding: [24, 24] })
  return null
}

function getHeatColor(intensity: number): string {
  if (intensity >= 0.8) return "#991B1B"
  if (intensity >= 0.6) return "#DC2626"
  if (intensity >= 0.4) return "#F97316"
  if (intensity >= 0.2) return "#FACC15"
  return "#4ADE80"
}

export default function MapEDA({ data, activeLayer, mapMode, selectedRouteTypes }: MapEDAProps) {
  const bounds: LatLngBoundsExpression = [
    [data.coordinate_bounds.min_lat, data.coordinate_bounds.min_lon],
    [data.coordinate_bounds.max_lat, data.coordinate_bounds.max_lon],
  ]

  const maxDistrictPoi = Math.max(
    1,
    ...data.district_details.map((district) => district.poi_count),
  )

  return (
    <MapContainer center={[-6.2088, 106.8456]} zoom={11} style={{ height: "100%", width: "100%" }}>
      <AutoFitBounds bounds={bounds} />
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

      {mapMode === "density" &&
        data.poi_density_grid.map((cell) => (
          <Rectangle
            key={cell.cell_id}
            bounds={[
              [cell.lat_min, cell.lon_min],
              [cell.lat_max, cell.lon_max],
            ]}
            pathOptions={{
              color: getHeatColor(cell.intensity),
              weight: 1,
              fillColor: getHeatColor(cell.intensity),
              fillOpacity: Math.max(0.25, cell.intensity),
            }}
          >
            <Popup>
              <strong>Grid Kepadatan POI</strong>
              <br />
              Jumlah POI: {cell.count}
              <br />
              Intensitas: {(cell.intensity * 100).toFixed(1)}%
            </Popup>
          </Rectangle>
        ))}

      {mapMode === "districts" &&
        data.district_details.map((district) => (
          <CircleMarker
            key={district.district}
            center={[district.centroid_lat, district.centroid_lon]}
            radius={5 + (district.poi_count / maxDistrictPoi) * 12}
            color="#4338CA"
            fillColor="#6366F1"
            fillOpacity={0.7}
          >
            <Popup>
              <strong>{district.district}</strong>
              <br />
              POI: {district.poi_count}
              <br />
              Density Index: {(district.poi_density_index * 100).toFixed(2)}%
              <br />
              Jarak halte terdekat:{" "}
              {district.nearest_stop_distance_m !== null
                ? `${district.nearest_stop_distance_m.toFixed(0)} m`
                : "N/A"}
            </Popup>
          </CircleMarker>
        ))}

      {mapMode === "points" &&
        activeLayer === "bus_routes" &&
        data.bus_route_lines
          .filter((line) => selectedRouteTypes.includes(line.route_type))
          .map((line) => (
            <Polyline
              key={`${line.route_id}-${line.shape_id}`}
              positions={line.points.map((point) => [point[0], point[1]])}
              pathOptions={{
                color: line.line_color ?? getRouteTypeColor(line.route_type),
                weight: 3,
                opacity: 0.85,
              }}
            >
              <Popup>
                <strong>{line.route_name}</strong>
                <br />
                Route ID: {line.route_id}
                <br />
                Tipe: {line.route_type_label} ({line.route_type})
              </Popup>
            </Polyline>
          ))}

      {mapMode === "points" &&
        activeLayer === "poi" &&
        data.poi_locations.map((poi) => (
          <CircleMarker
            key={poi.id}
            center={[poi.latitude, poi.longitude]}
            radius={5}
            color="#ef4444"
            fillColor="#ef4444"
            fillOpacity={0.8}
          >
            <Popup>
              <strong>{poi.name}</strong>
              <br />
              {poi.category} - {poi.subcategory}
              <br />
              {poi.district}
            </Popup>
          </CircleMarker>
        ))}

      {mapMode === "points" &&
        activeLayer === "stops" &&
        data.stop_locations.map((stop, idx) => (
          <CircleMarker
            key={`${stop.stop_name}-${idx}`}
            center={[stop.stop_lat, stop.stop_lon]}
            radius={4}
            color="#3b82f6"
            fillColor="#3b82f6"
            fillOpacity={0.8}
          >
            <Popup>{stop.stop_name}</Popup>
          </CircleMarker>
        ))}

      {mapMode === "points" &&
        activeLayer === "restaurants" &&
        data.restaurant_locations.map((resto, idx) => (
          <CircleMarker
            key={`${resto.name}-${idx}`}
            center={[resto.latitude, resto.longitude]}
            radius={3}
            color="#f97316"
            fillColor="#f97316"
            fillOpacity={0.6}
          >
            <Popup>{resto.name}</Popup>
          </CircleMarker>
        ))}

      {mapMode === "points" &&
        activeLayer === "minimarkets" &&
        data.minimarket_locations.map((mini, idx) => (
          <CircleMarker
            key={`${mini.name}-${idx}`}
            center={[mini.latitude, mini.longitude]}
            radius={3}
            color="#10b981"
            fillColor="#10b981"
            fillOpacity={0.6}
          >
            <Popup>{mini.name}</Popup>
          </CircleMarker>
        ))}
    </MapContainer>
  )
}
