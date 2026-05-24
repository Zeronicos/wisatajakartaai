import { MOCK_CLUSTER_RESPONSE, MOCK_EDA } from "@/lib/mockData"
import type {
  AdminCategory,
  AdminCategoryListResponse,
  AdminDestinationStatusResponse,
  AdminDestinationDescriptionResponse,
  AdminTransjakartaRouteStatusResponse,
  AdminDestinationBulkStatusResponse,
  AdminDestination,
  AdminDestinationListResponse,
  AdminEntityDeleteResponse,
  AdminEntityMutationResponse,
  AdminMasterDataResponse,
  AdminCity,
  AdminCityListResponse,
  ClusterResponse,
  DayRoute,
  EDAData,
  EvaluateResponse,
  HotelsResponse,
  EnrichedPOI,
  FeatureResponse,
  FacilitiesImportResponse,
  FacilityRecordsResponse,
  FacilitiesSummaryResponse,
  MRRResponse,
  AuthResponse,
  UserRole,
  AdminClusterHistoryResponse,
  AdminItineraryHistoryResponse,
  AdminClusterHistoryUpdatePayload,
  AdminClusterHistoryUpdateResponse,
  AdminUsersResponse,
  UserItineraryHistoryResponse,
  UserClusterHistoryResponse,
  TransitItineraryResponse,
  ClusterHistoryItem,
  SearchResponse,
  TransjakartaDbSummaryResponse,
  TransjakartaFilesResponse,
  TransjakartaImportResponse,
  TransjakartaRecordsResponse,
} from "@/lib/types"

/** Uvicorn default --host 127.0.0.1; di Windows/Chrome fetch ke `localhost` sering resolving ke [::1]. */
function rewriteLocalhostToIpv4Loopback(trimmed: string): string {
  return trimmed.replace(/^https?:\/\/localhost(?=[:\\/])/i, (prefix) =>
    prefix.replace(/localhost/i, "127.0.0.1"),
  )
}

/** Same-origin proxy (next.config rewrites → FastAPI /api/*). */
const RELATIVE_DEV_PROXY = "/__wisata_api"

/** Pastikan ada suffix /api (banyak salah set ENV ke origin saja tanpa /api). */
function normalizePublicApiBase(raw: string): string {
  let trimmed = raw.trim().replace(/\/+$/, "")
  trimmed = rewriteLocalhostToIpv4Loopback(trimmed)
  if (!trimmed) return "http://127.0.0.1:8000/api"
  const lower = trimmed.toLowerCase()
  if (lower.endsWith("/api")) return trimmed
  return `${trimmed}/api`
}

function resolveApiBase(): string {
  const forceProxy =
    process.env.NEXT_PUBLIC_API_RELATIVE_PROXY === "true" &&
    process.env.NODE_ENV === "development"
  if (forceProxy) return RELATIVE_DEV_PROXY

  const fromEnv = process.env.NEXT_PUBLIC_API_BASE_URL?.trim()
  if (fromEnv) return normalizePublicApiBase(fromEnv)

  /* Dev default: direct ke backend lokal; proxy dipakai hanya jika dipaksa env. */
  if (process.env.NODE_ENV === "development") {
    return normalizePublicApiBase("http://127.0.0.1:8000/api")
  }

  return normalizePublicApiBase("http://127.0.0.1:8000/api")
}

const API_BASE = resolveApiBase()
/** Untuk troubleshooting di UI (URL fetch atau label proxy). */
export const RESOLVED_PUBLIC_API_BASE =
  API_BASE.startsWith("/") && process.env.NODE_ENV === "development"
    ? `${RELATIVE_DEV_PROXY} (proxy Next.js → http://127.0.0.1:8000/api)`
    : API_BASE

