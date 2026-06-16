'use client'

import dynamic from 'next/dynamic'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import type { CSSProperties } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { Landmark, BusFront, UtensilsCrossed, ShoppingBag, Map as MapIcon, BarChart2, Layers3, Flame, Building2, Search, ExternalLink } from 'lucide-react'
import Navbar from '@/components/wisata/Navbar'
import { fetchEDAWithSource } from '@/lib/api'
import type { EDAData } from '@/lib/types'
import { buildGoogleMapsUrl } from '@/lib/geo'
import { getRouteTypeColor } from '@/lib/routeTypeColors'
import { computePoiNearbyContext, POI_NEARBY_MINIMARKET_RADIUS_M, POI_NEARBY_RESTAURANT_RADIUS_M, POI_NEARBY_ROUTE_RADIUS_M } from '@/lib/edaPoiNearby'

const MapEDA = dynamic(() => import('@/components/wisata/MapEDA'), { ssr: false })
const MapEDAPoiExplorer = dynamic(() => import('@/components/wisata/MapEDAPoiExplorer'), { ssr: false })

const LAYERS = [
  { id: 'poi', label: 'Destinasi Wisata', icon: Landmark, color: '#EF4444', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-600' },
  { id: 'stops', label: 'Halte Transjakarta', icon: BusFront, color: '#3B82F6', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-600' },
  { id: 'bus_routes', label: 'Jalur Bus TJ', icon: BusFront, color: '#1D4ED8', bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-600' },
  { id: 'restaurants', label: 'Restoran', icon: UtensilsCrossed, color: '#F97316', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-600' },
  { id: 'minimarkets', label: 'Minimarket', icon: ShoppingBag, color: '#10B981', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-600' },
]

const CATEGORY_COLORS = ['#16A34A', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6']
const MAP_MODES = [
  { id: 'points', label: 'Titik Mentah', icon: Layers3 },
  { id: 'density', label: 'Heatmap Grid', icon: Flame },
  { id: 'districts', label: 'Ringkasan Wilayah', icon: Building2 },
] as const

export default function EDAPage() {
  const [data, setData] = useState<EDAData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeLayer, setActiveLayer] = useState('poi')
  const [mapMode, setMapMode] = useState<'points' | 'density' | 'districts'>('points')
  const [selectedRouteTypes, setSelectedRouteTypes] = useState<number[]>([])

  const [demoMode, setDemoMode] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [selectedPoiId, setSelectedPoiId] = useState<number | null>(null)
  const [poiSearch, setPoiSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterDistrict, setFilterDistrict] = useState('')
  const [showNearbyRoutes, setShowNearbyRoutes] = useState(true)
  const [showNearbyRestaurants, setShowNearbyRestaurants] = useState(true)
  const [showNearbyMinimarkets, setShowNearbyMinimarkets] = useState(true)
  const poiRowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map())

  const poiCategoryOptions = useMemo(() => {
    if (!data) return []
    return [...new Set(data.poi_locations.map((p) => p.category).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'id'),
    )
  }, [data])

  const poiDistrictOptions = useMemo(() => {
    if (!data) return []
    return [...new Set(data.poi_locations.map((p) => p.district).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'id'),
    )
  }, [data])

  const filteredPoiLocations = useMemo(() => {
    if (!data) return []
    const q = poiSearch.trim().toLowerCase()
    return [...data.poi_locations]
      .filter((poi) => {
        if (filterCategory && poi.category !== filterCategory) return false
        if (filterDistrict && poi.district !== filterDistrict) return false
        if (!q) return true
        return (
          poi.name.toLowerCase().includes(q) ||
          poi.category.toLowerCase().includes(q) ||
          poi.subcategory.toLowerCase().includes(q) ||
          poi.district.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'id'))
  }, [data, poiSearch, filterCategory, filterDistrict])

  const selectedPoi = useMemo(
    () => data?.poi_locations.find((p) => p.id === selectedPoiId) ?? null,
    [data, selectedPoiId],
  )

  const nearbyContext = useMemo(() => {
    if (!selectedPoi || !data) return null
    return computePoiNearbyContext(
      selectedPoi,
      data.restaurant_locations,
      data.minimarket_locations,
      data.bus_route_lines,
      data.stop_locations,
    )
  }, [selectedPoi, data])

  const handleSelectPoi = useCallback((poiId: number) => {
    setSelectedPoiId(poiId)
    requestAnimationFrame(() => {
      poiRowRefs.current.get(poiId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
  }, [])

  useEffect(() => {
    if (!data?.poi_locations.length) return
    if (selectedPoiId !== null && data.poi_locations.some((p) => p.id === selectedPoiId)) return
    setSelectedPoiId(data.poi_locations[0]?.id ?? null)
  }, [data, selectedPoiId])

  useEffect(() => {
    let cancelled = false
    fetchEDAWithSource()
      .then(({ data: d, source }) => {
        if (cancelled) return
        setData(d)
        setDemoMode(source === 'mock')
        setFetchError(null)
        setSelectedRouteTypes(d.bus_route_type_summary.map((item) => item.route_type))
      })
      .catch((e: unknown) => {
        if (!cancelled) setFetchError(e instanceof Error ? e.message : 'Gagal memuat data EDA')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const toggleRouteType = (routeType: number) => {
    setSelectedRouteTypes((prev) => (
      prev.includes(routeType)
        ? prev.filter((item) => item !== routeType)
        : [...prev, routeType]
    ))
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background">
        {/* Header */}
        <div className="page-hero">
          <div className="page-hero-inner">
            <div className="flex items-center gap-2 mb-1">
              <BarChart2 className="w-5 h-5 text-accent" />
              <h1 className="text-2xl font-bold">Exploratory Data Analysis (EDA)</h1>
            </div>
            <p className="text-primary-foreground/80 text-sm">
              Sebaran data destinasi wisata dan fasilitas pendukung di DKI Jakarta
            </p>
          </div>
        </div>

        <div className="app-container py-6">
          {fetchError ? (
            <div className="mb-6 rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-foreground">
              <p className="font-semibold">Tidak dapat memuat data EDA</p>
              <p className="mt-1 text-muted-foreground">{fetchError}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Jalankan backend API pada port 8000 (mis. dari folder <code className="rounded bg-muted px-1">backend</code>
                dengan uvicorn). Jika ini muncul padahal Anda mengharapkan fallback demo, pastikan env tidak memakai{' '}
                <code className="rounded bg-muted px-1">NEXT_PUBLIC_REQUIRE_LIVE_EDA=true</code>.
              </p>
            </div>
          ) : null}
          {demoMode && !fetchError ? (
            <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
              <p className="font-semibold text-amber-900 dark:text-amber-200">Menampilkan data demo statis</p>
              <p className="mt-1 text-muted-foreground">
                Tidak ada koneksi ke <code className="rounded bg-background/80 px-1">NEXT_PUBLIC_API_BASE_URL</code> — halaman
                menggunakan contoh sampel dari kode frontend, bukan query langsung ke database Anda. Aktifkan server backend
                (biasanya{' '}
                <code className="rounded bg-background/80 px-1 py-0.5 text-xs">
                  uvicorn pada http://localhost:8000/api/eda
                </code>
                ) untuk grafik dari database.
              </p>
            </div>
          ) : null}
          {/* Stats Cards */}
          {data && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              {LAYERS.map(({ id, label, icon: Icon, bg, border, text, color }) => {
                const val = {
                  poi: data.stats.total_poi,
                  stops: data.stats.total_stops,
                  bus_routes: data.stats.total_bus_routes,
                  restaurants: data.stats.total_restaurants,
                  minimarkets: data.stats.total_minimarkets,
                }[id]
                return (
                  <button
                    key={id}
                    onClick={() => setActiveLayer(id)}
                    className={`${bg} border ${border} rounded-2xl p-4 text-center transition-all hover:scale-105 ${
                      activeLayer === id ? 'ring-2 ring-offset-1' : ''
                    }`}
                    style={{ '--tw-ring-color': color } as CSSProperties}
                  >
                    <Icon className={`w-6 h-6 mx-auto mb-2 ${text}`} />
                    <p className={`text-3xl font-bold ${text}`}>{val?.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground mt-1">{label}</p>
                  </button>
                )
              })}
            </div>
          )}

          {data && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Jenis jalur TransJakarta:</span>
              {data.bus_route_type_summary.map((item) => (
                <span
                  key={item.route_type}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] text-foreground"
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: getRouteTypeColor(item.route_type) }}
                  />
                  {item.label} ({item.count})
                </span>
              ))}
            </div>
          )}

          {/* Spatial Insight Cards */}
          {data && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="surface-card p-4">
                <p className="text-xs text-muted-foreground">Cakupan Wilayah</p>
                <p className="text-xl font-bold text-foreground">
                  {data.spatial_insights.district_coverage} district
                </p>
              </div>
              <div className="surface-card p-4">
                <p className="text-xs text-muted-foreground">Kelengkapan Koordinat POI</p>
                <p className="text-xl font-bold text-foreground">
                  {data.spatial_insights.coordinate_completeness_pct.toFixed(2)}%
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Missing: {data.poi_missing_coordinates}
                </p>
              </div>
              <div className="surface-card p-4">
                <p className="text-xs text-muted-foreground">District Terpadat</p>
                <p className="text-sm font-semibold text-foreground">
                  {data.spatial_insights.densest_district?.district ?? '-'}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {data.spatial_insights.densest_district?.poi_count ?? 0} POI
                </p>
              </div>
              <div className="surface-card p-4">
                <p className="text-xs text-muted-foreground">Akses Halte (Rata-rata)</p>
                <p className="text-xl font-bold text-foreground">
                  {data.spatial_insights.avg_nearest_stop_distance_m !== null
                    ? `${Math.round(data.spatial_insights.avg_nearest_stop_distance_m)} m`
                    : 'N/A'}
                </p>
              </div>
            </div>
          )}

          {/* Map + Layer Toggle */}
          <div className="surface-card mb-6 overflow-hidden">
            <div className="flex items-center gap-2 px-4 pt-4 pb-3 flex-wrap">
              <MapIcon className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm text-foreground">Peta Sebaran Data</span>
              <div className="flex gap-1.5 flex-wrap">
                {MAP_MODES.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setMapMode(id)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                      mapMode === id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5 flex-wrap ml-auto">
                {LAYERS.map(({ id, label, icon: Icon, text, bg, border }) => (
                  <button
                    key={id}
                    onClick={() => setActiveLayer(id)}
                    disabled={mapMode !== 'points'}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                      activeLayer === id ? `${bg} ${text} ${border}` : 'border-border text-muted-foreground hover:bg-muted'
                    } ${mapMode !== 'points' ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <Icon className="w-3 h-3" />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>
            </div>
            {data && mapMode === 'points' && activeLayer === 'bus_routes' && (
              <div className="px-4 pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">Filter jenis rute:</span>
                  <button
                    onClick={() => setSelectedRouteTypes(data.bus_route_type_summary.map((item) => item.route_type))}
                    className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
                  >
                    Semua
                  </button>
                  {data.bus_route_type_summary.map((item) => {
                    const active = selectedRouteTypes.includes(item.route_type)
                    return (
                      <button
                        key={item.route_type}
                        onClick={() => toggleRouteType(item.route_type)}
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                          active ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: getRouteTypeColor(item.route_type) }}
                        />
                        {item.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <div style={{ height: 380 }}>
              {!loading && data && (
                <MapEDA
                  data={data}
                  activeLayer={activeLayer}
                  mapMode={mapMode}
                  selectedRouteTypes={selectedRouteTypes}
                />
              )}
              {loading && (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  Memuat peta...
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t border-border bg-muted/20">
              <p className="text-xs text-muted-foreground">
                {mapMode === 'points' && 'Mode titik mentah menampilkan lokasi asli tiap entitas termasuk jalur bus TransJakarta per jenis rute.'}
                {mapMode === 'density' && 'Mode heatmap grid menampilkan hotspot kepadatan POI untuk melihat konsentrasi kawasan wisata.'}
                {mapMode === 'districts' && 'Mode ringkasan wilayah menampilkan centroid district dengan ukuran marker proporsional jumlah POI.'}
              </p>
            </div>
          </div>

          {/* Charts */}
          {data && (
            <div className="presentation-hide grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* By Category */}
              <div className="surface-card p-5">
                <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-primary" />
                  Jumlah POI per Kategori
                </h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.poi_by_category} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, fontSize: 12, border: '1px solid var(--border)' }}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {data.poi_by_category.map((_, i) => (
                        <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* By District */}
              <div className="surface-card p-5">
                <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
                  <MapIcon className="w-4 h-4 text-primary" />
                  Jumlah POI per Wilayah
                </h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.poi_by_district} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="district" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, fontSize: 12, border: '1px solid var(--border)' }}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {data.poi_by_district.map((_, i) => (
                        <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* District Detail Table */}
              <div className="surface-card p-5 md:col-span-2">
                <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-primary" />
                  Detail Spasial per Wilayah
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b border-border">
                        <th className="py-2 pr-3">District</th>
                        <th className="py-2 pr-3">POI</th>
                        <th className="py-2 pr-3">Density Index</th>
                        <th className="py-2 pr-3">Jarak Halte Terdekat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.district_details.map((district) => (
                        <tr key={district.district} className="border-b border-border/70">
                          <td className="py-2 pr-3 font-medium text-foreground">{district.district}</td>
                          <td className="py-2 pr-3 text-muted-foreground">{district.poi_count}</td>
                          <td className="py-2 pr-3 text-muted-foreground">
                            {(district.poi_density_index * 100).toFixed(2)}%
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground">
                            {district.nearest_stop_distance_m !== null
                              ? `${Math.round(district.nearest_stop_distance_m)} m`
                              : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Tabel Destinasi Aktif + Peta Interaktif */}
          {data && (
            <div className="surface-card mb-6 mt-6 overflow-hidden">
              <div className="border-b border-border px-4 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <Landmark className="h-4 w-4 text-red-600" />
                    <h2 className="text-sm font-semibold text-foreground">Destinasi Wisata Aktif</h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-foreground">
                      <input
                        type="checkbox"
                        checked={showNearbyRoutes}
                        onChange={(e) => setShowNearbyRoutes(e.target.checked)}
                        className="rounded border-border text-indigo-600 focus:ring-indigo-500"
                      />
                      <BusFront className="h-3.5 w-3.5 text-indigo-600" />
                      Jalur TJ aktif
                    </label>
                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-foreground">
                      <input
                        type="checkbox"
                        checked={showNearbyRestaurants}
                        onChange={(e) => setShowNearbyRestaurants(e.target.checked)}
                        className="rounded border-border text-orange-600 focus:ring-orange-500"
                      />
                      <UtensilsCrossed className="h-3.5 w-3.5 text-orange-600" />
                      Restoran {POI_NEARBY_RESTAURANT_RADIUS_M}m
                    </label>
                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-foreground">
                      <input
                        type="checkbox"
                        checked={showNearbyMinimarkets}
                        onChange={(e) => setShowNearbyMinimarkets(e.target.checked)}
                        className="rounded border-border text-emerald-600 focus:ring-emerald-500"
                      />
                      <ShoppingBag className="h-3.5 w-3.5 text-emerald-600" />
                      Minimarket {POI_NEARBY_MINIMARKET_RADIUS_M}m
                    </label>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {data.stats.total_poi.toLocaleString()} destinasi aktif — pilih baris atau pin, lalu lihat jalur TJ,
                  restoran & minimarket di sekitar
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2">
                <div className="border-b border-border lg:border-b-0 lg:border-r">
                  <div className="max-h-[420px] overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                        <tr className="border-b border-border text-left">
                          <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground">No</th>
                          <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground">Nama Destinasi</th>
                          <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground">Link Google</th>
                          <th className="hidden px-3 py-2.5 text-xs font-semibold text-muted-foreground sm:table-cell">Kategori</th>
                          <th className="hidden px-3 py-2.5 text-xs font-semibold text-muted-foreground md:table-cell">Wilayah</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPoiLocations.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                              Tidak ada destinasi yang cocok dengan filter.
                            </td>
                          </tr>
                        ) : (
                          filteredPoiLocations.map((poi, index) => {
                            const isSelected = poi.id === selectedPoiId
                            const googleMapsUrl =
                              poi.google_maps_url ??
                              buildGoogleMapsUrl(poi.latitude, poi.longitude, poi.name)
                            return (
                              <tr
                                key={poi.id}
                                ref={(el) => {
                                  if (el) poiRowRefs.current.set(poi.id, el)
                                  else poiRowRefs.current.delete(poi.id)
                                }}
                                onClick={() => handleSelectPoi(poi.id)}
                                className={`cursor-pointer border-b border-border/60 transition-colors ${
                                  isSelected
                                    ? 'bg-red-50/80 ring-1 ring-inset ring-red-200'
                                    : 'hover:bg-muted/40'
                                }`}
                              >
                                <td className="px-3 py-2.5 text-xs text-muted-foreground">{index + 1}</td>
                                <td className="px-3 py-2.5">
                                  <p className={`font-medium ${isSelected ? 'text-red-700' : 'text-foreground'}`}>
                                    {poi.name}
                                  </p>
                                  <p className="mt-0.5 text-[11px] text-muted-foreground sm:hidden">
                                    {poi.category} · {poi.district}
                                  </p>
                                </td>
                                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                                  {googleMapsUrl ? (
                                    <a
                                      href={googleMapsUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                                      title={`Buka ${poi.name} di Google Maps`}
                                    >
                                      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                                      Maps
                                    </a>
                                  ) : (
                                    <span className="text-[11px] text-muted-foreground">—</span>
                                  )}
                                </td>
                                <td className="hidden px-3 py-2.5 text-muted-foreground sm:table-cell">
                                  <span className="block">{poi.category}</span>
                                  <span className="text-[11px]">{poi.subcategory}</span>
                                </td>
                                <td className="hidden px-3 py-2.5 text-muted-foreground md:table-cell">{poi.district}</td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="relative min-h-[320px] lg:min-h-[420px]">
                  {!loading && (
                    <MapEDAPoiExplorer
                      pois={data.poi_locations}
                      selectedPoiId={selectedPoiId}
                      onSelectPoi={handleSelectPoi}
                      bounds={[
                        [data.coordinate_bounds.min_lat, data.coordinate_bounds.min_lon],
                        [data.coordinate_bounds.max_lat, data.coordinate_bounds.max_lon],
                      ]}
                      nearbyRestaurants={showNearbyRestaurants ? (nearbyContext?.restaurants ?? []) : []}
                      nearbyMinimarkets={showNearbyMinimarkets ? (nearbyContext?.minimarkets ?? []) : []}
                      nearbyStops={showNearbyRoutes ? (nearbyContext?.stops ?? []) : []}
                      nearbyRoutes={showNearbyRoutes ? (nearbyContext?.routes ?? []) : []}
                      showNearbyRestaurants={showNearbyRestaurants}
                      showNearbyMinimarkets={showNearbyMinimarkets}
                      showNearbyRoutes={showNearbyRoutes}
                    />
                  )}
                </div>
              </div>

              <div className="border-t border-border bg-muted/15 px-4 py-4 space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="search"
                      value={poiSearch}
                      onChange={(e) => setPoiSearch(e.target.value)}
                      placeholder="Cari destinasi..."
                      className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none ring-primary/30 focus:ring-2"
                    />
                  </div>
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
                  >
                    <option value="">Semua kategori</option>
                    {poiCategoryOptions.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                  <select
                    value={filterDistrict}
                    onChange={(e) => setFilterDistrict(e.target.value)}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
                  >
                    <option value="">Semua wilayah</option>
                    {poiDistrictOptions.map((district) => (
                      <option key={district} value={district}>
                        {district}
                      </option>
                    ))}
                  </select>
                </div>

                <p className="text-[11px] text-muted-foreground">
                  Menampilkan {filteredPoiLocations.length.toLocaleString()} dari{' '}
                  {data.stats.total_poi.toLocaleString()} destinasi
                  {selectedPoi ? (
                    <>
                      {' '}
                      · terpilih: <span className="font-medium text-foreground">{selectedPoi.name}</span>
                    </>
                  ) : null}
                </p>

                {selectedPoi && nearbyContext ? (
                  <div className="grid grid-cols-1 gap-4 border-t border-border/70 pt-4 md:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <BusFront className="h-4 w-4 text-indigo-700" />
                        <h3 className="text-xs font-semibold text-indigo-900">
                          Jalur TJ Aktif di Sekitar ({nearbyContext.routes.length})
                        </h3>
                        <span className="text-[10px] text-indigo-700/80">≤ {POI_NEARBY_ROUTE_RADIUS_M} m</span>
                      </div>
                      {nearbyContext.routes.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Tidak ada jalur TJ aktif dalam radius.</p>
                      ) : (
                        <ul className="max-h-36 space-y-1 overflow-y-auto text-xs">
                          {nearbyContext.routes.slice(0, 12).map((route) => (
                            <li
                              key={`${route.route_id}-${route.shape_id}`}
                              className="flex items-center justify-between gap-2 rounded-md bg-background/70 px-2 py-1.5"
                            >
                              <span className="flex items-center gap-2 truncate text-foreground">
                                <span
                                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: route.line_color ?? getRouteTypeColor(route.route_type) }}
                                />
                                <span className="truncate">{route.route_name}</span>
                              </span>
                              <span className="shrink-0 text-muted-foreground">{Math.round(route.distance_m)} m</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {nearbyContext.stops.length > 0 ? (
                        <p className="mt-2 text-[10px] text-indigo-800/80">
                          {nearbyContext.stops.length} halte TJ dalam radius 800 m
                        </p>
                      ) : null}
                    </div>

                    <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <UtensilsCrossed className="h-4 w-4 text-orange-700" />
                        <h3 className="text-xs font-semibold text-orange-900">
                          Restoran di Sekitar ({nearbyContext.restaurants.length})
                        </h3>
                        <span className="text-[10px] text-orange-700/80">≤ {POI_NEARBY_RESTAURANT_RADIUS_M} m</span>
                      </div>
                      {nearbyContext.restaurants.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Tidak ada restoran dalam radius 500 m.</p>
                      ) : (
                        <ul className="max-h-36 space-y-1 overflow-y-auto text-xs">
                          {nearbyContext.restaurants.slice(0, 15).map((resto, idx) => (
                            <li
                              key={`${resto.name}-${idx}`}
                              className="flex items-center justify-between gap-2 rounded-md bg-background/70 px-2 py-1.5"
                            >
                              <span className="truncate text-foreground">{resto.name}</span>
                              <span className="shrink-0 text-muted-foreground">{Math.round(resto.distance_m)} m</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <ShoppingBag className="h-4 w-4 text-emerald-700" />
                        <h3 className="text-xs font-semibold text-emerald-900">
                          Minimarket di Sekitar ({nearbyContext.minimarkets.length})
                        </h3>
                        <span className="text-[10px] text-emerald-700/80">≤ {POI_NEARBY_MINIMARKET_RADIUS_M} m</span>
                      </div>
                      {nearbyContext.minimarkets.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Tidak ada minimarket dalam radius 500 m.</p>
                      ) : (
                        <ul className="max-h-36 space-y-1 overflow-y-auto text-xs">
                          {nearbyContext.minimarkets.slice(0, 15).map((mini, idx) => (
                            <li
                              key={`${mini.name}-${idx}`}
                              className="flex items-center justify-between gap-2 rounded-md bg-background/70 px-2 py-1.5"
                            >
                              <span className="truncate text-foreground">{mini.name}</span>
                              <span className="shrink-0 text-muted-foreground">{Math.round(mini.distance_m)} m</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center h-40 text-muted-foreground">
              Memuat data EDA...
            </div>
          )}
        </div>
      </main>
    </>
  )
}
