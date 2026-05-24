export interface EDAStats {
  total_poi: number
  total_stops: number
  total_restaurants: number
  total_minimarkets: number
  total_bus_routes: number
}

export interface POILocation {
  id: number
  name: string
  category: string
  subcategory: string
  latitude: number
  longitude: number
  district: string
}

export interface StopLocation {
  stop_name: string
  stop_lat: number
  stop_lon: number
}

export interface SimpleLocation {
  name: string
  latitude: number
  longitude: number
}

export interface CountByKey {
  category?: string
  district?: string
  count: number
}

export interface DensityGridCell {
  cell_id: string
  lat_min: number
  lat_max: number
  lon_min: number
  lon_max: number
  center_lat: number
  center_lon: number
  count: number
  intensity: number
}

export interface DistrictDetail {
  district: string
  poi_count: number
  centroid_lat: number
  centroid_lon: number
  poi_density_index: number
  nearest_stop_distance_m: number | null
}

export interface CoordinateBounds {
  min_lat: number
  max_lat: number
  min_lon: number
  max_lon: number
}

export interface SpatialInsights {
  district_coverage: number
  coordinate_completeness_pct: number
  avg_nearest_stop_distance_m: number | null
  densest_district: DistrictDetail | null
  sparsest_district: DistrictDetail | null
}

export interface BusRouteLine {
  route_id: string
  route_name: string
  route_short_name: string
  route_long_name: string
  route_type: number
  route_type_label: string
  line_color: string | null
  shape_id: string
  points: number[][]
}

export interface BusRouteTypeSummary {
  route_type: number
  label: string
  count: number
}

export interface EDAData {
  status: "success" | "error"
  stats: EDAStats
  poi_locations: POILocation[]
  stop_locations: StopLocation[]
  restaurant_locations: SimpleLocation[]
  minimarket_locations: SimpleLocation[]
  poi_by_category: Array<{ category: string; count: number }>
  poi_by_district: Array<{ district: string; count: number }>
  poi_missing_coordinates: number
  poi_density_grid: DensityGridCell[]
  district_details: DistrictDetail[]
  coordinate_bounds: CoordinateBounds
  spatial_insights: SpatialInsights
  bus_route_lines: BusRouteLine[]
  bus_route_type_summary: BusRouteTypeSummary[]
  gtfs_source_folder: string
}

export interface SearchResultItem {
  poi_id: number
  name: string
  category: string
  subcategory: string
  latitude: number
  longitude: number
  description: string
  district: string
  semantic_score: number
}

export interface SearchResponse {
  status: "success" | "error"
  message?: string
  total_candidates: number
  top_k: number
  results: SearchResultItem[]
}

export interface EnrichedPOI extends SearchResultItem {
  dist_to_hotel_m: number
  dist_to_stop_m: number
  nearest_stop_name?: string
  resto_count: number
  minimarket_count: number
}

export interface FeatureResponse {
  status: "success" | "error"
  message?: string
  feature_matrix: number[][]
  enriched_pois: EnrichedPOI[]
}

export interface ClusterSummary {
  member_count: number
  avg_semantic_score: number
  avg_dist_to_hotel_m: number
  avg_dist_to_stop_m: number
  avg_resto_count: number
  dominant_category: string
}

export interface ClusterItem {
  day: number
  pois: EnrichedPOI[]
  summary: ClusterSummary
}

export interface KAnalysis {
  k_range: number[]
  wcss_values: number[]
  silhouette_values: number[]
}

export interface ClusterEvaluation {
  silhouette_score: number
  davies_bouldin_index: number
  wcss: number
  k_optimal: number
  iterations: number
}

export interface ClusterResponse {
  status: "success" | "error"
  message?: string
  clusters: Record<string, ClusterItem>
  evaluation: ClusterEvaluation
  baseline_evaluation?: ClusterEvaluation
  k_analysis: KAnalysis
}

export interface RouteStop {
  order: number
  poi_id: number
  name: string
  latitude: number
  longitude: number
  distance_from_prev_m: number
  distance_from_prev_km: number
  path_points?: number[][]
  distance_source?: "road" | "haversine"
}