function uniqueBases(bases: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const base of bases) {
    const key = base.trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

function resolveCandidateBases(): string[] {
  const forceProxy =
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_API_RELATIVE_PROXY === "true"

  const devCandidates =
    process.env.NODE_ENV === "development"
      ? [
          API_BASE,
          normalizePublicApiBase("http://127.0.0.1:8000/api"),
          normalizePublicApiBase("http://localhost:8000/api"),
          ...(forceProxy || API_BASE.startsWith("/") ? [RELATIVE_DEV_PROXY] : []),
        ]
      : [API_BASE]
  return uniqueBases(devCandidates)
}

const CANDIDATE_BASES = resolveCandidateBases()

function joinBaseAndPath(base: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${base.replace(/\/+$/, "")}${normalizedPath}`
}

async function fetchWithBaseFallback(path: string, init: RequestInit): Promise<Response> {
  const failures: string[] = []
  let lastError: Error | null = null
  for (const base of CANDIDATE_BASES) {
    const url = joinBaseAndPath(base, path)
    try {
      const res = await fetch(url, init)
      if (res.ok) return res
      const text = await res.text()
      const message = text || `Request gagal: ${res.status} (${url})`
      failures.push(message)
      lastError = new Error(message)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      failures.push(`${url} -> ${message}`)
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }
  if (failures.length > 0) {
    throw new Error(`Request gagal pada semua kandidat API base URL: ${failures.join(" | ")}`)
  }
  throw lastError ?? new Error("Request gagal pada semua kandidat API base URL.")
}

const ENABLE_MOCK_FALLBACK = process.env.NEXT_PUBLIC_ENABLE_MOCK_FALLBACK === "true"
/** Jika true, halaman /eda gagal eksplisit bila backend down. Default false = pakai MOCK_EDA + banner. */
const REQUIRE_LIVE_EDA = process.env.NEXT_PUBLIC_REQUIRE_LIVE_EDA === "true"
export type EDAFetchSource = "api" | "mock"

export async function fetchEDAWithSource(): Promise<{ data: EDAData; source: EDAFetchSource }> {
  try {
    const res = await fetch(`${API_BASE}/eda`, { method: "GET", cache: "no-store" })
    if (!res.ok) {
      throw new Error(`EDA error ${res.status}`)
    }
    const data = (await res.json()) as EDAData
    return { data, source: "api" }
  } catch (err) {
    if (REQUIRE_LIVE_EDA) {
      throw new Error("Gagal mengambil data EDA dari backend.")
    }
    if (process.env.NODE_ENV === "development") {
      console.warn("[fetchEDA] Backend tidak dijangkau — memakai MOCK_EDA. API:", API_BASE, err)
    }
    return { data: MOCK_EDA, source: "mock" }
  }
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Request gagal: ${res.status}`)
  }

  return (await res.json()) as T
}

async function patchJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Request gagal: ${res.status}`)
  }

  return (await res.json()) as T
}

async function putJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Request gagal: ${res.status}`)
  }
  return (await res.json()) as T
}

