import { haversineMeters, minDistanceToPolylineMeters } from '@/lib/geo'
import type { BusRouteLine, POILocation, SimpleLocation, StopLocation } from '@/lib/types'

export const POI_NEARBY_RESTAURANT_RADIUS_M = 500
export const POI_NEARBY_MINIMARKET_RADIUS_M = 500
export const POI_NEARBY_ROUTE_RADIUS_M = 600
export const POI_NEARBY_STOP_RADIUS_M = 800

export interface NearbyRestaurant extends SimpleLocation {
  distance_m: number
}

export interface NearbyMinimarket extends SimpleLocation {
  distance_m: number
}

export interface NearbyStop extends StopLocation {
  distance_m: number
}

export interface NearbyRoute extends BusRouteLine {
  distance_m: number
}

export interface PoiNearbyContext {
  restaurants: NearbyRestaurant[]
  minimarkets: NearbyMinimarket[]
  stops: NearbyStop[]
  routes: NearbyRoute[]
}

export function computePoiNearbyContext(
  poi: POILocation,
  restaurants: SimpleLocation[],
  minimarkets: SimpleLocation[],
  routes: BusRouteLine[],
  stops: StopLocation[],
  options?: {
    restaurantRadiusM?: number
    minimarketRadiusM?: number
    routeRadiusM?: number
    stopRadiusM?: number
  },
): PoiNearbyContext {
  const restaurantRadiusM = options?.restaurantRadiusM ?? POI_NEARBY_RESTAURANT_RADIUS_M
  const minimarketRadiusM = options?.minimarketRadiusM ?? POI_NEARBY_MINIMARKET_RADIUS_M
  const routeRadiusM = options?.routeRadiusM ?? POI_NEARBY_ROUTE_RADIUS_M
  const stopRadiusM = options?.stopRadiusM ?? POI_NEARBY_STOP_RADIUS_M

  const nearbyRestaurants: NearbyRestaurant[] = restaurants
    .map((resto) => ({
      ...resto,
      distance_m: haversineMeters(poi.latitude, poi.longitude, resto.latitude, resto.longitude),
    }))
    .filter((resto) => resto.distance_m <= restaurantRadiusM)
    .sort((a, b) => a.distance_m - b.distance_m)

  const nearbyMinimarkets: NearbyMinimarket[] = minimarkets
    .map((mini) => ({
      ...mini,
      distance_m: haversineMeters(poi.latitude, poi.longitude, mini.latitude, mini.longitude),
    }))
    .filter((mini) => mini.distance_m <= minimarketRadiusM)
    .sort((a, b) => a.distance_m - b.distance_m)

  const nearbyStops: NearbyStop[] = stops
    .map((stop) => ({
      ...stop,
      distance_m: haversineMeters(poi.latitude, poi.longitude, stop.stop_lat, stop.stop_lon),
    }))
    .filter((stop) => stop.distance_m <= stopRadiusM)
    .sort((a, b) => a.distance_m - b.distance_m)

  const nearbyRoutes: NearbyRoute[] = routes
    .map((route) => ({
      ...route,
      distance_m: minDistanceToPolylineMeters(poi.latitude, poi.longitude, route.points),
    }))
    .filter((route) => route.distance_m <= routeRadiusM)
    .sort((a, b) => a.distance_m - b.distance_m)

  return {
    restaurants: nearbyRestaurants,
    minimarkets: nearbyMinimarkets,
    stops: nearbyStops,
    routes: nearbyRoutes,
  }
}