export interface DayRoute {
  status: "success" | "error"
  day: number
  hotel: HotelLocation
  ordered_route: RouteStop[]
  total_distance_km: number
  total_distance_m: number
}

export type TransitLegMode = "direct" | "transfer_hint" | "walk_only" | "unavailable"

export interface TransitItineraryLeg {
  from_label: string
  to_label: string
  mode: TransitLegMode
  direct_bus_routes: string[]
  origin_bus_routes: string[]
  destination_bus_routes: string[]
  from_stop_name: string | null
  from_stop_distance_m: number | null
  to_stop_name: string | null
  to_stop_distance_m: number | null
  transfer_stop_name: string | null
  summary: string
}

export interface TransitItineraryDay {
  day: number
  legs: TransitItineraryLeg[]
}

export interface TransitItineraryResponse {
  status: "success" | "error"
  days: TransitItineraryDay[]
}

export interface HotelLocation {
  lat: number
  lon: number
}

export interface HotelOption {
  id: number
  name: string
  category: string
  subcategory: string
  latitude: number
  longitude: number
  district: string
}

export interface HotelsResponse {
  status: "success" | "error"
  total: number
  results: HotelOption[]
}

export interface AdminCity {
  id: number
  name: string
}

export interface AdminCategory {
  id: number
  name: string
}

export interface AdminDestination {
  id: number
  name: string
  city_id: number
  city_name: string
  category_id: number
  category_name: string
  is_active: boolean
  is_protected?: boolean
  is_osm_pdf?: boolean
  is_osm_only?: boolean
  /** Baris pertama poi_enriched yang cocok triple nama–district–category (kalau ada). */
  poi_id?: number | null
  poi_description?: string | null
  poi_subcategory?: string | null
  poi_latitude?: number | null
  poi_longitude?: number | null
  poi_phone?: string | null
  poi_website?: string | null
  poi_district?: string | null
  poi_category_raw?: string | null
  poi_source?: string | null
  poi_source_id?: string | null
}

export interface AdminMasterDataResponse {
  status: "success" | "error"
  cities: AdminCity[]
  categories: AdminCategory[]
  destinations: AdminDestination[]
}

export interface PaginationMeta {
  page: number
  page_size: number
  total: number
  total_pages: number
}

export interface AdminCityListResponse {
  status: "success" | "error"
  items: AdminCity[]
  meta: PaginationMeta
}

export interface AdminCategoryListResponse {
  status: "success" | "error"
  items: AdminCategory[]
  meta: PaginationMeta
}

export interface AdminDestinationListResponse {
  status: "success" | "error"
  items: AdminDestination[]
  meta: PaginationMeta
}

export interface AdminEntityMutationResponse<T> {
  status: "success" | "error"
  item: T
}

export interface AdminEntityDeleteResponse {
  status: "success" | "error"
  deleted_id: number
}

export interface AdminDestinationStatusResponse {
  status: "success" | "error"
  destination: {
    id: number
    name: string
    city_id: number
    category_id: number
    is_active: boolean
  }
}

export interface AdminDestinationBulkStatusResponse {
  status: "success" | "error"
  updated_count: number
  matched_count: number
  skipped_protected_count: number
  skipped_osm_only_count: number
  skipped_locked_count: number
  is_active: boolean
  category_id: number | null
}

export interface TransjakartaFileInfo {
  file_name: string
  exists: boolean
  row_count: number
  column_count: number
  path: string
}

export interface TransjakartaFilesResponse {
  status: "success" | "error"
  folder: string
  files: TransjakartaFileInfo[]
}

export interface TransjakartaRouteTypeCount {
  route_type: number
  count: number
}

export interface TransjakartaDbSummary {
  total_stops: number
  total_routes: number
  total_trips: number
  total_shapes: number
  total_stop_times: number
  route_type_summary: TransjakartaRouteTypeCount[]
}

export interface TransjakartaDbSummaryResponse {
  status: "success" | "error"
  summary: TransjakartaDbSummary
}