async function deleteJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: "DELETE" })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Request gagal: ${res.status}`)
  }
  return (await res.json()) as T
}

export async function fetchEDA(): Promise<EDAData> {
  const { data } = await fetchEDAWithSource()
  return data
}

export async function fetchHotels(query = "", limit = 50): Promise<HotelsResponse> {
  const res = await fetchWithBaseFallback(
    `/hotels?q=${encodeURIComponent(query)}&limit=${limit}`,
    { method: "GET", cache: "no-store" },
  )
  return (await res.json()) as HotelsResponse
}

export async function searchPOI(preference: string, top_k = 50): Promise<SearchResponse> {
  return postJSON<SearchResponse>("/search", { preference, top_k })
}

export async function extractFeatures(
  poi_candidates: Array<{
    poi_id: number
    name: string
    latitude: number
    longitude: number
    semantic_score: number
    category: string
    subcategory: string
    description: string
    district: string
  }>,
  hotel_lat: number,
  hotel_lon: number,
): Promise<FeatureResponse> {
  return postJSON<FeatureResponse>("/features", {
    poi_candidates,
    hotel_lat,
    hotel_lon,
  })
}

export async function runClustering(
  feature_matrix: number[][],
  enriched_pois: EnrichedPOI[],
  num_days: number,
  hotel_lat: number,
  hotel_lon: number,
): Promise<ClusterResponse> {
  return postJSON<ClusterResponse>("/cluster", {
    feature_matrix,
    enriched_pois,
    num_days,
    hotel_lat,
    hotel_lon,
  })
}

export async function optimizeRoute(
  selected_pois: EnrichedPOI[],
  hotel_lat: number,
  hotel_lon: number,
  day: number,
): Promise<DayRoute> {
  return postJSON<DayRoute>("/route", {
    selected_pois,
    hotel_lat,
    hotel_lon,
    day,
  })
}

export interface RoadDistanceMatrixResponse {
  status: "success"
  distances_km: number[][]
  sources: string[][]
  provider: string
  note?: string
}

export async function fetchRoadDistanceMatrix(
  points: { lat: number; lon: number }[],
): Promise<RoadDistanceMatrixResponse> {
  return postJSON<RoadDistanceMatrixResponse>("/route/distance-matrix", {
    points,
  })
}

export async function fetchTransitItinerarySuggestions(payload: {
  hotel_lat: number
  hotel_lon: number
  hotel_name?: string
  days: {
    day: number
    stops: { poi_id?: number; name: string; latitude: number; longitude: number }[]
  }[]
}): Promise<TransitItineraryResponse> {
  return postJSON<TransitItineraryResponse>("/transit/itinerary-suggestions", payload)
}

export async function runFullPipeline(
  preference: string,
  numDays: number,
  hotelLat: number,
  hotelLon: number,
  topK = 50,
): Promise<ClusterResponse> {
  try {
    // Wajib urutan pipeline: Search -> Features -> Cluster
    const searchResult = await searchPOI(preference, topK)
    if (searchResult.status !== "success") {
      throw new Error(
        searchResult.message ?? "Module Search mengembalikan status error.",
      )
    }

    const featureResult = await extractFeatures(searchResult.results, hotelLat, hotelLon)
    if (featureResult.status !== "success") {
      throw new Error(
        featureResult.message ?? "Module Features mengembalikan status error.",
      )
    }

    if (
      !featureResult.feature_matrix.length ||
      !featureResult.enriched_pois.length
    ) {
      throw new Error(
        "Data fitur POI kosong. Pastikan pencarian mengembalikan hasil dan embedding di database sudah diisi.",
      )
    }

    // Jumlah cluster dipisahkan dari jumlah hari itinerary user.
    // Hari itinerary ditentukan user saat menyusun rute di halaman cluster.
    const clusterLimit = 7
    const clusterResult = await runClustering(
      featureResult.feature_matrix,
      featureResult.enriched_pois,
      clusterLimit,
      hotelLat,
      hotelLon,
    )
    if (clusterResult.status !== "success") {
      throw new Error(
        clusterResult.message ??
          "Module Cluster mengembalikan status error (biasanya matriks fitur / daftar POI kosong).",
      )
    }

    return clusterResult
  } catch (error) {
    if (!ENABLE_MOCK_FALLBACK) {
      throw error
    }
    return MOCK_CLUSTER_RESPONSE
  }
}

export async function evaluateRecommendation(
  query: string,
  top_k_results: Array<{ poi_id: number } & Record<string, unknown>>,
  ground_truth_relevant: number[],
  k = 10,
): Promise<EvaluateResponse> {
  return postJSON<EvaluateResponse>("/evaluate", {
    query,
    top_k_results,
    ground_truth_relevant,
    k,
  })
}

export async function evaluateMRR(
  queries_results: Array<{
    retrieved: Array<{ poi_id: number } & Record<string, unknown>>
    relevant: number[]
  }>,
): Promise<MRRResponse> {
  return postJSON<MRRResponse>("/evaluate/mrr", { queries_results })
}

export async function fetchAdminMasterData(): Promise<AdminMasterDataResponse> {
  const res = await fetchWithBaseFallback("/admin/master-data", { method: "GET", cache: "no-store" })
  return (await res.json()) as AdminMasterDataResponse
}

export async function fetchTransjakartaFiles(): Promise<TransjakartaFilesResponse> {
  const res = await fetch(`${API_BASE}/admin/transjakarta-files`, { method: "GET", cache: "no-store" })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Gagal mengambil data file TransJakarta: ${res.status}`)
  }
  return (await res.json()) as TransjakartaFilesResponse
}

