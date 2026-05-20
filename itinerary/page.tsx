'use client'

import dynamic from 'next/dynamic'
import { Fragment, useState, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  Map as MapIcon,
  Hotel,
  Navigation,
  Printer,
  RefreshCw,
  ChevronRight,
  Ruler,
  MapPin,
  Bus,
  UtensilsCrossed,
  ShoppingBag,
  Star,
  TrendingUp,
  Activity,
  Hash,
  Info,
  CheckCircle2,
  ArrowRight,
  Calendar,
  Search,
  X,
  LayoutGrid,
  Loader2,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts'
import Navbar from '@/components/wisata/Navbar'
import DestinationItineraryCard from '@/components/wisata/DestinationItineraryCard'
import { fetchRoadDistanceMatrix, saveItineraryHistory } from '@/lib/api'
import { getClientSession } from '@/lib/auth'
import { getCategoryIcon } from '@/lib/getCategoryIcon'
import type { DayRoute, HotelLocation, ClusterResponse, EnrichedPOI, RouteStop } from '@/lib/types'
import { MOCK_ROUTES, MOCK_CLUSTER_RESPONSE } from '@/lib/mockData'

const MapResult = dynamic(() => import('@/components/wisata/MapResult'), { ssr: false })

const DAY_COLORS = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4']
const DAY_COLORS_LIGHT = ['#FEF2F2', '#EFF6FF', '#F0FDF4', '#FFFBEB', '#F5F3FF', '#FDF2F8', '#ECFEFF']
const DAY_COLORS_TEXT = ['#B91C1C', '#1D4ED8', '#15803D', '#B45309', '#7C3AED', '#BE185D', '#0E7490']
const ITINERARY_STEPS = [
  {
    title: 'Input Preferensi',
    short: '1',
    detail: 'Isi hotel dan preferensi perjalanan',
    href: '/planner',
  },
  {
    title: 'Review Cluster',
    short: '2',
    detail: 'Tinjau hasil cluster destinasi',
    href: '/cluster',
  },
  {
    title: 'Finalisasi Itinerary',
    short: '3',
    detail: 'Atur timeline, peta, dan cetak',
    href: '/itinerary',
  },
] as const

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180
  const R = 6371000
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function printFallbackEnrichedPoi(stop: RouteStop): EnrichedPOI {
  return {
    poi_id: stop.poi_id,
    name: stop.name,
    category: '',
    subcategory: '',
    latitude: stop.latitude,
    longitude: stop.longitude,
    description: '',
    district: '',
    semantic_score: 0,
    dist_to_hotel_m: 0,
    dist_to_stop_m: 0,
    nearest_stop_name: '-',
    resto_count: 0,
    minimarket_count: 0,
  }
}

function recalculateDayRoute(
  dayRoute: DayRoute,
  hotel: HotelLocation,
  replaceIndex: number,
  candidate: EnrichedPOI,
): DayRoute {
  const nextStops = dayRoute.ordered_route.map((stop) => ({ ...stop }))
  const targetOrder = nextStops[replaceIndex]?.order ?? replaceIndex + 1
  nextStops[replaceIndex] = {
    ...nextStops[replaceIndex],
    order: targetOrder,
    poi_id: candidate.poi_id,
    name: candidate.name,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
  }

  let prevLat = hotel.lat
  let prevLon = hotel.lon
  let totalMeters = 0
  const normalizedStops = nextStops.map((stop, idx) => {
    const distanceM = haversineMeters(prevLat, prevLon, stop.latitude, stop.longitude)
    totalMeters += distanceM
    const updated: RouteStop = {
      ...stop,
      order: idx + 1,
      distance_from_prev_m: Math.round(distanceM),
      distance_from_prev_km: Number((distanceM / 1000).toFixed(2)),
      path_points: [
        [prevLat, prevLon],
        [stop.latitude, stop.longitude],
      ],
      distance_source: 'haversine',
    }
    prevLat = stop.latitude
    prevLon = stop.longitude
    return updated
  })

  return {
    ...dayRoute,
    ordered_route: normalizedStops,
    total_distance_m: Math.round(totalMeters),
    total_distance_km: Number((totalMeters / 1000).toFixed(2)),
  }
}

interface SummaryCardProps {
  icon: ReactNode
  label: string
  value: string | number
  sub?: string
  color?: string
  bg?: string
}

function SummaryCard({ icon, label, value, sub, color = 'text-primary', bg = 'bg-primary/10' }: SummaryCardProps) {
  return (
    <div className="bg-card rounded-2xl border border-border p-4 flex items-center gap-4 shadow-sm">
      <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center shrink-0`}>{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-xl font-bold leading-tight ${color}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

interface POITimelineItemProps {
  poi: RouteStop
  dayId: string
  isLast: boolean
  subcategory?: string
}

function POITimelineItem({ poi, dayId, isLast, subcategory = '' }: POITimelineItemProps) {
  const color = DAY_COLORS[parseInt(dayId) % DAY_COLORS.length]
  const colorLight = DAY_COLORS_LIGHT[parseInt(dayId) % DAY_COLORS_LIGHT.length]
  const icon = getCategoryIcon(subcategory)

  return (
    <div className="flex items-stretch gap-3">
      {/* Left: connector line + numbered circle */}
      <div className="flex flex-col items-center shrink-0 w-8">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md shrink-0"
          style={{ backgroundColor: color }}
        >
          {poi.order}
        </div>
        {!isLast && <div className="w-0.5 flex-1 mt-1.5" style={{ backgroundColor: color + '40' }} />}
      </div>

      {/* Right: POI card */}
      <div
        className="flex-1 rounded-xl border p-3 mb-4"
        style={{ backgroundColor: colorLight, borderColor: color + '30' }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-base leading-none">{icon}</span>
              <p className="font-semibold text-sm text-foreground leading-tight">{poi.name}</p>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 text-xs font-medium" style={{ color }}>
                <ArrowRight className="w-3 h-3 shrink-0" />
                {poi.distance_from_prev_km} km dari sebelumnya
              </span>
            </div>
          </div>
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
            style={{ backgroundColor: color, color: '#fff' }}
          >
            Stop {poi.order}
          </span>
        </div>
      </div>
    </div>
  )
}

type MatrixLabel = { short: string; full: string }

function ItineraryDistanceMatrixTable({
  labels,
  km,
  sources,
  tableId,
}: {
  labels: MatrixLabel[]
  km: number[][]
  sources?: string[][] | null
  tableId: string
}) {
  if (!km.length || labels.length !== km.length || km.some((row) => row.length !== labels.length)) {
    return <p className="text-xs text-muted-foreground">Matriks tidak tersedia atau ukuran tidak selaras dengan label.</p>
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table id={tableId} className="w-full min-w-[280px] border-collapse text-[11px] sm:text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-[1] min-w-[4.75rem] border border-border bg-muted px-2 py-2 text-left font-semibold text-muted-foreground">
              Asal / Tujuan
            </th>
            {labels.map((l, j) => (
              <th
                key={`${tableId}-c-${j}`}
                className="max-w-[6.5rem] min-w-[3.25rem] border border-border bg-muted px-1 py-2 text-center align-bottom font-semibold leading-tight text-foreground"
                title={l.full}
              >
                <span className="line-clamp-2">{l.short}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((rowL, i) => (
            <tr key={`${tableId}-r-${rowL.full}-${i}`}>
              <th
                className="sticky left-0 z-[1] max-w-[7rem] border border-border bg-card px-2 py-1.5 text-left font-semibold text-foreground"
                title={rowL.full}
              >
                <span className="line-clamp-2">{rowL.short}</span>
              </th>
              {labels.map((_, j) => {
                const src = sources?.[i]?.[j]
                const fallback = src === 'haversine' && i !== j
                return (
                  <td
                    key={`${tableId}-cell-${i}-${j}`}
                    className={`border border-border px-1 py-1.5 text-center tabular-nums ${
                      i === j ? 'bg-muted/50 text-muted-foreground' : 'text-foreground'
                    } ${fallback ? 'bg-amber-50/90 dark:bg-amber-950/30' : ''}`}
                    title={fallback ? 'Rute jalan tidak diperoleh — memakai jarak lurus' : undefined}
                  >
                    {i === j ? '—' : `${km[i][j].toFixed(2)}`}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ItineraryPage() {
  const router = useRouter()
  const [routeData, setRouteData] = useState<Record<string, DayRoute> | null>(null)
  const [hotel, setHotel] = useState<HotelLocation | null>(null)
  const [hotelName, setHotelName] = useState('Tidak diketahui')
  const [searchQuery, setSearchQuery] = useState('')
  const [clusterData, setClusterData] = useState<ClusterResponse | null>(null)
  const [activeDay, setActiveDay] = useState('0')
  const [activeTab, setActiveTab] = useState<'planner' | 'timeline' | 'stats' | 'map'>('timeline')
  const [generationMode, setGenerationMode] = useState<'manual' | 'auto'>('manual')
  const [changePanel, setChangePanel] = useState<{ dayId: string; order: number } | null>(null)
  const [changeQuery, setChangeQuery] = useState('')
  const [timelineMatrixOpen, setTimelineMatrixOpen] = useState(false)
  const [roadDistanceMatrix, setRoadDistanceMatrix] = useState<{
    km: number[][]
    sources: string[][]
    provider: string
    note?: string
  } | null>(null)
  const [roadDistanceMatrixLoading, setRoadDistanceMatrixLoading] = useState(false)
  const [roadDistanceMatrixError, setRoadDistanceMatrixError] = useState<string | null>(null)

  useEffect(() => {
    const rawRoutes = sessionStorage.getItem('routeData')
    const rawHotel = sessionStorage.getItem('hotelLocation')
    const rawHotelName = sessionStorage.getItem('hotelName')
    const rawClusters = sessionStorage.getItem('clusterData')
    const rawSearchQuery = sessionStorage.getItem('searchQuery')

    if (!rawRoutes) {
      setRouteData(MOCK_ROUTES)
      setHotel({ lat: -6.2000, lon: 106.8150 })
      setClusterData(MOCK_CLUSTER_RESPONSE)
      return
    }

    if (rawRoutes) setRouteData(JSON.parse(rawRoutes))
    if (rawHotel) setHotel(JSON.parse(rawHotel))
    if (rawHotelName?.trim()) setHotelName(rawHotelName.trim())
    if (rawClusters) setClusterData(JSON.parse(rawClusters))
    if (rawSearchQuery?.trim()) setSearchQuery(rawSearchQuery.trim())

    const rawGenerationMode = sessionStorage.getItem('generationMode')
    if (rawGenerationMode === 'auto' || rawGenerationMode === 'manual') {
      setGenerationMode(rawGenerationMode)
      if (rawGenerationMode === 'auto') setActiveTab('planner')
    }
  }, [])

  useEffect(() => {
    if (!timelineMatrixOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTimelineMatrixOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [timelineMatrixOpen])

  const activeTimelineDistanceMatrix = useMemo(() => {
    if (!hotel || !routeData?.[activeDay]) return null
    const stops = routeData[activeDay].ordered_route
    const labels = [
      { short: 'Hotel', full: 'Hotel (titik keberangkatan)' },
      ...stops.map((s) => ({
        short: s.name.length > 14 ? `${s.name.slice(0, 12)}…` : s.name,
        full: s.name,
      })),
    ]
    const coords = [
      { lat: hotel.lat, lon: hotel.lon },
      ...stops.map((s) => ({ lat: s.latitude, lon: s.longitude })),
    ]
    const n = coords.length
    const km: number[][] = []
    for (let i = 0; i < n; i += 1) {
      km[i] = []
      for (let j = 0; j < n; j += 1) {
        km[i][j] =
          i === j
            ? 0
            : haversineMeters(coords[i].lat, coords[i].lon, coords[j].lat, coords[j].lon) / 1000
      }
    }
    return { labels, km, dayLabel: parseInt(activeDay, 10) + 1 }
  }, [hotel, routeData, activeDay])

  const timelineMatrixRequestPoints = useMemo(() => {
    if (!hotel || !routeData?.[activeDay]) return null
    const stops = routeData[activeDay].ordered_route
    return [
      { lat: hotel.lat, lon: hotel.lon },
      ...stops.map((s) => ({ lat: s.latitude, lon: s.longitude })),
    ]
  }, [hotel, routeData, activeDay])

  useEffect(() => {
    if (!timelineMatrixOpen || !timelineMatrixRequestPoints?.length) {
      setRoadDistanceMatrix(null)
      setRoadDistanceMatrixError(null)
      setRoadDistanceMatrixLoading(false)
      return
    }
    let cancelled = false
    setRoadDistanceMatrixLoading(true)
    setRoadDistanceMatrixError(null)
    setRoadDistanceMatrix(null)
    fetchRoadDistanceMatrix(timelineMatrixRequestPoints)
      .then((res) => {
        if (cancelled) return
        setRoadDistanceMatrix({
          km: res.distances_km,
          sources: res.sources,
          provider: res.provider,
          note: res.note,
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setRoadDistanceMatrix(null)
        setRoadDistanceMatrixError(
          err instanceof Error ? err.message : 'Gagal memuat matriks jarak jalan dari server.',
        )
      })
      .finally(() => {
        if (!cancelled) setRoadDistanceMatrixLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [timelineMatrixOpen, timelineMatrixRequestPoints])

  const totalDistance = useMemo(() => {
    if (!routeData) return '0'
    return Object.values(routeData).reduce((s, d) => s + (d.total_distance_km || 0), 0).toFixed(2)
  }, [routeData])

  const totalStops = useMemo(() => {
    if (!routeData) return 0
    return Object.values(routeData).reduce((s, d) => s + d.ordered_route.length, 0)
  }, [routeData])

  const totalDaysForHistory = useMemo(() => {
    if (!routeData) return 0
    return Object.keys(routeData).length
  }, [routeData])

  const itineraryDaysForHistory = useMemo(() => {
    if (!routeData) return []
    return Object.entries(routeData)
      .sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10))
      .map(([dayId, dayRoute]) => ({
        day: parseInt(dayId, 10) + 1,
        distance_km: Number(dayRoute.total_distance_km ?? 0),
        stops: dayRoute.ordered_route.length,
        poi_names: dayRoute.ordered_route.map((stop) => stop.name).slice(0, 200),
      }))
  }, [routeData])

  useEffect(() => {
    if (!routeData || !hotel || !clusterData) return
    const sessionUser = getClientSession()
    if (!sessionUser || sessionUser.role !== 'user') return

    const signature = JSON.stringify({
      user: sessionUser.email,
      query: searchQuery || '-',
      k: clusterData.evaluation?.k_optimal ?? 1,
      d: Object.entries(routeData).map(([dayId, dayRoute]) => ({
        dayId,
        dist: dayRoute.total_distance_km,
        pois: dayRoute.ordered_route.map((s) => s.poi_id),
      })),
    })

    const dedupeKey = `itineraryHistorySignature:${sessionUser.email}`
    const prevSignature = sessionStorage.getItem(dedupeKey)
    if (prevSignature === signature) return

    const totalDistanceKm = Number(
      Object.values(routeData).reduce((s, d) => s + (d.total_distance_km || 0), 0).toFixed(2),
    )
    const totalDistanceM = Math.round(totalDistanceKm * 1000)
    const totalDays = totalDaysForHistory
    const totalStopsCount = totalStops
    const precision = Math.max(0, Math.min(1, Number(clusterData.evaluation?.silhouette_score ?? 0)))
    const recall = Math.max(
      0,
      Math.min(1, Number(1 / (1 + Math.max(0, Number(clusterData.evaluation?.davies_bouldin_index ?? 0))))),
    )
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0

    saveItineraryHistory({
      user_email: sessionUser.email,
      query_text: searchQuery || 'Tanpa query',
      num_days: Math.max(1, totalDays),
      total_days: Math.max(1, totalDays),
      total_stops: totalStopsCount,
      total_distance_km: totalDistanceKm,
      total_distance_m: totalDistanceM,
      avg_distance_per_day_km: Number((totalDistanceKm / Math.max(1, totalDays)).toFixed(2)),
      avg_stops_per_day: Number((totalStopsCount / Math.max(1, totalDays)).toFixed(2)),
      k_optimal: Number(clusterData.evaluation?.k_optimal ?? 1),
      silhouette_score: Number(clusterData.evaluation?.silhouette_score ?? 0),
      davies_bouldin_index: Number(clusterData.evaluation?.davies_bouldin_index ?? 0),
      wcss: Number(clusterData.evaluation?.wcss ?? 0),
      precision_score: Number(precision.toFixed(4)),
      recall_score: Number(recall.toFixed(4)),
      f1_score: Number(f1.toFixed(4)),
      hotel_name: hotelName,
      hotel_lat: hotel.lat,
      hotel_lon: hotel.lon,
      itinerary_days: itineraryDaysForHistory,
    })
      .then(() => {
        sessionStorage.setItem(dedupeKey, signature)
      })
      .catch(() => {
        // Jangan mengganggu UX itinerary saat simpan history gagal.
      })
  }, [clusterData, hotel, hotelName, itineraryDaysForHistory, routeData, searchQuery, totalDaysForHistory, totalStops])

  // Per-day distance bar chart data
  const distanceChartData = useMemo(() => {
    if (!routeData) return []
    return Object.entries(routeData).map(([dayId, r]) => ({
      name: `Hari ${parseInt(dayId) + 1}`,
      km: r.total_distance_km,
      stops: r.ordered_route.length,
      fill: DAY_COLORS[parseInt(dayId) % DAY_COLORS.length],
    }))
  }, [routeData])

  // Cumulative distance per stop for active day
  const cumulativeData = useMemo(() => {
    if (!routeData || !routeData[activeDay]) return []
    let cum = 0
    const pts = [{ stop: 'Hotel', km: 0 }]
    routeData[activeDay].ordered_route.forEach((p) => {
      cum += p.distance_from_prev_km
      pts.push({ stop: p.name.split(' ').slice(0, 2).join(' '), km: parseFloat(cum.toFixed(2)) })
    })
    return pts
  }, [routeData, activeDay])

  // POI subcategory map from clusterData
  const subcategoryMap = useMemo(() => {
    const map: Record<number, string> = {}
    if (!clusterData) return map
    Object.values(clusterData.clusters).forEach((cluster) => {
      cluster.pois.forEach((p) => { map[p.poi_id] = p.subcategory })
    })
    return map
  }, [clusterData])

  const poiMetaMap = useMemo(() => {
    const map: Record<number, { category: string; subcategory: string; district: string }> = {}
    if (!clusterData) return map
    Object.values(clusterData.clusters).forEach((cluster) => {
      cluster.pois.forEach((p) => {
        map[p.poi_id] = {
          category: p.category ?? '-',
          subcategory: p.subcategory ?? '-',
          district: p.district ?? '-',
        }
      })
    })
    return map
  }, [clusterData])

  const allCandidatePois = useMemo(() => {
    if (!clusterData) return []
    const byId = new Map<number, EnrichedPOI>()
    Object.values(clusterData.clusters).forEach((cluster) => {
      cluster.pois.forEach((poi) => {
        if (!byId.has(poi.poi_id)) byId.set(poi.poi_id, poi)
      })
    })
    return Array.from(byId.values()).sort((a, b) => b.semantic_score - a.semantic_score)
  }, [clusterData])

  const printEnrichedPoiById = useMemo(() => {
    const m = new Map<number, EnrichedPOI>()
    if (!clusterData?.clusters) return m
    Object.values(clusterData.clusters).forEach((cluster) => {
      cluster.pois.forEach((p) => {
        if (!m.has(p.poi_id)) m.set(p.poi_id, p)
      })
    })
    return m
  }, [clusterData])

  const handleChangeDestination = (dayId: string, order: number, candidate: EnrichedPOI) => {
    if (!routeData || !hotel) return
    const dayRoute = routeData[dayId]
    if (!dayRoute) return
    const replaceIndex = dayRoute.ordered_route.findIndex((item) => item.order === order)
    if (replaceIndex < 0) return

    const updatedDayRoute = recalculateDayRoute(dayRoute, hotel, replaceIndex, candidate)
    const updated = { ...routeData, [dayId]: updatedDayRoute }
    setRouteData(updated)
    sessionStorage.setItem('routeData', JSON.stringify(updated))
    setChangePanel(null)
    setChangeQuery('')
  }

  if (!routeData || !hotel) {
    return (
      <>
        <Navbar />
        <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
          Memuat itinerary...
        </div>
      </>
    )
  }

  const activeDayRoute = routeData[activeDay]
  const dayCount = Object.keys(routeData).length

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background print:pb-0">

        {/* ── Hero Header ── */}
        <div className="page-hero print:hidden">
          <div className="page-hero-inner">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <MapIcon className="w-5 h-5 text-accent" />
                  <h1 className="text-2xl font-bold tracking-tight">Rencana Perjalanan Wisata Anda</h1>
                </div>
                <p className="text-primary-foreground/70 text-sm">
                  Disusun otomatis menggunakan Greedy Nearest Neighbor &amp; Intelligent K-Means
                </p>
              </div>
              <div className="flex items-center gap-1.5 bg-white/10 rounded-2xl px-4 py-2">
                <CheckCircle2 className="w-4 h-4 text-accent" />
                <span className="text-sm font-semibold">Rute Optimal</span>
              </div>
            </div>

          </div>
        </div>

        <div className="app-container py-6 print:hidden">
          <section className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-col gap-2">
              <div className="overflow-x-auto pb-1">
                <div className="mx-auto min-w-[680px]">
                  <div className="flex items-start">
                    {ITINERARY_STEPS.map((step, idx) => {
                      const isActive = idx === 2
                      const isCompleted = idx < 2
                      const isClickable = !isActive
                      return (
                        <Fragment key={`step-pill-${step.title}`}>
                          <div className="flex w-28 shrink-0 flex-col items-center">
                            <button
                              type="button"
                              onClick={() => {
                                if (isClickable) router.push(step.href)
                              }}
                              className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                                isClickable ? 'cursor-pointer' : 'cursor-default'
                              } ${
                                isActive
                                  ? 'bg-primary text-primary-foreground'
                                  : isCompleted
                                    ? 'bg-primary/10 text-primary'
                                    : 'bg-muted text-muted-foreground'
                              }`}
                              aria-current={isActive ? 'step' : undefined}
                            >
                              {step.short}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (isClickable) router.push(step.href)
                              }}
                              className={`mt-2 text-center text-xs font-semibold transition-colors ${
                                isClickable ? 'cursor-pointer' : 'cursor-default'
                              } ${isActive ? 'text-primary' : isCompleted ? 'text-foreground' : 'text-muted-foreground'}`}
                            >
                              {step.title}
                            </button>
                          </div>
                          {idx < ITINERARY_STEPS.length - 1 && (
                            <div
                              className={`mx-3 mt-[1.15rem] h-1 flex-1 rounded-full ${idx < 2 ? 'bg-primary/55' : 'bg-border'}`}
                              aria-hidden
                            />
                          )}
                        </Fragment>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── Summary Cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <SummaryCard
              icon={<Navigation className="w-5 h-5 text-primary" />}
              label="Total Jarak"
              value={`${totalDistance} km`}
              sub="semua hari"
              color="text-primary"
              bg="bg-primary/10"
            />
            <SummaryCard
              icon={<MapPin className="w-5 h-5 text-blue-600" />}
              label="Total Destinasi"
              value={`${totalStops} tempat`}
              sub={`rata-rata ${(totalStops / dayCount).toFixed(1)}/hari`}
              color="text-blue-600"
              bg="bg-blue-50"
            />
            {clusterData && (
              <>
                <SummaryCard
                  icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
                  label="Silhouette Score"
                  value={clusterData.evaluation.silhouette_score.toFixed(4)}
                  sub="kualitas cluster (↑ baik)"
                  color="text-emerald-600"
                  bg="bg-emerald-50"
                />
                <SummaryCard
                  icon={<Activity className="w-5 h-5 text-orange-500" />}
                  label="Davies-Bouldin"
                  value={clusterData.evaluation.davies_bouldin_index.toFixed(4)}
                  sub="separasi cluster (↓ baik)"
                  color="text-orange-500"
                  bg="bg-orange-50"
                />
              </>
            )}
          </div>

          {/* ── Main Grid ── */}
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

            {/* ─── Left Panel ─── */}
            <div className="xl:col-span-2 flex flex-col gap-4">

              {/* Sub-tabs */}
              <div className="flex gap-1 rounded-xl border border-primary/25 bg-primary/5 p-1">
                  {([
                  { key: 'planner', label: 'Planner Style' },
                  { key: 'timeline', label: 'Timeline Rute' },
                  { key: 'stats', label: 'Statistik' },
                  { key: 'map', label: 'Peta (Mobile)' },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`${key === 'stats' ? 'presentation-hide ' : ''}flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      activeTab === key
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* ── Tab: Planner Style (selaras tampilan website) ── */}
              {activeTab === 'planner' && (
                <div className="surface-card overflow-hidden">
                  <div className="border-b border-primary/20 bg-primary/5 px-4 py-3">
                    <p className="text-lg font-bold tracking-tight text-foreground">Planner Itinerary</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {dayCount} hari • {totalStops} destinasi • {totalDistance} km •{' '}
                      {generationMode === 'auto' ? 'Auto Generate' : 'Pilih Sendiri'}
                    </p>
                  </div>

                  <div className="space-y-3 p-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {Object.keys(routeData).map((dayId) => {
                        const isActiveDay = activeDay === dayId
                        return (
                          <button
                            key={`planner-day-${dayId}`}
                            type="button"
                            onClick={() => setActiveDay(dayId)}
                            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                              isActiveDay
                                ? 'bg-primary text-primary-foreground'
                                : 'border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                            }`}
                          >
                            Hari {parseInt(dayId, 10) + 1}
                          </button>
                        )
                      })}
                    </div>

                    <div className="overflow-hidden rounded-lg border border-border bg-card">
                      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-2.5 py-1.5">
                        <p className="text-xs font-semibold text-foreground">
                          Hari {parseInt(activeDay, 10) + 1} · {activeDayRoute.ordered_route.length} tempat
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {activeDayRoute.total_distance_km} km total
                        </p>
                      </div>

                      <table className="w-full text-xs">
                        <thead>
                          <tr className="admin-table-head">
                            <th className="px-2.5 py-1.5 text-left">#</th>
                            <th className="px-2.5 py-1.5 text-left">Activity</th>
                            <th className="px-2.5 py-1.5 text-left">Kategori</th>
                            <th className="px-2.5 py-1.5 text-left">Change</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeDayRoute.ordered_route.map((poi) => {
                            const meta = poiMetaMap[poi.poi_id]
                            const subcategory = meta?.subcategory ?? subcategoryMap[poi.poi_id] ?? '-'
                            const inUsePoiIds = new Set(activeDayRoute.ordered_route.map((item) => item.poi_id))
                            const filteredCandidates = allCandidatePois
                              .filter((candidate) => !inUsePoiIds.has(candidate.poi_id) || candidate.poi_id === poi.poi_id)
                              .filter((candidate) => {
                                if (!changeQuery.trim()) return true
                                const q = changeQuery.toLowerCase()
                                return (
                                  candidate.name.toLowerCase().includes(q) ||
                                  (candidate.subcategory ?? '').toLowerCase().includes(q) ||
                                  (candidate.district ?? '').toLowerCase().includes(q)
                                )
                              })
                              .slice(0, 8)
                            return (
                              <Fragment key={`${poi.poi_id}-row`}>
                                <tr className="admin-table-row">
                                  <td className="px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground">{poi.order}</td>
                                  <td className="px-2.5 py-1.5 font-semibold text-foreground">{poi.name}</td>
                                  <td className="px-2.5 py-1.5 text-[11px] text-muted-foreground">
                                    <span className="font-medium text-foreground/80">{meta?.category ?? '-'}</span>
                                    <span className="mx-1">•</span>
                                    <span className="italic">{subcategory}</span>
                                  </td>
                                  <td className="px-2.5 py-1.5 text-[11px]">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (changePanel?.dayId === activeDay && changePanel?.order === poi.order) {
                                          setChangePanel(null)
                                          setChangeQuery('')
                                        } else {
                                          setChangePanel({ dayId: activeDay, order: poi.order })
                                          setChangeQuery('')
                                        }
                                      }}
                                      className="admin-btn-secondary px-2 py-0.5 text-[10px]"
                                    >
                                      Change
                                    </button>
                                  </td>
                                </tr>
                                {changePanel?.dayId === activeDay && changePanel?.order === poi.order && (
                                  <tr className="border-b border-border bg-muted/20">
                                    <td colSpan={4} className="px-2.5 py-2">
                                      <div className="rounded-lg border border-border bg-card p-2.5">
                                        <div className="mb-2 flex items-center justify-between gap-2">
                                          <p className="text-xs font-semibold text-foreground">
                                            Ganti destinasi untuk stop #{poi.order}
                                          </p>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setChangePanel(null)
                                              setChangeQuery('')
                                            }}
                                            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                                          >
                                            <X className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                        <div className="relative mb-2">
                                          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                          <input
                                            value={changeQuery}
                                            onChange={(e) => setChangeQuery(e.target.value)}
                                            placeholder="Cari destinasi pengganti..."
                                            className="admin-input"
                                          />
                                        </div>
                                        <div className="max-h-44 space-y-1 overflow-y-auto">
                                          {filteredCandidates.length === 0 && (
                                            <p className="px-2 py-1 text-xs text-muted-foreground">Tidak ada hasil.</p>
                                          )}
                                          {filteredCandidates.map((candidate) => (
                                            <button
                                              key={`change-${activeDay}-${poi.order}-${candidate.poi_id}`}
                                              type="button"
                                              onClick={() => handleChangeDestination(activeDay, poi.order, candidate)}
                                              className="flex w-full items-center justify-between rounded-lg border border-border px-2.5 py-2 text-left hover:bg-muted/40"
                                            >
                                              <div>
                                                <p className="text-xs font-semibold text-foreground">{candidate.name}</p>
                                                <p className="text-[11px] text-muted-foreground">
                                                  {candidate.subcategory} · {candidate.district}
                                                </p>
                                              </div>
                                              <span className="text-[11px] font-semibold text-primary">
                                                score {candidate.semantic_score.toFixed(3)}
                                              </span>
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Tab: Timeline ── */}
              {activeTab === 'timeline' && activeDayRoute && (
                <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">

                  {/* Hotel start node */}
                  <div className="mb-1 flex items-stretch gap-2.5">
                    <div className="flex flex-col items-center shrink-0 w-8">
                      <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center shadow-md">
                        <Hotel className="w-4 h-4 text-amber-700" />
                      </div>
                      <div
                        className="w-0.5 flex-1 mt-1.5"
                        style={{ backgroundColor: DAY_COLORS[parseInt(activeDay) % DAY_COLORS.length] + '40' }}
                      />
                    </div>
                    <div className="mb-3 flex-1 rounded-xl border border-amber-200 bg-amber-50 p-2.5">
                      <p className="text-xs font-semibold text-foreground">Hotel (Titik Keberangkatan)</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{hotelName}</p>
                    </div>
                  </div>

                  {/* POI stops */}
                  {activeDayRoute.ordered_route.map((poi, idx) => (
                    <POITimelineItem
                      key={poi.poi_id}
                      poi={poi}
                      dayId={activeDay}
                      isLast={idx === activeDayRoute.ordered_route.length - 1}
                      subcategory={subcategoryMap[poi.poi_id]}
                    />
                  ))}

                  {/* Return note */}
                  <div className="mt-1 flex items-center gap-2 border-t border-border pt-2.5">
                    <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center shrink-0">
                      <Hotel className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <p className="text-xs text-muted-foreground italic">
                      Kembali ke hotel setelah kunjungan terakhir
                    </p>
                  </div>

                  {/* Day total footer */}
                  <div className="mt-2.5 rounded-xl bg-muted p-2.5">
                    <div className="grid grid-cols-2 divide-x divide-border text-center">
                      <div>
                        <p className="text-[11px] text-muted-foreground">Destinasi</p>
                        <p className="text-xs font-bold text-foreground">{activeDayRoute.ordered_route.length} tempat</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">Jarak Total</p>
                        <p className="text-xs font-bold text-primary">{activeDayRoute.total_distance_km} km</p>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setTimelineMatrixOpen(true)}
                    disabled={!activeTimelineDistanceMatrix}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-haspopup="dialog"
                  >
                    <LayoutGrid className="h-4 w-4 shrink-0" aria-hidden />
                    Analisis matriks
                  </button>
                </div>
              )}

              {/* ── Tab: Stats ── */}
              {activeTab === 'stats' && (
                <div className="presentation-hide space-y-4">
                  {/* Distance per day chart */}
                  <div className="surface-card p-4">
                    <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
                      <Ruler className="w-4 h-4 text-primary" />
                      Jarak per Hari (km)
                    </h3>
                    <ResponsiveContainer width="100%" height={150}>
                      <BarChart data={distanceChartData} barCategoryGap="30%">
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} unit=" km" />
                        <Tooltip
                          formatter={(v: number) => [`${v} km`, 'Jarak']}
                          contentStyle={{ fontSize: 12, borderRadius: 8 }}
                        />
                        <Bar dataKey="km" radius={[6, 6, 0, 0]}>
                          {distanceChartData.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Cumulative distance chart for active day */}
                  <div className="surface-card p-4">
                    <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
                      <Navigation className="w-4 h-4 text-primary" />
                      Kumulatif Jarak - Hari {parseInt(activeDay) + 1}
                    </h3>
                    <ResponsiveContainer width="100%" height={150}>
                      <LineChart data={cumulativeData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="stop" tick={{ fontSize: 9 }} interval={0} angle={-20} textAnchor="end" height={40} />
                        <YAxis tick={{ fontSize: 11 }} unit=" km" />
                        <Tooltip
                          formatter={(v: number) => [`${v} km`, 'Jarak Kum.']}
                          contentStyle={{ fontSize: 12, borderRadius: 8 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="km"
                          stroke={DAY_COLORS[parseInt(activeDay) % DAY_COLORS.length]}
                          strokeWidth={2.5}
                          dot={{ r: 5, fill: DAY_COLORS[parseInt(activeDay) % DAY_COLORS.length] }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Evaluation metrics */}
                  {clusterData && (
                    <div className="surface-card p-4">
                      <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
                        <Star className="w-4 h-4 text-primary" />
                        Metrik Evaluasi Sistem
                      </h3>
                      <div className="space-y-2.5">
                        {[
                          {
                            label: 'Silhouette Score',
                            val: clusterData.evaluation.silhouette_score,
                            max: 1,
                            color: '#10B981',
                            note: `${(clusterData.evaluation.silhouette_score * 100).toFixed(1)}% kualitas cluster`,
                          },
                          {
                            label: 'Davies-Bouldin',
                            val: Math.max(0, 1 - clusterData.evaluation.davies_bouldin_index),
                            max: 1,
                            color: '#3B82F6',
                            note: `DBI = ${clusterData.evaluation.davies_bouldin_index.toFixed(4)}`,
                          },
                        ].map((m) => (
                          <div key={m.label}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="font-medium text-foreground">{m.label}</span>
                              <span className="text-muted-foreground">{m.note}</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-2 rounded-full transition-all"
                                style={{ width: `${(m.val / m.max) * 100}%`, backgroundColor: m.color }}
                              />
                            </div>
                          </div>
                        ))}
                        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border text-center">
                          <div>
                            <p className="text-xs text-muted-foreground">K</p>
                            <p className="font-bold text-foreground">{clusterData.evaluation.k_optimal}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Iterasi</p>
                            <p className="font-bold text-foreground">{clusterData.evaluation.iterations}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">WCSS</p>
                            <p className="font-bold text-foreground">{clusterData.evaluation.wcss.toFixed(2)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Tab: Map (mobile only) ── */}
              {activeTab === 'map' && (
                <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden xl:hidden" style={{ height: 360 }}>
                  <MapResult routeData={routeData} hotel={hotel} activeDay={activeDay} />
                </div>
              )}

              {false && (
                <div className="surface-card p-4">
                  <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary" />
                    Ringkasan Semua Hari
                  </h3>
                  <div className="space-y-1.5">
                    {Object.entries(routeData ?? {}).map(([dayId, dayRoute]) => {
                      const color = DAY_COLORS[parseInt(dayId) % DAY_COLORS.length]
                      const colorLight = DAY_COLORS_LIGHT[parseInt(dayId) % DAY_COLORS_LIGHT.length]
                      const colorText = DAY_COLORS_TEXT[parseInt(dayId) % DAY_COLORS_TEXT.length]
                      const isActive = activeDay === dayId
                      return (
                        <button
                          key={dayId}
                          onClick={() => setActiveDay(dayId)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all border ${
                            isActive ? 'border-opacity-30 shadow-sm' : 'border-transparent hover:bg-muted/60'
                          }`}
                          style={isActive ? { backgroundColor: colorLight, borderColor: color + '50' } : {}}
                        >
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                            style={{ backgroundColor: color }}
                          >
                            {parseInt(dayId) + 1}
                          </div>
                          <div className="flex-1 text-left">
                            <p className="font-semibold text-sm text-foreground">Hari ke-{parseInt(dayId) + 1}</p>
                            <p className="text-xs text-muted-foreground">{dayRoute.ordered_route.length} destinasi</p>
                          </div>
                          <p className="font-bold text-sm shrink-0" style={{ color }}>
                            {dayRoute.total_distance_km} km
                          </p>
                          <ChevronRight className="w-4 h-4 shrink-0" style={{ color: colorText }} />
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                    <p className="text-sm text-muted-foreground font-medium">Total Keseluruhan</p>
                    <p className="font-bold text-foreground">{totalDistance} km</p>
                  </div>
                </div>
              )}
            </div>

            {/* ─── Right Panel: Map ─── */}
            <div className="xl:col-span-3 hidden xl:block">
              <div className="surface-card sticky top-4 overflow-hidden">
                {/* Map header */}
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapIcon className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-sm text-foreground">Peta Rute Perjalanan</span>
                    <span className="text-xs text-muted-foreground">
                      — Hari {parseInt(activeDay) + 1} disorot
                    </span>
                  </div>
                  {/* Day legend pills */}
                  <div className="flex gap-1.5 flex-wrap">
                    {Object.keys(routeData).map((dayId) => {
                      const color = DAY_COLORS[parseInt(dayId) % DAY_COLORS.length]
                      const isActive = activeDay === dayId
                      return (
                        <button
                          key={dayId}
                          onClick={() => setActiveDay(dayId)}
                          className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-all ${
                            isActive ? 'text-white shadow' : 'bg-muted text-muted-foreground hover:bg-muted/60'
                          }`}
                          style={isActive ? { backgroundColor: color } : {}}
                        >
                          H{parseInt(dayId) + 1}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Map */}
                <div style={{ height: 440 }}>
                  <MapResult routeData={routeData} hotel={hotel} activeDay={activeDay} />
                </div>

                {/* Map legend */}
                <div className="px-4 py-3 border-t border-border bg-muted/40">
                  <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-amber-400 border-2 border-black inline-block" />
                      Hotel
                    </span>
                    {Object.keys(routeData).map((dayId) => (
                      <span key={dayId} className="flex items-center gap-1.5">
                        <span
                          className="w-3 h-3 rounded-full inline-block"
                          style={{ backgroundColor: DAY_COLORS[parseInt(dayId) % DAY_COLORS.length] }}
                        />
                        Hari {parseInt(dayId) + 1}
                      </span>
                    ))}
                    <span className="flex items-center gap-1.5 ml-auto">
                      <span className="w-5 h-0.5 bg-gray-400 inline-block" style={{ borderTop: '2px dashed #aaa' }} />
                      Hari tidak aktif
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3">
                  <button
                    onClick={() => router.push('/')}
                    className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-all hover:bg-muted/70"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Mulai Ulang
                  </button>
                  <button
                    onClick={() => router.push('/cluster')}
                    className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-all hover:bg-muted/70"
                  >
                    <ChevronRight className="h-3.5 w-3.5 rotate-180" />
                    Ubah Pilihan
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Cetak Itinerary
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2 xl:hidden">
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-all hover:bg-muted/70"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Mulai Ulang
            </button>
            <button
              onClick={() => router.push('/cluster')}
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-all hover:bg-muted/70"
            >
              <ChevronRight className="h-3.5 w-3.5 rotate-180" />
              Ubah Pilihan
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
            >
              <Printer className="h-3.5 w-3.5" />
              Cetak Itinerary
            </button>
          </div>

          {/* ── POI Detail Cards: full list per all days ── */}
          <div className="presentation-hide mt-8">
            <h2 className="font-bold text-foreground mb-4 flex items-center gap-2">
              <Info className="w-5 h-5 text-primary" />
              Detail Destinasi Per Hari
            </h2>

            <div className="space-y-6">
              {Object.entries(routeData).map(([dayId, dayRoute]) => {
                const color = DAY_COLORS[parseInt(dayId) % DAY_COLORS.length]
                const colorLight = DAY_COLORS_LIGHT[parseInt(dayId) % DAY_COLORS_LIGHT.length]
                const colorText = DAY_COLORS_TEXT[parseInt(dayId) % DAY_COLORS_TEXT.length]
                return (
                  <div key={dayId}>
                    {/* Day header */}
                    <div
                      className="flex items-center gap-3 px-4 py-3 rounded-2xl mb-3 border"
                      style={{ backgroundColor: colorLight, borderColor: color + '40' }}
                    >
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold"
                        style={{ backgroundColor: color }}
                      >
                        {parseInt(dayId) + 1}
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-foreground">Hari ke-{parseInt(dayId) + 1}</p>
                        <p className="text-xs" style={{ color: colorText }}>
                          {dayRoute.ordered_route.length} destinasi &middot; {dayRoute.total_distance_km} km
                        </p>
                      </div>
                      <span
                        className="text-xs font-bold px-3 py-1 rounded-full text-white"
                        style={{ backgroundColor: color }}
                      >
                        {dayRoute.total_distance_km} km
                      </span>
                    </div>

                    {/* POI grid */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {dayRoute.ordered_route.map((poi) => {
                        const sub = subcategoryMap[poi.poi_id] ?? ''
                        const enriched = clusterData
                          ? Object.values(clusterData.clusters)
                              .flatMap((c) => c.pois)
                              .find((p) => p.poi_id === poi.poi_id)
                          : null
                        const cardPoi: EnrichedPOI =
                          enriched ?? {
                            poi_id: poi.poi_id,
                            name: poi.name,
                            category: '',
                            subcategory: sub,
                            latitude: poi.latitude,
                            longitude: poi.longitude,
                            description: '',
                            district: '',
                            semantic_score: 0,
                            dist_to_hotel_m: 0,
                            dist_to_stop_m: 0,
                            resto_count: 0,
                            minimarket_count: 0,
                          }
                        return (
                          <DestinationItineraryCard
                            key={poi.poi_id}
                            poi={cardPoi}
                            accentColor={color}
                            orderBadge={poi.order}
                            primaryDistanceKm={poi.distance_from_prev_km}
                            distanceMode="route_leg"
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── Printable Itinerary (hanya saat print) ── */}
        <section className="hidden print:block print-itinerary">
          <header className="print-header">
            <h1>Rencana Perjalanan Wisata Jakarta</h1>
            <p className="print-subtitle">
              Disusun otomatis menggunakan Intelligent K-Means &amp; Greedy Nearest Neighbor
            </p>
            <div className="print-meta">
              <span><strong>{dayCount}</strong> Hari</span>
              <span><strong>{totalStops}</strong> Destinasi</span>
              <span><strong>{totalDistance}</strong> km Total</span>
            </div>
          </header>

          {Object.entries(routeData)
            .sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10))
            .map(([dayId, dayRoute]) => {
            const dayNo = parseInt(dayId, 10) + 1
            return (
              <article key={`print-${dayId}`} className="print-day">
                <div className="print-day-header text-center">
                  <h2 className="text-center">Hari {dayNo}</h2>
                  <p className="text-center">
                    Nama Hotel: {hotelName} · {dayRoute.ordered_route.length} Destinasi · {dayRoute.total_distance_km} KM
                  </p>
                </div>

                <table className="print-table print-dest-features-table">
                  <thead>
                    <tr>
                      <th className="print-col-no">No</th>
                      <th className="print-dest-name">Nama destinasi</th>
                      <th className="print-feature-col-head">Jarak hotel</th>
                      <th className="print-feature-col-head">Halte</th>
                      <th className="print-feature-col-head">Minimarket</th>
                      <th className="print-feature-col-head">Restoran</th>
                      <th className="print-col-sem">Skor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayRoute.ordered_route.map((stop) => {
                      const p = printEnrichedPoiById.get(stop.poi_id) ?? printFallbackEnrichedPoi(stop)
                      const meta = poiMetaMap[stop.poi_id]
                      const hotelKm = p.dist_to_hotel_m / 1000
                      const semPct = p.semantic_score * 100
                      return (
                        <tr key={`print-${dayId}-${stop.poi_id}-${stop.order}`}>
                          <td className="print-col-no tabular-nums">{stop.order}</td>
                          <td className="print-dest-name">
                            <strong>{p.name}</strong>
                          </td>
                          <td className="print-feature-cell">
                            <span className="print-feature-inline">
                              <Hotel className="h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden />
                              {hotelKm >= 0.01 ? `${hotelKm.toFixed(2)} km` : `${Math.round(p.dist_to_hotel_m)} m`}
                            </span>
                          </td>
                          <td className="print-feature-cell">
                            <span className="print-feature-inline">
                              <Bus className="h-3.5 w-3.5 shrink-0 text-blue-600" aria-hidden />
                              {Math.round(p.dist_to_stop_m)} m
                            </span>
                          </td>
                          <td className="print-feature-cell">
                            <span className="print-feature-inline">
                              <ShoppingBag className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                              {p.minimarket_count}
                            </span>
                          </td>
                          <td className="print-feature-cell">
                            <span className="print-feature-inline">
                              <UtensilsCrossed className="h-3.5 w-3.5 shrink-0 text-orange-500" aria-hidden />
                              {p.resto_count}
                            </span>
                          </td>
                          <td className="print-col-sem tabular-nums font-semibold">{semPct.toFixed(1)}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                <table className="print-table mt-2">
                  <thead>
                    <tr>
                      <th className="print-col-no">No</th>
                      <th className="print-dest-name">Nama destinasi</th>
                      <th className="print-feature-col-head">Kota</th>
                      <th className="print-feature-col-head">Kategori</th>
                      <th className="print-feature-col-head">Sub kategori</th>
                      <th className="print-feature-col-head">Halte terdekat</th>
                      <th className="print-feature-col-head">Jarak sebelumnya</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayRoute.ordered_route.map((stop) => {
                      const p = printEnrichedPoiById.get(stop.poi_id) ?? printFallbackEnrichedPoi(stop)
                      const meta = poiMetaMap[stop.poi_id]
                      const district = (p.district || meta?.district || '').trim() || '—'
                      const category = (p.category || meta?.category || '').trim() || '—'
                      const subcategory = (p.subcategory || meta?.subcategory || '').trim() || '—'
                      const nearestStopName = (p.nearest_stop_name || '').trim() || '—'
                      const prevKm = stop.distance_from_prev_km
                      const prevLabel =
                        prevKm >= 0.01 ? `${prevKm.toFixed(2)} km` : `${Math.round(stop.distance_from_prev_m)} m`

                      return (
                        <tr key={`print-extra-${dayId}-${stop.poi_id}-${stop.order}`}>
                          <td className="print-col-no tabular-nums">{stop.order}</td>
                          <td className="print-dest-name">
                            <strong>{p.name}</strong>
                          </td>
                          <td className="print-feature-cell">{district}</td>
                          <td className="print-feature-cell">{category}</td>
                          <td className="print-feature-cell">{subcategory}</td>
                          <td className="print-feature-cell">{nearestStopName}</td>
                          <td className="print-feature-cell tabular-nums">{prevLabel}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </article>
            )
          })}

          {/* <footer className="print-footer">
            <p className="print-footer-left">Hotel: {hotelName}</p>
            <p>Dicetak otomatis · Wisata Jakarta AI</p>
          </footer> */}
        </section>
      </main>

      {timelineMatrixOpen && activeTimelineDistanceMatrix && (
        <div
          className="fixed inset-0 z-[210] flex items-end justify-center p-3 sm:items-center sm:p-6 print:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="timeline-matrix-dialog-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            aria-label="Tutup analisis matriks"
            onClick={() => setTimelineMatrixOpen(false)}
          />
          <div
            className="relative z-10 flex max-h-[min(92vh,720px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <h2 id="timeline-matrix-dialog-title" className="text-sm font-bold text-foreground">
                  Analisis matriks jarak · Hari ke-{activeTimelineDistanceMatrix.dayLabel}
                </h2>
                {/* <p className="mt-1 text-xs text-muted-foreground leading-snug">
                  Dua tabel: jarak garis lurus (Haversine) dan jarak perkiraan <span className="font-medium text-foreground">lewat jalan</span>{' '}
                  (backend memanggil OSRM Table, profil driving). Tidak sama dengan ETA atau rute bernuansa lalu lintas.
                </p> */}
              </div>
              <button
                type="button"
                className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Tutup"
                onClick={() => setTimelineMatrixOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-6 overflow-auto p-3 sm:p-4">
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">1 · Garis lurus (Haversine)</h3>
                {/* <p className="text-[11px] text-muted-foreground leading-snug">
                  Jarak great-circle antar koordinat; bukan jarak menyusuri jalan.
                </p> */}
                <ItineraryDistanceMatrixTable
                  tableId="itinerary-matrix-haversine"
                  labels={activeTimelineDistanceMatrix.labels}
                  km={activeTimelineDistanceMatrix.km}
                />
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  2 · Rute jaringan jalan (OSRM driving)
                </h3>
                {/* <p className="text-[11px] text-muted-foreground leading-snug">
                  Dihitung di server dari OSRM public. Sel berlatar kuning: tidak ada jarak jalan yang valid — dipakai fallback Haversine.
                </p> */}
                {roadDistanceMatrixLoading ? (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
                    Memuat matriks jarak jalan dari server…
                  </p>
                ) : null}
                {roadDistanceMatrixError ? (
                  <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {roadDistanceMatrixError}
                  </p>
                ) : null}
                {!roadDistanceMatrixLoading && roadDistanceMatrix ? (
                  <div className="space-y-2">
                    {roadDistanceMatrix.note ? (
                      <p className="text-[11px] text-amber-800 dark:text-amber-200/90">{roadDistanceMatrix.note}</p>
                    ) : null}
                    {/* <p className="text-[11px] text-muted-foreground">
                      Sumber data:{' '}
                      <span className="font-semibold text-foreground">
                        {roadDistanceMatrix.provider === 'osrm'
                          ? 'OSRM Table (campuran rute/fallback)'
                          : roadDistanceMatrix.provider === 'haversine_only'
                            ? 'Hanya Haversine (OSRM tidak tersedia)'
                            : roadDistanceMatrix.provider}
                      </span> */}
                    {/* </p> */}
                    <ItineraryDistanceMatrixTable
                      tableId="itinerary-matrix-road"
                      labels={activeTimelineDistanceMatrix.labels}
                      km={roadDistanceMatrix.km}
                      sources={roadDistanceMatrix.sources}
                    />
                  </div>
                ) : null}
              </section>
            </div>
          </div>
        </div>
      )}

    </>
  )
}