export interface TransjakartaImportResponse {
  status: "success" | "error"
  imported: {
    stops: number
    routes: number
    trips: number
    shapes: number
    stop_times: number
  }
  summary: TransjakartaDbSummary
}

export interface FacilityCategoryCount {
  category_name: string
  count: number
}

export interface FacilityBrandCount {
  brand_name: string
  count: number
}

export interface FacilitiesSummary {
  total_restaurants: number
  total_minimarkets: number
  restaurant_categories: FacilityCategoryCount[]
  minimarket_categories: FacilityCategoryCount[]
  restaurant_brands: FacilityBrandCount[]
  minimarket_brands: FacilityBrandCount[]
  restaurant_csv_path: string
  minimarket_csv_path: string
}

export interface FacilitiesSummaryResponse {
  status: "success" | "error"
  summary: FacilitiesSummary
}

export interface FacilitiesImportResponse {
  status: "success" | "error"
  imported: {
    restaurants: {
      inserted: number
      skipped: number
      path: string
    }
    minimarkets: {
      inserted: number
      skipped: number
      path: string
    }
  }
  summary: FacilitiesSummary
}

export interface TransjakartaRecordsResponse {
  status: "success" | "error"
  dataset: "stops" | "routes" | "trips" | "shapes" | "stop_times"
  items: Record<string, string | number | boolean | null>[]
  meta: PaginationMeta
}

export interface AdminTransjakartaRouteStatusResponse {
  status: "success" | "error"
  route: {
    route_id: string
    route_short_name: string | null
    route_long_name: string | null
    is_active: boolean
  }
}

export interface AdminDestinationDescriptionResponse {
  status: "success" | "error"
  destination_id: number
  updated_poi_count: number
  description: string | null
}

export interface FacilityRecordsResponse {
  status: "success" | "error"
  facility: "restaurants" | "minimarkets"
  items: Record<string, string | number | null>[]
  meta: PaginationMeta
}

export interface EvaluateResponse {
  status: "success" | "error"
  query: string
  k: number
  precision_at_k: number
  recall_at_k: number
  mrr: number
}

export interface MRRResponse {
  status: "success" | "error"
  total_queries: number
  mrr: number
}

export type UserRole = "admin" | "user"

export interface SessionUser {
  id: number
  name: string
  email: string
  role: UserRole
}

export interface AuthResponse {
  status: "success" | "error"
  user: SessionUser
}

export interface ClusterHistoryItem {
  id: number
  query_text: string
  num_days: number
  total_pois: number
  k_optimal: number
  silhouette_score: number
  davies_bouldin_index: number
  wcss: number
  precision_score: number
  recall_score: number
  f1_score: number
  created_at: string
  user_id?: number
  user_name?: string
  user_email?: string
  selected_destinations?: string[]
  hotel_name?: string | null
  hotel_lat?: number | null
  hotel_lon?: number | null
  top_k?: number | null
  generation_mode?: string | null
  daily_destination_limit?: number | null
  filtered_destinations?: ClusterHistoryDestinationItem[]
  analysis?: ClusterHistoryAnalysisSnapshot
  selection?: ClusterHistorySelectionSnapshot
  routes?: Record<string, ClusterHistoryRouteSnapshot>
}

export interface ClusterHistoryDestinationItem {
  poi_id: number
  name: string
  category?: string
  latitude?: number
  longitude?: number
  semantic_score?: number
  dist_to_hotel_m?: number
  dist_to_stop_m?: number
  resto_count?: number
  minimarket_count?: number
  cluster_id?: string
}

export interface ClusterHistoryKMetricRow {
  k: number
  wcss: number
  silhouette: number
  dbi: number
  iterations: number
}

export interface ClusterHistoryZScoreRow {
  cluster: string
  latitude: number
  longitude: number
  semantic_score: number
  dist_to_hotel_m: number
  dist_to_stop_m: number
  resto_count: number
  minimarket_count: number
}