export async function fetchTransjakartaDbSummary(): Promise<TransjakartaDbSummaryResponse> {
  const res = await fetchWithBaseFallback("/admin/transjakarta-db-summary", {
    method: "GET",
    cache: "no-store",
  })
  return (await res.json()) as TransjakartaDbSummaryResponse
}

export async function importTransjakartaToDb(truncateBeforeImport = true): Promise<TransjakartaImportResponse> {
  return postJSON<TransjakartaImportResponse>("/admin/transjakarta-import", {
    truncate_before_import: truncateBeforeImport,
  })
}

export async function fetchTransjakartaRecords(params: {
  dataset: "stops" | "routes" | "trips" | "shapes" | "stop_times"
  q?: string
  page?: number
  pageSize?: number
}): Promise<TransjakartaRecordsResponse> {
  const search = new URLSearchParams({
    dataset: params.dataset,
    q: params.q ?? "",
    page: String(params.page ?? 1),
    page_size: String(params.pageSize ?? 20),
  })
  const res = await fetch(`${API_BASE}/admin/transjakarta-records?${search.toString()}`, {
    method: "GET",
    cache: "no-store",
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Gagal mengambil data TransJakarta: ${res.status}`)
  }
  return (await res.json()) as TransjakartaRecordsResponse
}

export async function fetchFacilitiesSummary(): Promise<FacilitiesSummaryResponse> {
  const res = await fetchWithBaseFallback("/admin/facilities/summary", {
    method: "GET",
    cache: "no-store",
  })
  return (await res.json()) as FacilitiesSummaryResponse
}

export async function importFacilitiesToDb(truncateBeforeImport = true): Promise<FacilitiesImportResponse> {
  return postJSON<FacilitiesImportResponse>("/admin/facilities/import", {
    truncate_before_import: truncateBeforeImport,
  })
}

export async function fetchFacilityRecords(params: {
  facility: "restaurants" | "minimarkets"
  q?: string
  category?: string
  page?: number
  pageSize?: number
}): Promise<FacilityRecordsResponse> {
  const search = new URLSearchParams({
    facility: params.facility,
    q: params.q ?? "",
    category: params.category ?? "",
    page: String(params.page ?? 1),
    page_size: String(params.pageSize ?? 20),
  })
  const res = await fetch(`${API_BASE}/admin/facilities/records?${search.toString()}`, {
    method: "GET",
    cache: "no-store",
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Gagal mengambil data fasilitas: ${res.status}`)
  }
  return (await res.json()) as FacilityRecordsResponse
}

export async function updateFacilityRecord(
  facility: "restaurants" | "minimarkets",
  rowId: number,
  payload: {
    name: string
    category?: string | null
    subcategory?: string | null
    cuisine?: string | null
    brand?: string | null
    facility_type?: string | null
  },
): Promise<{ status: "success" | "error"; item: Record<string, string | number | null> }> {
  return putJSON<{ status: "success" | "error"; item: Record<string, string | number | null> }>(
    `/admin/facilities/${facility}/${rowId}`,
    payload,
  )
}

export async function deleteFacilityRecord(
  facility: "restaurants" | "minimarkets",
  rowId: number,
): Promise<AdminEntityDeleteResponse> {
  return deleteJSON<AdminEntityDeleteResponse>(`/admin/facilities/${facility}/${rowId}`)
}

