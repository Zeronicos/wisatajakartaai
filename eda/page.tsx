'use client'

import dynamic from 'next/dynamic'
import { useState, useEffect } from 'react'
import type { CSSProperties } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { Landmark, BusFront, UtensilsCrossed, ShoppingBag, Map, BarChart2, Layers3, Flame, Building2 } from 'lucide-react'
import Navbar from '@/components/wisata/Navbar'
import { fetchEDAWithSource } from '@/lib/api'
import type { EDAData } from '@/lib/types'
import { getRouteTypeColor } from '@/lib/routeTypeColors'

const MapEDA = dynamic(() => import('@/components/wisata/MapEDA'), { ssr: false })

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
              <Map className="w-4 h-4 text-primary" />
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
                  <Map className="w-4 h-4 text-primary" />
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