export interface ClusterHistoryZScoreDetailRow {
  poi_id: number
  name: string
  category: string
  subcategory: string
  latitude: number
  longitude: number
  semantic_score: number
  dist_to_hotel_m: number
  dist_to_stop_m: number
  resto_count: number
  minimarket_count: number
}

export interface ClusterHistoryAnalysisSnapshot {
  metrics?: {
    k?: number
    wcss?: number
    silhouette?: number
    dbi?: number
    iterations?: number
  }
  k_metrics?: ClusterHistoryKMetricRow[]
  baseline_k_metrics?: ClusterHistoryKMetricRow[]
  k_analysis?: KAnalysis
  baseline_evaluation?: ClusterEvaluation
  analysis_min_k?: number
  analysis_max_k?: number
  selected_optimal_k?: number
  zscore_rows?: ClusterHistoryZScoreRow[]
  zscore_details?: Record<string, ClusterHistoryZScoreDetailRow[]>
}

export interface ClusterHistorySelectionDayItem {
  day: number
  poi_names: string[]
  poi_ids: number[]
  destinations?: Array<{ poi_id: number; name: string; category?: string; subcategory?: string }>
}

export interface ClusterHistorySelectionSnapshot {
  generation_mode?: string
  daily_destination_limit?: number
  by_day?: ClusterHistorySelectionDayItem[]
}

export interface ClusterHistoryRouteStopSnapshot {
  order: number
  poi_id: number
  name: string
  distance_from_prev_km: number
  distance_from_prev_m: number
}

export interface ClusterHistoryRouteSnapshot {
  day: number
  total_distance_km: number
  total_distance_m: number
  ordered_route: ClusterHistoryRouteStopSnapshot[]
}

export interface UserClusterHistoryResponse {
  status: "success" | "error"
  summary: {
    total_runs: number
    avg_precision: number
    avg_recall: number
    avg_f1: number
  }
  items: ClusterHistoryItem[]
}

export interface AdminClusterHistoryResponse {
  status: "success" | "error"
  summary: {
    total_runs: number
    avg_precision: number
    avg_recall: number
    avg_f1: number
  }
  items: ClusterHistoryItem[]
}

export interface AdminClusterHistoryUpdatePayload {
  query_text?: string
  num_days?: number
  total_pois?: number
  k_optimal?: number
  silhouette_score?: number
  davies_bouldin_index?: number
  wcss?: number
  precision_score?: number
  recall_score?: number
  f1_score?: number
}

export interface AdminClusterHistoryUpdateResponse {
  status: "success" | "error"
  item: ClusterHistoryItem
}

export interface ItineraryHistoryDayItem {
  day: number
  distance_km: number
  stops: number
  poi_names: string[]
}

export interface ItineraryHistoryItem {
  id: number
  query_text: string
  num_days: number
  total_days: number
  total_stops: number
  total_distance_km: number
  total_distance_m: number
  avg_distance_per_day_km: number
  avg_stops_per_day: number
  k_optimal: number
  silhouette_score: number
  davies_bouldin_index: number
  wcss: number
  precision_score: number
  recall_score: number
  f1_score: number
  hotel_name?: string | null
  hotel_lat?: number | null
  hotel_lon?: number | null
  itinerary_days: ItineraryHistoryDayItem[]
  created_at: string
  user_id?: number
  user_name?: string
  user_email?: string
}

export interface UserItineraryHistoryResponse {
  status: "success" | "error"
  summary: {
    total_runs: number
    avg_total_distance_km: number
    avg_total_stops: number
    avg_f1: number
  }
  items: ItineraryHistoryItem[]
}

export interface AdminItineraryHistoryResponse {
  status: "success" | "error"
  summary: {
    total_runs: number
    avg_total_distance_km: number
    avg_total_stops: number
    avg_f1: number
  }
  items: ItineraryHistoryItem[]
}

export interface AdminUserItem {
  id: number
  name: string
  email: string
  role: UserRole
  created_at: string
}

export interface AdminUsersResponse {
  status: "success" | "error"
  items: AdminUserItem[]
}