export async function fetchAdminCities(params: {
  q?: string
  page?: number
  pageSize?: number
}): Promise<AdminCityListResponse> {
  const search = new URLSearchParams({
    q: params.q ?? "",
    page: String(params.page ?? 1),
    page_size: String(params.pageSize ?? 10),
  })
  const res = await fetch(`${API_BASE}/admin/cities?${search.toString()}`, { method: "GET", cache: "no-store" })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Gagal mengambil data city: ${res.status}`)
  }
  return (await res.json()) as AdminCityListResponse
}

export async function createAdminCity(name: string): Promise<AdminEntityMutationResponse<AdminCity>> {
  return postJSON<AdminEntityMutationResponse<AdminCity>>("/admin/cities", { name })
}

export async function updateAdminCity(cityId: number, name: string): Promise<AdminEntityMutationResponse<AdminCity>> {
  return putJSON<AdminEntityMutationResponse<AdminCity>>(`/admin/cities/${cityId}`, { name })
}

export async function deleteAdminCity(cityId: number): Promise<AdminEntityDeleteResponse> {
  return deleteJSON<AdminEntityDeleteResponse>(`/admin/cities/${cityId}`)
}

export async function fetchAdminCategories(params: {
  q?: string
  page?: number
  pageSize?: number
}): Promise<AdminCategoryListResponse> {
  const search = new URLSearchParams({
    q: params.q ?? "",
    page: String(params.page ?? 1),
    page_size: String(params.pageSize ?? 10),
  })
  const res = await fetch(`${API_BASE}/admin/categories?${search.toString()}`, {
    method: "GET",
    cache: "no-store",
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Gagal mengambil data category: ${res.status}`)
  }
  return (await res.json()) as AdminCategoryListResponse
}

export async function createAdminCategory(name: string): Promise<AdminEntityMutationResponse<AdminCategory>> {
  return postJSON<AdminEntityMutationResponse<AdminCategory>>("/admin/categories", { name })
}

export async function updateAdminCategory(
  categoryId: number,
  name: string,
): Promise<AdminEntityMutationResponse<AdminCategory>> {
  return putJSON<AdminEntityMutationResponse<AdminCategory>>(`/admin/categories/${categoryId}`, { name })
}

export async function deleteAdminCategory(categoryId: number): Promise<AdminEntityDeleteResponse> {
  return deleteJSON<AdminEntityDeleteResponse>(`/admin/categories/${categoryId}`)
}

export async function fetchAdminDestinations(params: {
  q?: string
  cityId?: number | null
  categoryId?: number | null
  status?: "all" | "active" | "inactive"
  page?: number
  pageSize?: number
}): Promise<AdminDestinationListResponse> {
  const search = new URLSearchParams({
    q: params.q ?? "",
    status: params.status ?? "all",
    page: String(params.page ?? 1),
    page_size: String(params.pageSize ?? 10),
  })
  if (params.cityId) search.set("city_id", String(params.cityId))
  if (params.categoryId) search.set("category_id", String(params.categoryId))
  const res = await fetch(`${API_BASE}/admin/destinations?${search.toString()}`, {
    method: "GET",
    cache: "no-store",
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Gagal mengambil data destinasi: ${res.status}`)
  }
  return (await res.json()) as AdminDestinationListResponse
}

export async function createAdminDestination(payload: {
  name: string
  city_id: number
  category_id: number
}): Promise<AdminEntityMutationResponse<AdminDestination>> {
  return postJSON<AdminEntityMutationResponse<AdminDestination>>("/admin/destinations", payload)
}

export async function updateAdminDestination(
  destinationId: number,
  payload: { name: string; city_id: number; category_id: number },
): Promise<AdminEntityMutationResponse<AdminDestination>> {
  return putJSON<AdminEntityMutationResponse<AdminDestination>>(`/admin/destinations/${destinationId}`, payload)
}

export async function deleteAdminDestination(destinationId: number): Promise<AdminEntityDeleteResponse> {
  return deleteJSON<AdminEntityDeleteResponse>(`/admin/destinations/${destinationId}`)
}

export async function updateAdminDestinationStatus(
  destinationId: number,
  isActive: boolean,
): Promise<AdminDestinationStatusResponse> {
  return patchJSON<AdminDestinationStatusResponse>(`/admin/destinations/${destinationId}/status`, {
    is_active: isActive,
  })
}

export async function updateAdminDestinationDescription(
  destinationId: number,
  description: string,
): Promise<AdminDestinationDescriptionResponse> {
  return patchJSON<AdminDestinationDescriptionResponse>(`/admin/destinations/${destinationId}/description`, {
    description,
  })
}

export async function updateTransjakartaRouteStatus(
  routeId: string,
  isActive: boolean,
): Promise<AdminTransjakartaRouteStatusResponse> {
  const payload = { route_id: routeId, is_active: isActive }
  try {
    return await patchJSON<AdminTransjakartaRouteStatusResponse>(
      "/admin/transjakarta-routes/status",
      payload,
    )
  } catch (err) {
    const message = (err as Error).message
    if (message.includes("Not Found") || message.includes("404")) {
      try {
        return await postJSON<AdminTransjakartaRouteStatusResponse>(
          "/admin/transjakarta-routes/status",
          payload,
        )
      } catch (postErr) {
        const postMessage = (postErr as Error).message
        if (postMessage.includes("Not Found") || postMessage.includes("404")) {
          throw new Error(
            "Endpoint toggle route belum tersedia di server. Deploy backend terbaru (git pull + restart wjai-backend).",
          )
        }
        throw postErr
      }
    }
    throw err
  }
}

export async function updateAdminDestinationBulkStatus(payload: {
  is_active: boolean
  category_id?: number | null
}): Promise<AdminDestinationBulkStatusResponse> {
  return patchJSON<AdminDestinationBulkStatusResponse>("/admin/destinations/bulk-status", payload)
}

export async function registerAccount(payload: {
  name: string
  email: string
  password: string
  role: UserRole
}): Promise<AuthResponse> {
  return postJSON<AuthResponse>("/auth/register", payload)
}

export async function loginAccount(payload: {
  email: string
  password: string
  role: UserRole
}): Promise<AuthResponse> {
  return postJSON<AuthResponse>("/auth/login", payload)
}

export async function updateOwnProfile(payload: {
  email: string
  current_password: string
  name?: string | null
  new_password?: string | null
}): Promise<AuthResponse> {
  return patchJSON<AuthResponse>("/auth/profile", payload)
}

export async function saveClusterHistory(payload: {
  user_email: string
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
  selected_destinations?: string[]
  hotel_name?: string | null
  hotel_lat?: number | null
  hotel_lon?: number | null
  top_k?: number | null
  generation_mode?: string | null
  daily_destination_limit?: number | null
  filtered_destinations?: Array<Record<string, unknown>>
  analysis?: Record<string, unknown>
  selection?: Record<string, unknown>
  routes?: Record<string, unknown>
}): Promise<{ status: "success" | "error"; item: { id: number; created_at: string } }> {
  return postJSON<{ status: "success" | "error"; item: { id: number; created_at: string } }>(
    "/cluster-history",
    payload,
  )
}

export async function fetchUserClusterHistory(params: {
  userEmail: string
  limit?: number
  dateFrom?: string
  dateTo?: string
  queryText?: string
}): Promise<UserClusterHistoryResponse> {
  const search = new URLSearchParams()
  search.set("user_email", params.userEmail.trim())
  search.set("limit", String(params.limit ?? 100))
  if (params.dateFrom?.trim()) search.set("date_from", params.dateFrom.trim())
  if (params.dateTo?.trim()) search.set("date_to", params.dateTo.trim())
  if (params.queryText?.trim()) search.set("query_text", params.queryText.trim())
  const path = `/cluster-history?${search.toString()}`
  const res = await fetchWithBaseFallback(path, { method: "GET", cache: "no-store" })
  return (await res.json()) as UserClusterHistoryResponse
}

export async function fetchUserClusterHistoryItem(params: {
  historyId: number
  userEmail: string
}): Promise<{ status: "success" | "error"; item: ClusterHistoryItem }> {
  const search = new URLSearchParams()
  search.set("user_email", params.userEmail.trim())
  const path = `/cluster-history/${params.historyId}?${search.toString()}`
  const res = await fetchWithBaseFallback(path, { method: "GET", cache: "no-store" })
  return (await res.json()) as { status: "success" | "error"; item: ClusterHistoryItem }
}

export async function fetchAdminClusterHistoryItem(
  historyId: number,
): Promise<{ status: "success" | "error"; item: ClusterHistoryItem }> {
  const path = `/admin/cluster-history/${historyId}`
  const res = await fetchWithBaseFallback(path, { method: "GET", cache: "no-store" })
  return (await res.json()) as { status: "success" | "error"; item: ClusterHistoryItem }
}

export async function saveItineraryHistory(payload: {
  user_email: string
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
  itinerary_days?: Array<{ day: number; distance_km: number; stops: number; poi_names: string[] }>
}): Promise<{ status: "success" | "error"; item: { id: number; created_at: string } }> {
  return postJSON<{ status: "success" | "error"; item: { id: number; created_at: string } }>(
    "/itinerary-history",
    payload,
  )
}

export async function fetchUserItineraryHistory(params: {
  userEmail: string
  limit?: number
  dateFrom?: string
  dateTo?: string
  queryText?: string
}): Promise<UserItineraryHistoryResponse> {
  const search = new URLSearchParams()
  search.set("user_email", params.userEmail.trim())
  search.set("limit", String(params.limit ?? 100))
  if (params.dateFrom?.trim()) search.set("date_from", params.dateFrom.trim())
  if (params.dateTo?.trim()) search.set("date_to", params.dateTo.trim())
  if (params.queryText?.trim()) search.set("query_text", params.queryText.trim())
  const path = `/itinerary-history?${search.toString()}`
  const res = await fetchWithBaseFallback(path, { method: "GET", cache: "no-store" })
  return (await res.json()) as UserItineraryHistoryResponse
}

export async function fetchAdminClusterHistory(params?: {
  dateFrom?: string
  dateTo?: string
  userEmail?: string
}): Promise<AdminClusterHistoryResponse> {
  const search = new URLSearchParams()
  if (params?.dateFrom?.trim()) search.set("date_from", params.dateFrom.trim())
  if (params?.dateTo?.trim()) search.set("date_to", params.dateTo.trim())
  if (params?.userEmail?.trim()) search.set("user_email", params.userEmail.trim())
  const qs = search.toString()
  const path = qs ? `/admin/cluster-history?${qs}` : "/admin/cluster-history"
  const res = await fetchWithBaseFallback(path, { method: "GET", cache: "no-store" })
  return (await res.json()) as AdminClusterHistoryResponse
}

export async function fetchAdminItineraryHistory(params?: {
  dateFrom?: string
  dateTo?: string
  userEmail?: string
}): Promise<AdminItineraryHistoryResponse> {
  const search = new URLSearchParams()
  if (params?.dateFrom?.trim()) search.set("date_from", params.dateFrom.trim())
  if (params?.dateTo?.trim()) search.set("date_to", params.dateTo.trim())
  if (params?.userEmail?.trim()) search.set("user_email", params.userEmail.trim())
  const qs = search.toString()
  const path = qs ? `/admin/itinerary-history?${qs}` : "/admin/itinerary-history"
  const res = await fetchWithBaseFallback(path, { method: "GET", cache: "no-store" })
  return (await res.json()) as AdminItineraryHistoryResponse
}

export async function updateAdminClusterHistory(
  historyId: number,
  payload: AdminClusterHistoryUpdatePayload,
): Promise<AdminClusterHistoryUpdateResponse> {
  return patchJSON<AdminClusterHistoryUpdateResponse>(`/admin/cluster-history/${historyId}`, payload)
}

export async function deleteAdminClusterHistory(historyId: number): Promise<AdminEntityDeleteResponse> {
  const path = `/admin/cluster-history/${historyId}`
  const res = await fetchWithBaseFallback(path, { method: "DELETE", cache: "no-store" })
  return (await res.json()) as AdminEntityDeleteResponse
}

export async function fetchAdminUsers(): Promise<AdminUsersResponse> {
  const res = await fetchWithBaseFallback("/admin/users", { method: "GET", cache: "no-store" })
  return (await res.json()) as AdminUsersResponse
}
