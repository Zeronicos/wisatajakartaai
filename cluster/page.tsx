'use client'

import dynamic from 'next/dynamic'
import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  MapPin,
  Bus,
  UtensilsCrossed,
  ArrowRight,
  Layers,
  ShoppingBag,
  BarChart2,
  CheckCircle2,
  X,
  CalendarDays,
  Trash2,
  Maximize2,
  LayoutGrid,
  List,
  Ban,
} from 'lucide-react'
import Navbar from '@/components/wisata/Navbar'
import AppFlowStepIndicator from '@/components/wisata/AppFlowStepIndicator'
import LoadingSpinner from '@/components/wisata/LoadingSpinner'
import ElbowChart from '@/components/wisata/ElbowChart'
import DestinationItineraryCard from '@/components/wisata/DestinationItineraryCard'
import { optimizeRoute, saveClusterHistory } from '@/lib/api'
import { getClientSession } from '@/lib/auth'
import { enforcePageAccess, readStep1Session } from '@/lib/appFlowGuard'
import type { ClusterResponse, HotelLocation, EnrichedPOI, ClusterEvaluation, ClusterItem, DayRoute } from '@/lib/types'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const MapCluster = dynamic(() => import('@/components/wisata/MapCluster'), { ssr: false })

const CLUSTER_COLORS = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4']
const CLUSTER_BG = ['bg-red-50', 'bg-blue-50', 'bg-emerald-50', 'bg-amber-50', 'bg-purple-50', 'bg-pink-50', 'bg-cyan-50']
const CLUSTER_BADGE = [
  'bg-red-100 text-red-700',
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
  'bg-cyan-100 text-cyan-700',
]

const MAX_PLANNED_TRIP_DAYS = 14
const DEFAULT_DESTINATIONS_PER_DAY = 4

function buildAutoSelectionsByDay(
  clusters: Record<string, ClusterItem>,
  plannedDays: number,
  perDayLimit: number,
): {
  selectedPOIs: Record<string, EnrichedPOI[]>
  poiDayAssignments: Record<number, number>
  sidebarDaySequences: Record<number, number[]>
} {
  const nextSelected: Record<string, EnrichedPOI[]> = {}
  Object.keys(clusters).forEach((cid) => {
    nextSelected[cid] = []
  })

  const ranked: Array<{ clusterId: string; poi: EnrichedPOI }> = []
  Object.entries(clusters).forEach(([cid, cluster]) => {
    cluster.pois.forEach((poi) => {
      ranked.push({ clusterId: cid, poi })
    })
  })
  ranked.sort((a, b) => b.poi.semantic_score - a.poi.semantic_score)

  const nextAssignments: Record<number, number> = {}
  const nextSequences: Record<number, number[]> = {}
  for (let d = 1; d <= plannedDays; d += 1) nextSequences[d] = []

  const used = new Set<number>()
  const limit = Math.max(1, Math.min(20, Math.round(perDayLimit) || DEFAULT_DESTINATIONS_PER_DAY))

  for (let day = 1; day <= plannedDays; day += 1) {
    let picked = 0
    for (const { clusterId, poi } of ranked) {
      if (picked >= limit) break
      if (used.has(poi.poi_id)) continue
      nextSelected[clusterId].push(poi)
      nextAssignments[poi.poi_id] = day
      nextSequences[day].push(poi.poi_id)
      used.add(poi.poi_id)
      picked += 1
    }
  }

  return {
    selectedPOIs: nextSelected,
    poiDayAssignments: nextAssignments,
    sidebarDaySequences: nextSequences,
  }
}

type ActiveTab = 'clusters' | 'analysis' | 'destinations'
type GenerationMode = 'manual' | 'auto'
type DestinationListView = 'card' | 'table'
type DestinationPanelTab = 'picker' | 'summary'
type ZScoreRow = {
  cluster: string
  latitude: number
  longitude: number
  semantic_score: number
  dist_to_hotel_m: number
  dist_to_stop_m: number
  resto_count: number
  minimarket_count: number
}

type ZScoreDetailRow = {
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

type InterpretationFeatureKey = 'semantic' | 'dist_hotel' | 'dist_stop' | 'resto' | 'minimarket'

const INTERPRETATION_FEATURES: Array<{
  key: InterpretationFeatureKey
  label: string
  shortLabel: string
  higherIsBetter: boolean
}> = [
  { key: 'semantic', label: 'Skor Preferensi', shortLabel: 'Preferensi', higherIsBetter: true },
  { key: 'dist_hotel', label: 'Jarak Hotel', shortLabel: 'Hotel', higherIsBetter: false },
  { key: 'dist_stop', label: 'Jarak Halte', shortLabel: 'Halte', higherIsBetter: false },
  { key: 'resto', label: 'Kepadatan Restoran', shortLabel: 'Restoran', higherIsBetter: true },
  { key: 'minimarket', label: 'Kepadatan Minimarket', shortLabel: 'Minimarket', higherIsBetter: true },
]

function formatPreferencePercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function formatInterpretationFeatureValue(
  key: InterpretationFeatureKey,
  values: Record<InterpretationFeatureKey, number>,
): string {
  switch (key) {
    case 'semantic':
      return formatPreferencePercent(values.semantic)
    case 'dist_hotel':
      return `${Math.round(values.dist_hotel)} m`
    case 'dist_stop':
      return `${Math.round(values.dist_stop)} m`
    case 'resto':
      return values.resto.toFixed(1)
    case 'minimarket':
      return values.minimarket.toFixed(1)
  }
}

const INTERPRETATION_FEATURE_UI: Array<{
  key: InterpretationFeatureKey
  icon: typeof CheckCircle2
  label: string
  description: string
  boxClass: string
  iconClass: string
}> = [
  {
    key: 'semantic',
    icon: CheckCircle2,
    label: 'Preferensi',
    description: 'Relevansi preferensi',
    boxClass: 'border-emerald-200 bg-emerald-50',
    iconClass: 'text-emerald-700',
  },
  {
    key: 'dist_hotel',
    icon: MapPin,
    label: 'Hotel',
    description: 'Jarak dari hotel',
    boxClass: 'border-amber-200 bg-amber-50',
    iconClass: 'text-amber-700',
  },
  {
    key: 'dist_stop',
    icon: Bus,
    label: 'Halte',
    description: 'Jarak dari halte',
    boxClass: 'border-blue-200 bg-blue-50',
    iconClass: 'text-blue-700',
  },
  {
    key: 'resto',
    icon: UtensilsCrossed,
    label: 'Restoran',
    description: 'Kepadatan restoran',
    boxClass: 'border-orange-200 bg-orange-50',
    iconClass: 'text-orange-700',
  },
  {
    key: 'minimarket',
    icon: ShoppingBag,
    label: 'Minimarket',
    description: 'Kepadatan minimarket',
    boxClass: 'border-violet-200 bg-violet-50',
    iconClass: 'text-violet-700',
  },
]

const FEATURE_CONFIGS = [
  { key: 'avg_lat', label: 'Avg Lat', color: '#0ea5e9', formatter: (v: number) => v.toFixed(5) },
  { key: 'avg_lon', label: 'Avg Lon', color: '#0284c7', formatter: (v: number) => v.toFixed(5) },
  { key: 'avg_semantic', label: 'Avg Skor Semantik', color: '#16a34a', formatter: (v: number) => v.toFixed(4) },
  { key: 'avg_dist_hotel_m', label: 'Avg Jarak Hotel (m)', color: '#f97316', formatter: (v: number) => `${Math.round(v)} m` },
  { key: 'avg_dist_stop_m', label: 'Avg Jarak Halte (m)', color: '#2563eb', formatter: (v: number) => `${Math.round(v)} m` },
  { key: 'avg_resto', label: 'Avg Restoran', color: '#d97706', formatter: (v: number) => v.toFixed(2) },
  { key: 'avg_minimarket', label: 'Avg Minimarket', color: '#7c3aed', formatter: (v: number) => v.toFixed(2) },
] as const

const FEATURE_KEYS = [
  'latitude',
  'longitude',
  'semantic_score',
  'dist_to_hotel_m',
  'dist_to_stop_m',
  'resto_count',
  'minimarket_count',
] as const

const BAN_DESTINATION_BUTTON_CLASS =
  'inline-flex shrink-0 items-center justify-center rounded-lg border border-red-300 bg-red-50 text-red-600 shadow-sm transition-colors hover:border-red-400 hover:bg-red-100 hover:text-red-700 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-40'

const CLUSTER_SELECTION_DRAFT_KEY = 'clusterSelectionDraft'

type InterpretationTextSegment = {
  text: string
  feature?: InterpretationFeatureKey | 'cluster'
}

function getInterpretationLabels(cluster: ClusterItem) {
  const avgSemantic = Number(cluster.summary.avg_semantic_score || 0)
  const avgStop = Number(cluster.summary.avg_dist_to_stop_m || 0)
  const avgResto = Number(cluster.summary.avg_resto_count || 0)
  const dominantCategory = cluster.summary.dominant_category || 'umum'

  const relevanceLabel = avgSemantic >= 0.75 ? 'sangat relevan' : avgSemantic >= 0.5 ? 'relevan' : 'eksploratif'
  const mobilityLabel =
    avgStop <= 350
      ? 'akses transportasi sangat dekat'
      : avgStop <= 700
        ? 'akses transportasi cukup dekat'
        : 'akses transportasi relatif jauh'
  const facilityLabel =
    avgResto >= 12 ? 'fasilitas makan padat' : avgResto >= 6 ? 'fasilitas makan cukup' : 'fasilitas makan terbatas'

  return { relevanceLabel, mobilityLabel, facilityLabel, dominantCategory }
}

function interpretClusterForUser(cluster: ClusterItem): { label: string; detail: string } {
  const { relevanceLabel, mobilityLabel, facilityLabel, dominantCategory } = getInterpretationLabels(cluster)
  const dominant = dominantCategory.toLowerCase()

  return {
    label: `Cluster ${dominant} - ${relevanceLabel}`,
    detail: `Kelompok ini cenderung ${relevanceLabel}, dengan ${mobilityLabel}, dan ${facilityLabel}. Cocok untuk pengguna yang mencari destinasi bertema ${dominantCategory}.`,
  }
}

function getClusterInterpretationParagraphSegments(
  cluster: ClusterItem,
  clusterId: string,
  parsed: number,
  ranks: Record<InterpretationFeatureKey, Record<string, number>>,
): InterpretationTextSegment[] {
  const { relevanceLabel, mobilityLabel, facilityLabel, dominantCategory } = getInterpretationLabels(cluster)
  const distHotelRank = ranks.dist_hotel[clusterId] ?? parsed + 1
  const distStopRank = ranks.dist_stop[clusterId] ?? parsed + 1
  const restoRank = ranks.resto[clusterId] ?? parsed + 1
  const minimarketRank = ranks.minimarket[clusterId] ?? parsed + 1

  const hotelPhrase = distHotelRank <= 3 ? 'relatif dekat hotel' : 'bervariasi jaraknya dari hotel'
  const stopPhrase = distStopRank <= 3 ? 'akses halte yang baik' : 'akses halte yang cukup'
  const supportPhrase =
    restoRank <= 3 || minimarketRank <= 3 ? 'fasilitas pendukung yang kuat' : 'fasilitas pendukung standar'

  return [
    { text: `Cluster ini berisi ${cluster.summary.member_count} destinasi bertema ` },
    { text: dominantCategory, feature: 'cluster' },
    { text: '. Cocok untuk pengguna yang mencari lokasi ' },
    { text: hotelPhrase, feature: 'dist_hotel' },
    { text: ', dengan ' },
    { text: stopPhrase, feature: 'dist_stop' },
    { text: ', serta ' },
    { text: supportPhrase, feature: 'minimarket' },
    { text: '. Kelompok ini cenderung ' },
    { text: relevanceLabel, feature: 'semantic' },
    { text: ', dengan ' },
    { text: mobilityLabel, feature: 'dist_stop' },
    { text: ', dan ' },
    { text: facilityLabel, feature: 'resto' },
    { text: '. Cocok untuk pengguna yang mencari destinasi bertema ' },
    { text: dominantCategory, feature: 'cluster' },
    { text: '.' },
  ]
}

function interpretationFeatureTextClass(key: InterpretationFeatureKey): string {
  return INTERPRETATION_FEATURE_UI.find((item) => item.key === key)?.iconClass ?? 'text-foreground'
}

function InterpretationColoredText({
  segments,
  clusterColor,
}: {
  segments: InterpretationTextSegment[]
  clusterColor?: string
}) {
  return (
    <>
      {segments.map((segment, index) => {
        if (!segment.feature) {
          return <span key={`interp-seg-${index}`}>{segment.text}</span>
        }
        if (segment.feature === 'cluster') {
          return (
            <span key={`interp-seg-${index}`} className="font-semibold" style={{ color: clusterColor }}>
              {segment.text}
            </span>
          )
        }
        return (
          <span
            key={`interp-seg-${index}`}
            className={`font-semibold ${interpretationFeatureTextClass(segment.feature)}`}
          >
            {segment.text}
          </span>
        )
      })}
    </>
  )
}

/** Untuk menghindari menyimpan/restorasi pemilihan antar jalur clustering yang berbeda. */
function clusterFingerprint(parsed: ClusterResponse): string {
  const ids = Object.values(parsed.clusters)
    .flatMap((c) => c.pois.map((p) => p.poi_id))
    .sort((a, b) => a - b)
  return ids.join(',')
}

/** Satukan POI tersimpan ke dalam cluster aktual — selalu pakai canonical dari `parsed` jika id cocok. */
function mergeSavedSelectionsIntoEmpty(
  parsed: ClusterResponse,
  saved: Record<string, unknown>,
  emptySelections: Record<string, EnrichedPOI[]>,
): Record<string, EnrichedPOI[]> {
  const out: Record<string, EnrichedPOI[]> = { ...emptySelections }
  Object.keys(parsed.clusters).forEach((cid) => {
    const valid = new Set(parsed.clusters[cid].pois.map((p) => p.poi_id))
    const raw = saved[cid]
    if (!Array.isArray(raw)) return
    const next: EnrichedPOI[] = []
    raw.forEach((item) => {
      if (!item || typeof item !== 'object' || !('poi_id' in item)) return
      const id = Number((item as EnrichedPOI).poi_id)
      if (!valid.has(id)) return
      const canonical = parsed.clusters[cid].pois.find((p) => p.poi_id === id)
      if (canonical) next.push(canonical)
    })
    out[cid] = next
  })
  return out
}

function clampAssignmentsToSelectionsAndDays(
  assignments: unknown,
  selections: Record<string, EnrichedPOI[]>,
  plannedDaysNum: number,
): Record<number, number> {
  const validIds = new Set<number>()
  Object.values(selections).forEach((arr) => arr.forEach((p) => validIds.add(p.poi_id)))
  const out: Record<number, number> = {}
  if (!assignments || typeof assignments !== 'object') return out
  Object.entries(assignments as Record<string, number>).forEach(([pid, day]) => {
    const id = Number(pid)
    if (!validIds.has(id)) return
    out[id] = Math.max(1, Math.min(plannedDaysNum, Math.round(Number(day)) || 1))
  })
  return out
}

function distanceSquared(a: number[], b: number[]) {
  let sum = 0
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i] - b[i]
    sum += d * d
  }
  return sum
}

function applyDaySidebarOrder(raw: EnrichedPOI[], sequence: number[] | undefined): EnrichedPOI[] {
  if (!raw.length) return []
  const byId = new Map(raw.map((p) => [p.poi_id, p]))
  const ordered: EnrichedPOI[] = []
  const seen = new Set<number>()
  const seq = sequence ?? []
  for (const id of seq) {
    const p = byId.get(id)
    if (p && !seen.has(id)) {
      ordered.push(p)
      seen.add(id)
    }
  }
  const rest = raw.filter((p) => !seen.has(p.poi_id)).sort((a, b) => a.name.localeCompare(b.name))
  return [...ordered, ...rest]
}

function SidebarDayDestinationCompact({ poi, accent }: { poi: EnrichedPOI; accent: string }) {
  const km = poi.dist_to_hotel_m / 1000
  return (
    <div className="flex w-full min-w-0 gap-2">
      <div
        className="mt-0.5 w-1 shrink-0 self-stretch min-h-[2.25rem] rounded-full"
        style={{ backgroundColor: accent }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-left text-[11px] font-semibold leading-snug text-foreground line-clamp-2">{poi.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-muted-foreground">
          <span className="inline-flex items-center gap-0.5">
            <MapPin className="h-3 w-3 shrink-0" style={{ color: accent }} aria-hidden />
            <span className="tabular-nums">{km.toFixed(2)} km hotel</span>
          </span>
          <span className="inline-flex items-center gap-0.5">
            <Bus className="h-3 w-3 shrink-0 text-blue-500" aria-hidden />
            <span className="tabular-nums">{Math.round(poi.dist_to_stop_m)}m halte</span>
          </span>
          <span className="inline-flex items-center gap-0.5">
            <UtensilsCrossed className="h-3 w-3 shrink-0 text-orange-400" aria-hidden />
            <span className="tabular-nums">{poi.resto_count} resto</span>
          </span>
          <span className="inline-flex items-center gap-0.5">
            <ShoppingBag className="h-3 w-3 shrink-0 text-green-600" aria-hidden />
            <span className="tabular-nums">{poi.minimarket_count} mini</span>
          </span>
          <span
            className="rounded px-1.5 py-0.5 font-bold tabular-nums"
            style={{ backgroundColor: `${accent}29`, color: accent }}
          >
            sem {poi.semantic_score.toFixed(3)}
          </span>
        </div>
      </div>
    </div>
  )
}

function DayItinerarySidebarPanel({
  plannedDays,
  grouped,
  className = '',
  footer,
  poiIdToClusterIdx,
  generationMode,
  onReorderSidebar,
  onRemoveSelected,
  onClearDay,
  onOpenWideView,
  hideWideViewButton,
  spreadDaysLayout,
  daysLayout = 'stack',
  destinationVariant = 'compact',
  poiIdToClusterId,
  poiDayAssignments,
  onAssignPoiToDay,
  onTogglePoi,
  isPoiSelected,
}: {
  plannedDays: number
  grouped: Record<number, EnrichedPOI[]>
  className?: string
  footer?: ReactNode
  poiIdToClusterIdx: Map<number, number>
  generationMode: GenerationMode
  onReorderSidebar: (
    payload:
      | { type: 'reorder'; day: number; fromIndex: number; toIndex: number }
      | { type: 'move'; poiId: number; fromDay: number; toDay: number; toIndex: number },
  ) => void
  onRemoveSelected?: (poiId: number) => void
  onClearDay?: (day: number) => void
  onOpenWideView?: () => void
  hideWideViewButton?: boolean
  spreadDaysLayout?: boolean
  daysLayout?: 'stack' | 'row'
  destinationVariant?: 'compact' | 'picker'
  poiIdToClusterId?: Map<number, string>
  poiDayAssignments?: Record<number, number>
  onAssignPoiToDay?: (clusterId: string, poi: EnrichedPOI, day: number) => void
  onTogglePoi?: (clusterId: string, poi: EnrichedPOI) => void
  isPoiSelected?: (clusterId: string, poiId: number) => boolean
}) {
  const MIME = 'application/x-cluster-sidebar-poi'
  const showWideBtn = Boolean(onOpenWideView) && !hideWideViewButton
  const usePickerCards = destinationVariant === 'picker'
  const dndLocked = usePickerCards

  const daysContainerClass =
    daysLayout === 'row'
      ? 'flex flex-row items-start gap-3 overflow-x-auto pb-1'
      : spreadDaysLayout
        ? 'grid gap-3 sm:grid-cols-2'
        : 'space-y-3'

  const dayColumnClass =
    daysLayout === 'row'
      ? 'min-w-[min(100%,240px)] flex-1 overflow-hidden rounded-lg border border-border bg-card shadow-sm'
      : 'overflow-hidden rounded-lg border border-border bg-card shadow-sm'

  return (
    <div className={`surface-card rounded-xl border border-border p-4 shadow-sm ${className}`.trim()}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <h3 className="text-sm font-bold text-foreground">Ringkasan per hari</h3>
        </div>
        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
          {showWideBtn ? (
            <button
              type="button"
              onClick={onOpenWideView}
              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
              title="Tampilan ringkasan lebar"
              aria-label="Tampilan ringkasan lebar"
            >
              <Maximize2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            </button>
          ) : null}
          {footer}
        </div>
      </div>
      <div className={daysContainerClass}>
        {Array.from({ length: plannedDays }, (_, i) => i + 1).map((day) => {
          const stripeColor = CLUSTER_COLORS[(day - 1) % CLUSTER_COLORS.length]
          const list = grouped[day] ?? []

          return (
            <div key={day} className={dayColumnClass}>
              <div
                className="flex items-center justify-between px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white"
                style={{ backgroundColor: stripeColor }}
              >
                <span>Hari {day}</span>
                {onClearDay && list.length > 0 ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onClearDay(day)
                    }}
                    className="inline-flex items-center justify-center rounded-md bg-white/20 px-2 py-1 text-[10px] font-semibold tracking-wide text-white transition-colors hover:bg-white/30"
                    aria-label={`Hapus semua destinasi hari ${day}`}
                    title="Hapus semua"
                  >
                    Hapus semua
                  </button>
                ) : null}
              </div>
              <div
                className="max-h-[min(520px,65vh)] overflow-y-auto p-2"
                role="list"
                onDragOver={(e) => {
                  if (dndLocked) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                }}
                onDrop={(e) => {
                  if (dndLocked) return
                  e.preventDefault()
                  const raw = e.dataTransfer.getData(MIME)
                  if (!raw) return
                  try {
                    const { poiId, fromDay } = JSON.parse(raw) as { poiId: number; fromDay: number }
                    if (!Number.isFinite(poiId)) return
                    if (fromDay === day) {
                      const fromIndex = list.findIndex((x) => x.poi_id === poiId)
                      const toIndex = Math.max(list.length - 1, 0)
                      if (fromIndex !== -1 && list.length > 1 && fromIndex !== toIndex) {
                        onReorderSidebar({ type: 'reorder', day, fromIndex, toIndex })
                      }
                      return
                    }
                    onReorderSidebar({
                      type: 'move',
                      poiId,
                      fromDay,
                      toDay: day,
                      toIndex: list.length,
                    })
                  } catch {
                    /* noop */
                  }
                }}
              >
                {list.length === 0 ? (
                  <p className="py-6 text-center text-xs italic text-muted-foreground leading-relaxed">
                    {usePickerCards
                      ? 'Belum ada destinasi. Pilih dari peta atau tab Pilih Destinasi.'
                      : 'Seret destinasi dari hari lain ke sini untuk memindahkan hari.'}
                  </p>
                ) : usePickerCards ? (
                  <div className="flex flex-col gap-2">
                    {list.map((p, idx) => {
                      const clusterId = poiIdToClusterId?.get(p.poi_id) ?? ''
                      const cidx = poiIdToClusterIdx.get(p.poi_id) ?? 0
                      const accent = CLUSTER_COLORS[cidx % CLUSTER_COLORS.length]
                      const selected = clusterId ? (isPoiSelected?.(clusterId, p.poi_id) ?? false) : false
                      const assignedDay = poiDayAssignments?.[p.poi_id]
                      return (
                        <div
                          key={p.poi_id}
                          className={`flex flex-col overflow-hidden rounded-xl border-2 transition-all ${
                            selected
                              ? 'border-primary bg-primary/5 shadow-sm ring-2 ring-primary/25'
                              : 'border-border hover:border-border/70 hover:bg-muted/20'
                          }`}
                        >
                          <DestinationItineraryCard
                            poi={p}
                            accentColor={accent}
                            orderBadge={idx + 1}
                            distanceMode="from_hotel"
                            primaryDistanceKm={p.dist_to_hotel_m / 1000}
                            className="rounded-none border-0 shadow-none"
                          />
                          <div className="border-t border-border bg-muted/30 px-2.5 py-2">
                            <div className="flex items-center justify-center gap-1.5">
                              <select
                                value={selected && assignedDay ? String(assignedDay) : ''}
                                disabled={!clusterId}
                                onChange={(e) => {
                                  if (!clusterId || !onAssignPoiToDay) return
                                  const val = e.target.value
                                  if (!val) return
                                  onAssignPoiToDay(clusterId, p, Number(val))
                                }}
                                aria-label={`Pilih hari untuk ${p.name}`}
                                className={`min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-[10px] font-semibold focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-40 ${
                                  selected && assignedDay
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border bg-background text-muted-foreground'
                                }`}
                              >
                                <option value="" disabled>
                                  Pilih hari
                                </option>
                                {Array.from({ length: plannedDays }, (_, i) => i + 1).map((d) => (
                                  <option key={`summary-day-${p.poi_id}-${d}`} value={d}>
                                    Hari {d}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                disabled={!selected || !clusterId}
                                onClick={() => {
                                  if (selected && clusterId && onTogglePoi) {
                                    onTogglePoi(clusterId, p)
                                  }
                                }}
                                title="Batalkan pilihan"
                                aria-label={`Batalkan pilihan ${p.name}`}
                                className={`h-8 w-8 ${BAN_DESTINATION_BUTTON_CLASS}`}
                              >
                                <Ban className="h-3.5 w-3.5 text-red-600" aria-hidden />
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {list.map((p, idx) => {
                      const cidx = poiIdToClusterIdx.get(p.poi_id) ?? 0
                      const accent = CLUSTER_COLORS[cidx % CLUSTER_COLORS.length]
                      return (
                        <div
                          key={p.poi_id}
                          className="flex min-h-0 min-w-0 items-stretch overflow-hidden rounded-lg border-2 text-left shadow-sm outline-none ring-offset-background transition hover:opacity-[0.97]"
                          role="listitem"
                          style={{
                            borderColor: `${accent}b3`,
                            backgroundColor: `${accent}18`,
                          }}
                        >
                          <div
                            draggable={!dndLocked}
                            onDragStart={(e) => {
                              if (dndLocked) {
                                e.preventDefault()
                                return
                              }
                              e.dataTransfer.effectAllowed = 'move'
                              e.dataTransfer.setData(MIME, JSON.stringify({ poiId: p.poi_id, fromDay: day }))
                              e.dataTransfer.setData('text/plain', String(p.poi_id))
                            }}
                            onDragOver={(e) => {
                              if (dndLocked) return
                              e.preventDefault()
                              e.dataTransfer.dropEffect = 'move'
                            }}
                            onDrop={(e) => {
                              if (dndLocked) return
                              e.preventDefault()
                              e.stopPropagation()
                              const raw = e.dataTransfer.getData(MIME)
                              if (!raw) return
                              try {
                                const { poiId, fromDay } = JSON.parse(raw) as {
                                  poiId: number
                                  fromDay: number
                                }
                                const fromIndex = list.findIndex((x) => x.poi_id === poiId)
                                if (fromDay === day && poiId !== p.poi_id && fromIndex !== -1) {
                                  onReorderSidebar({ type: 'reorder', day, fromIndex, toIndex: idx })
                                } else if (fromDay !== day) {
                                  onReorderSidebar({
                                    type: 'move',
                                    poiId,
                                    fromDay,
                                    toDay: day,
                                    toIndex: idx,
                                  })
                                }
                              } catch {
                                /* noop */
                              }
                            }}
                            className={`min-w-0 flex-1 px-2 py-1.5 ${
                              dndLocked ? 'cursor-not-allowed opacity-75' : 'cursor-grab active:cursor-grabbing'
                            }`}
                            title={`Seret untuk mengatur urutan — ${p.name}`}
                          >
                            <SidebarDayDestinationCompact poi={p} accent={accent} />
                          </div>
                          {onRemoveSelected ? (
                            <button
                              type="button"
                              disabled={dndLocked}
                              onClick={(e) => {
                                e.stopPropagation()
                                onRemoveSelected(p.poi_id)
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                              className="flex shrink-0 items-center justify-center border-l px-2 text-red-600 transition-colors hover:bg-red-500/10 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                              style={{ borderColor: `${accent}55` }}
                              aria-label={`Hapus ${p.name} dari pilihan`}
                              title="Hapus dari pilihan"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </button>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function ClusterPage() {
  const router = useRouter()
  const [clusterData, setClusterData] = useState<ClusterResponse | null>(null)
  const [hotel, setHotel] = useState<HotelLocation | null>(null)
  const [selectedPOIs, setSelectedPOIs] = useState<Record<string, EnrichedPOI[]>>({})
  const [poiDayAssignments, setPoiDayAssignments] = useState<Record<number, number>>({})
  const [plannedDays, setPlannedDays] = useState(3)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<ActiveTab>('clusters')
  const [showDestinationMap, setShowDestinationMap] = useState(false)
  const [mapPoiModal, setMapPoiModal] = useState<{ clusterId: string; poi: EnrichedPOI } | null>(null)
  const [generationMode, setGenerationMode] = useState<GenerationMode>('auto')
  const [dailyDestinationLimit, setDailyDestinationLimit] = useState(DEFAULT_DESTINATIONS_PER_DAY)
  const [analysisMinK, setAnalysisMinK] = useState(1)
  const [analysisMaxK, setAnalysisMaxK] = useState(10)
  const [selectedOptimalK, setSelectedOptimalK] = useState(1)
  const [showBaselineComparisonTable, setShowBaselineComparisonTable] = useState(false)
  const [interpretationSortFeature, setInterpretationSortFeature] = useState<InterpretationFeatureKey>('semantic')
  const [expandedAnalysisClusterId, setExpandedAnalysisClusterId] = useState<string | null>(null)
  const [expandedZScoreClusterId, setExpandedZScoreClusterId] = useState<string | null>(null)
  const [assignmentTargetDay, setAssignmentTargetDay] = useState(1)
  const [sidebarDaySequences, setSidebarDaySequences] = useState<Record<number, number[]>>({})
  const [destinationListView, setDestinationListView] = useState<DestinationListView>('table')
  const [destinationPanelTab, setDestinationPanelTab] = useState<DestinationPanelTab>('picker')
  const [currentDestinationClusterId, setCurrentDestinationClusterId] = useState<string | null>(null)
  const lastAutoFillKeyRef = useRef('')

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const allowed = await enforcePageAccess(2, router)
      if (!allowed || cancelled) return

      const session = readStep1Session()
      if (!session) return

      const parsed = session.clusterData
      const rawHotel = session.hotelRaw
      const rawNumDays = session.numDaysRaw

      const days = rawNumDays
        ? Math.max(1, Math.min(MAX_PLANNED_TRIP_DAYS, Number(rawNumDays) || 3))
        : 3
    const rawDailyLimit = sessionStorage.getItem('dailyDestinationLimit')
    const parsedDailyLimit = rawDailyLimit ? Number(rawDailyLimit) : DEFAULT_DESTINATIONS_PER_DAY
    const safeDailyLimit = Number.isFinite(parsedDailyLimit)
      ? Math.max(1, Math.min(20, Math.round(parsedDailyLimit)))
      : DEFAULT_DESTINATIONS_PER_DAY
    setDailyDestinationLimit(safeDailyLimit)
    setPlannedDays(days)
    setClusterData(parsed)
    if (rawHotel) {
      try {
        setHotel(JSON.parse(rawHotel) as HotelLocation)
      } catch {
        /* skip hotel invalid */
      }
    }

    const emptySelections: Record<string, EnrichedPOI[]> = {}
    Object.keys(parsed.clusters).forEach((cid) => {
      emptySelections[cid] = []
    })

    const fp = clusterFingerprint(parsed)
    let nextSel: Record<string, EnrichedPOI[]> = { ...emptySelections }
    let nextAssignments: Record<number, number> = {}

    try {
      const draftRaw = sessionStorage.getItem(CLUSTER_SELECTION_DRAFT_KEY)
      if (draftRaw) {
        const draft = JSON.parse(draftRaw) as {
          fingerprint?: string
          selectedPOIs?: Record<string, unknown>
          poiDayAssignments?: Record<number, number>
          sidebarDaySequences?: Record<string, unknown>
        }
        if (draft.fingerprint === fp) {
          if (draft.selectedPOIs && typeof draft.selectedPOIs === 'object') {
            nextSel = mergeSavedSelectionsIntoEmpty(parsed, draft.selectedPOIs, emptySelections)
            nextAssignments = clampAssignmentsToSelectionsAndDays(draft.poiDayAssignments, nextSel, days)
          }
          if (draft.sidebarDaySequences && typeof draft.sidebarDaySequences === 'object') {
            const norm: Record<number, number[]> = {}
            for (let d = 1; d <= days; d += 1) {
              const rawSeq = draft.sidebarDaySequences[String(d)]
              if (Array.isArray(rawSeq)) {
                norm[d] = rawSeq.map((x) => Number(x)).filter((id) => Number.isFinite(id))
              }
            }
            setSidebarDaySequences(norm)
          }
        }
      }
    } catch {
      nextSel = { ...emptySelections }
      nextAssignments = {}
    }

    const anyRestoredDraft =
      Object.values(nextSel).some((arr) => arr.length > 0) || Object.keys(nextAssignments).length > 0

    if (!anyRestoredDraft) {
      try {
        const rawSelOnly = sessionStorage.getItem('selectedPOIs')
        if (rawSelOnly) {
          const saved = JSON.parse(rawSelOnly) as Record<string, unknown>
          nextSel = mergeSavedSelectionsIntoEmpty(parsed, saved, emptySelections)
        }
      } catch {
        nextSel = { ...emptySelections }
      }
      try {
        const rawAssignOnly = sessionStorage.getItem('poiDayAssignments')
        if (rawAssignOnly) {
          const assignments = JSON.parse(rawAssignOnly) as Record<number, number>
          nextAssignments = clampAssignmentsToSelectionsAndDays(assignments, nextSel, days)
        }
      } catch {
        /* keep nextAssignments dari draft atau {} */
      }
    }

    setSelectedPOIs(nextSel)
    setPoiDayAssignments(nextAssignments)

    const clusterIdsSorted = Object.keys(parsed.clusters).sort((a, b) => Number(a) - Number(b))

    const rawGenerationMode = sessionStorage.getItem('generationMode')
    if (rawGenerationMode === 'manual' || rawGenerationMode === 'auto') {
      setGenerationMode(rawGenerationMode)
    }
    const parsedKRange = Array.isArray(parsed.k_analysis?.k_range)
      ? parsed.k_analysis.k_range.filter((k) => Number.isFinite(k))
      : []
    const minKFromData = parsedKRange.length > 0 ? Math.max(1, Math.min(...parsedKRange)) : 1
    const maxKFromData = parsedKRange.length > 0 ? Math.max(...parsedKRange) : Math.max(1, clusterIdsSorted.length)
    const safeMax = Math.max(minKFromData, maxKFromData)
    const safeOptimal = Math.max(minKFromData, Math.min(parsed.evaluation?.k_optimal ?? minKFromData, safeMax))
    setAnalysisMinK(minKFromData)
    setAnalysisMaxK(safeMax)
    setSelectedOptimalK(safeOptimal)
    })()

    return () => {
      cancelled = true
    }
  }, [router])

  useEffect(() => {
    if (!clusterData) return
    const fp = clusterFingerprint(clusterData)
    try {
      sessionStorage.setItem(
        CLUSTER_SELECTION_DRAFT_KEY,
        JSON.stringify({
          fingerprint: fp,
          selectedPOIs,
          poiDayAssignments,
          sidebarDaySequences,
        }),
      )
    } catch {
      /* kuota / mode privat */
    }
  }, [clusterData, selectedPOIs, poiDayAssignments, sidebarDaySequences])

  useEffect(() => {
    setSidebarDaySequences((prev) => {
      const next: Record<number, number[]> = {}
      for (let d = 1; d <= plannedDays; d += 1) {
        next[d] = prev[d] ?? []
      }
      return next
    })
  }, [plannedDays])

  useEffect(() => {
    setPoiDayAssignments((prev) => {
      const next: Record<number, number> = {}
      Object.entries(prev).forEach(([poiId, day]) => {
        next[Number(poiId)] = Math.max(1, Math.min(plannedDays, day))
      })
      return next
    })
  }, [plannedDays])

  useEffect(() => {
    setAssignmentTargetDay((d) => Math.max(1, Math.min(d, plannedDays)))
  }, [plannedDays])

  const handleSidebarReorder = useCallback(
    (
      payload:
        | { type: 'reorder'; day: number; fromIndex: number; toIndex: number }
        | { type: 'move'; poiId: number; fromDay: number; toDay: number; toIndex: number },
    ) => {
      if (payload.type === 'reorder') {
        setSidebarDaySequences((prev) => {
          const row = [...(prev[payload.day] ?? [])]
          let { fromIndex, toIndex } = payload
          if (
            fromIndex === toIndex ||
            fromIndex < 0 ||
            fromIndex >= row.length ||
            toIndex < 0 ||
            toIndex > row.length
          ) {
            return prev
          }
          const [moved] = row.splice(fromIndex, 1)
          let insertAt = toIndex
          if (fromIndex < toIndex) insertAt -= 1
          insertAt = Math.max(0, Math.min(insertAt, row.length))
          row.splice(insertAt, 0, moved)
          return { ...prev, [payload.day]: row }
        })
        return
      }
      const { poiId, fromDay: _fromDay, toDay, toIndex } = payload
      setPoiDayAssignments((a) => ({ ...a, [poiId]: toDay }))
      setSidebarDaySequences((prev) => {
        const next: Record<number, number[]> = {}
        for (let d = 1; d <= plannedDays; d += 1) {
          next[d] = [...(prev[d] ?? [])].filter((id) => id !== poiId)
        }
        const dest = [...(next[toDay] ?? [])]
        const clamped = Math.max(0, Math.min(toIndex, dest.length))
        dest.splice(clamped, 0, poiId)
        next[toDay] = dest
        return next
      })
    },
    [plannedDays],
  )

  const removeSidebarSelectedPoi = useCallback(
    (poiId: number) => {
    setSelectedPOIs((prev) => {
        const next: Record<string, EnrichedPOI[]> = {}
        Object.keys(prev).forEach((cid) => {
          next[cid] = (prev[cid] ?? []).filter((p) => p.poi_id !== poiId)
        })
        return next
      })
      setPoiDayAssignments((prev) => {
        const copy = { ...prev }
        delete copy[poiId]
        return copy
      })
      setSidebarDaySequences((prev) => {
        const next: Record<number, number[]> = {}
        for (let d = 1; d <= plannedDays; d += 1) {
          next[d] = [...(prev[d] ?? [])].filter((id) => id !== poiId)
        }
        return next
      })
    },
    [plannedDays],
  )

  const clearSelectedDay = useCallback(
    (day: number) => {
      const removeIds = new Set<number>([
        ...(sidebarDaySequences[day] ?? []),
        ...Object.entries(poiDayAssignments)
          .filter(([, assignedDay]) => assignedDay === day)
          .map(([poiId]) => Number(poiId)),
      ])
      if (removeIds.size === 0) return
      setSelectedPOIs((prev) => {
        const next: Record<string, EnrichedPOI[]> = {}
        Object.keys(prev).forEach((cid) => {
          next[cid] = (prev[cid] ?? []).filter((poi) => !removeIds.has(poi.poi_id))
        })
        return next
      })
      setPoiDayAssignments((prev) => {
        const next = { ...prev }
        removeIds.forEach((id) => {
          delete next[id]
        })
        return next
      })
      setSidebarDaySequences((prev) => {
        const next: Record<number, number[]> = {}
        for (let d = 1; d <= plannedDays; d += 1) {
          next[d] = d === day ? [] : [...(prev[d] ?? [])].filter((id) => !removeIds.has(id))
        }
        return next
      })
    },
    [poiDayAssignments, sidebarDaySequences, plannedDays],
  )

  const togglePOI = (clusterId: string, poi: EnrichedPOI) => {
    const current = selectedPOIs[clusterId] || []
      const exists = current.some((p) => p.poi_id === poi.poi_id)
      if (exists) {
      setSelectedPOIs((prev) => ({
        ...prev,
        [clusterId]: current.filter((p) => p.poi_id !== poi.poi_id),
      }))
        setPoiDayAssignments((old) => {
          const next = { ...old }
          delete next[poi.poi_id]
          return next
        })
      setSidebarDaySequences((prev) => {
        const next = { ...prev }
        for (let d = 1; d <= plannedDays; d += 1) {
          next[d] = [...(next[d] ?? [])].filter((id) => id !== poi.poi_id)
        }
        return next
      })
      } else {
      const dayPick = Math.min(poiDayAssignments[poi.poi_id] ?? assignmentTargetDay, plannedDays)
      setSelectedPOIs((prev) => ({
        ...prev,
        [clusterId]: [...current, poi],
      }))
        setPoiDayAssignments((old) => ({
          ...old,
        [poi.poi_id]: old[poi.poi_id] ?? dayPick,
      }))
      setSidebarDaySequences((prev) => {
        const next: Record<number, number[]> = { ...prev }
        for (let d = 1; d <= plannedDays; d += 1) {
          next[d] = [...(next[d] ?? [])].filter((id) => id !== poi.poi_id)
        }
        const row = [...(next[dayPick] ?? [])]
        if (!row.includes(poi.poi_id)) row.push(poi.poi_id)
        next[dayPick] = row
        return next
      })
    }
  }

  const toggleAllInCluster = (clusterId: string, pois: EnrichedPOI[]) => {
    const current = selectedPOIs[clusterId] || []
      const allSelected = current.length === pois.length
    const dayPick = Math.min(assignmentTargetDay, plannedDays)
      if (allSelected) {
      setSelectedPOIs((prev) => ({ ...prev, [clusterId]: [] }))
        setPoiDayAssignments((old) => {
          const next = { ...old }
          pois.forEach((p) => delete next[p.poi_id])
          return next
        })
      setSidebarDaySequences((prev) => {
        const next = { ...prev }
          pois.forEach((p) => {
          for (let d = 1; d <= plannedDays; d += 1) {
            next[d] = [...(next[d] ?? [])].filter((id) => id !== p.poi_id)
          }
          })
          return next
        })
    } else {
      const nextAssign = { ...poiDayAssignments }
      pois.forEach((p) => {
        if (!nextAssign[p.poi_id]) nextAssign[p.poi_id] = dayPick
      })
      setSelectedPOIs((prev) => ({ ...prev, [clusterId]: [...pois] }))
      setPoiDayAssignments(nextAssign)
      setSidebarDaySequences((prev) => {
        const nextSeq: Record<number, number[]> = { ...prev }
        pois.forEach((p) => {
          for (let d = 1; d <= plannedDays; d += 1) {
            nextSeq[d] = [...(nextSeq[d] ?? [])].filter((id) => id !== p.poi_id)
          }
        })
        pois.forEach((p) => {
          const d = Math.max(1, Math.min(plannedDays, nextAssign[p.poi_id]))
          const row = [...(nextSeq[d] ?? [])]
          if (!row.includes(p.poi_id)) row.push(p.poi_id)
          nextSeq[d] = row
        })
        return nextSeq
      })
    }
  }

  const addPoiWithDay = (clusterId: string, poi: EnrichedPOI, day: number) => {
    const safeDay = Math.max(1, Math.min(plannedDays, day))
    setSelectedPOIs((prev) => {
      const curr = prev[clusterId] || []
      if (curr.some((p) => p.poi_id === poi.poi_id)) return prev
      return { ...prev, [clusterId]: [...curr, poi] }
    })
    setPoiDayAssignments((prev) => ({ ...prev, [poi.poi_id]: safeDay }))
    setSidebarDaySequences((prev) => {
      const next: Record<number, number[]> = { ...prev }
      for (let d = 1; d <= plannedDays; d += 1) {
        next[d] = [...(next[d] ?? [])].filter((id) => id !== poi.poi_id)
      }
      const row = [...(next[safeDay] ?? [])]
      if (!row.includes(poi.poi_id)) row.push(poi.poi_id)
      next[safeDay] = row
      return next
    })
  }

  const assignPoiToDay = (clusterId: string, poi: EnrichedPOI, day: number) => {
    const safeDay = Math.max(1, Math.min(plannedDays, day))
    const selected = (selectedPOIs[clusterId] || []).some((p) => p.poi_id === poi.poi_id)
    if (!selected) {
      addPoiWithDay(clusterId, poi, safeDay)
      return
    }
    setPoiDayAssignments((prev) => ({ ...prev, [poi.poi_id]: safeDay }))
    setSidebarDaySequences((prev) => {
      const nextSeq: Record<number, number[]> = { ...prev }
      for (let d = 1; d <= plannedDays; d += 1) {
        nextSeq[d] = [...(nextSeq[d] ?? [])].filter((id) => id !== poi.poi_id)
      }
      const row = [...(nextSeq[safeDay] ?? [])]
      if (!row.includes(poi.poi_id)) row.push(poi.poi_id)
      nextSeq[safeDay] = row
      return nextSeq
    })
  }

  const goToDestinationCluster = (clusterId: string) => {
    setCurrentDestinationClusterId(clusterId)
    setActiveTab('destinations')
    setDestinationPanelTab('picker')
  }

  const handleSummaryMapPoiClick = (clusterId: string, poi: EnrichedPOI) => {
    setShowDestinationMap(false)
    setMapPoiModal({ clusterId, poi })
  }

  const isPOISelected = (clusterId: string, poiId: number) =>
    (selectedPOIs[clusterId] || []).some((p) => p.poi_id === poiId)

  const totalSelected = Object.values(selectedPOIs).reduce((s, arr) => s + arr.length, 0)
  const totalPOIs = clusterData
    ? Object.values(clusterData.clusters).reduce((s, c) => s + c.pois.length, 0)
    : 0

  const sourceClusters = clusterData?.clusters ?? {}

  const poiIdToClusterIdx = useMemo(() => {
    const m = new Map<number, number>()
    Object.entries(sourceClusters).forEach(([cid, c]) => {
      const n = parseInt(cid, 10)
      const ci = Number.isFinite(n) ? n % CLUSTER_COLORS.length : 0
      c.pois.forEach((p) => m.set(p.poi_id, ci))
    })
    return m
  }, [sourceClusters])

  const poiIdToClusterId = useMemo(() => {
    const m = new Map<number, string>()
    Object.entries(sourceClusters).forEach(([cid, c]) => {
      c.pois.forEach((p) => m.set(p.poi_id, cid))
    })
    return m
  }, [sourceClusters])

  const allPois = useMemo(
    () => Object.values(sourceClusters).flatMap((cluster) => cluster.pois),
    [sourceClusters],
  )
  const resolvedKBounds = useMemo(() => {
    const maxByData = Math.max(1, allPois.length)
    const minK = Math.max(1, Math.min(Math.round(analysisMinK) || 1, maxByData))
    const maxK = Math.max(minK, Math.min(Math.round(analysisMaxK) || minK, maxByData))
    return { minK, maxK, maxByData }
  }, [analysisMinK, analysisMaxK, allPois.length])

  const groupedSelectedByDay = useMemo(() => {
    const m: Record<number, EnrichedPOI[]> = {}
    for (let d = 1; d <= plannedDays; d += 1) m[d] = []
    Object.values(selectedPOIs)
      .flat()
      .forEach((poi) => {
        const d = Math.max(1, Math.min(plannedDays, poiDayAssignments[poi.poi_id] ?? 1))
        m[d].push(poi)
      })
    for (let d = 1; d <= plannedDays; d += 1) {
      m[d] = applyDaySidebarOrder(m[d], sidebarDaySequences[d])
    }
    return m
  }, [selectedPOIs, poiDayAssignments, plannedDays, sidebarDaySequences])

  const handleCreateItinerary = async () => {
    if (!hotel || !clusterData) return
    if (generationMode === 'manual' && totalSelected === 0) return
    const itineraryClusterData: ClusterResponse = {
      status: clusterData.status,
      message: clusterData.message,
      clusters: analysisResult.clusters,
      baseline_evaluation: clusterData.baseline_evaluation,
      k_analysis: clusterData.k_analysis,
      evaluation: {
        silhouette_score: analysisResult.metrics.silhouette,
        davies_bouldin_index: analysisResult.metrics.dbi,
        wcss: analysisResult.metrics.wcss,
        k_optimal: analysisResult.metrics.k,
        iterations: analysisResult.metrics.iterations,
      },
    }
    setLoading(true)
    try {
      const allRoutes: Record<string, unknown> = {}
      const effectiveSelectedPOIs: Record<string, EnrichedPOI[]> = selectedPOIs
      const effectiveAssignments: Record<number, number> = poiDayAssignments

      for (let day = 1; day <= plannedDays; day += 1) {
        const ordered = groupedSelectedByDay[day] ?? []
        if (ordered.length > 0) {
          const route = await optimizeRoute(ordered, hotel.lat, hotel.lon, day)
          allRoutes[String(day - 1)] = route
        }
      }
      if (Object.keys(allRoutes).length === 0) {
        const Swal = (await import('sweetalert2')).default
        await Swal.fire({
          icon: 'warning',
          title: 'Belum ada destinasi',
          text: 'Pilih minimal satu destinasi sebelum membuat itinerary.',
          confirmButtonText: 'OK',
          confirmButtonColor: '#22c55e',
        })
        return
      }

      const sessionUser = getClientSession()
      if (sessionUser?.role === 'user') {
        const searchQuery = (sessionStorage.getItem('searchQuery') || '').trim() || 'Tanpa query'
        const topKRaw = sessionStorage.getItem('topK')
        const topKParsed = topKRaw ? Number(topKRaw) : NaN
        const topK = Number.isFinite(topKParsed) ? topKParsed : null
        const hotelName = (sessionStorage.getItem('hotelName') || '').trim() || 'Tidak diketahui'
        const silhouette = Number(analysisResult.metrics.silhouette)
        const dbi = Number(analysisResult.metrics.dbi)
        const precision = Math.max(0, Math.min(1, silhouette))
        const recall = Math.max(0, Math.min(1, 1 / (1 + Math.max(0, dbi))))
        const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
        const selectedNames = Array.from(
          new Set(
            Object.values(groupedSelectedByDay)
              .flat()
              .map((poi) => poi.name.trim())
              .filter(Boolean),
          ),
        )
        const filteredDestinations = allPois.map((poi) => ({
          poi_id: poi.poi_id,
          name: poi.name,
          category: poi.category,
          latitude: poi.latitude,
          longitude: poi.longitude,
          semantic_score: poi.semantic_score,
          dist_to_hotel_m: poi.dist_to_hotel_m,
          dist_to_stop_m: poi.dist_to_stop_m,
          resto_count: poi.resto_count,
          minimarket_count: poi.minimarket_count,
          cluster_id: poiIdToClusterId.get(poi.poi_id) ?? '',
        }))
        const selectionByDay = Array.from({ length: plannedDays }, (_, idx) => {
          const day = idx + 1
          const pois = groupedSelectedByDay[day] ?? []
          return {
            day,
            poi_names: pois.map((p) => p.name),
            poi_ids: pois.map((p) => p.poi_id),
            destinations: pois.map((p) => ({
              poi_id: p.poi_id,
              name: p.name,
              category: p.category,
            })),
          }
        })
        const routesForHistory: Record<string, unknown> = {}
        Object.entries(allRoutes).forEach(([dayKey, route]) => {
          const r = route as DayRoute
          routesForHistory[dayKey] = {
            day: r.day,
            total_distance_km: r.total_distance_km,
            total_distance_m: r.total_distance_m,
            ordered_route: (r.ordered_route ?? []).map((stop) => ({
              order: stop.order,
              poi_id: stop.poi_id,
              name: stop.name,
              distance_from_prev_km: stop.distance_from_prev_km,
              distance_from_prev_m: stop.distance_from_prev_m,
            })),
          }
        })

        try {
          await saveClusterHistory({
            user_email: sessionUser.email,
            query_text: searchQuery,
            num_days: plannedDays,
            total_pois: filteredDestinations.length,
            k_optimal: Number(analysisResult.metrics.k),
            silhouette_score: silhouette,
            davies_bouldin_index: dbi,
            wcss: Number(analysisResult.metrics.wcss),
            precision_score: Number(precision.toFixed(4)),
            recall_score: Number(recall.toFixed(4)),
            f1_score: Number(f1.toFixed(4)),
            selected_destinations: selectedNames,
            hotel_name: hotelName,
            hotel_lat: hotel.lat,
            hotel_lon: hotel.lon,
            top_k: topK,
            generation_mode: generationMode,
            daily_destination_limit: dailyDestinationLimit,
            filtered_destinations: filteredDestinations,
            analysis: {
              metrics: analysisResult.metrics,
              k_metrics: analysisResult.kMetrics,
              baseline_k_metrics: analysisResult.baselineKMetrics,
              k_analysis: clusterData.k_analysis,
              baseline_evaluation: clusterData.baseline_evaluation,
              analysis_min_k: analysisMinK,
              analysis_max_k: analysisMaxK,
              selected_optimal_k: selectedOptimalK,
              zscore_rows: analysisResult.zscoreRows,
              zscore_details: analysisResult.zscoreDetails,
            },
            selection: {
              generation_mode: generationMode,
              daily_destination_limit: dailyDestinationLimit,
              by_day: selectionByDay,
            },
            routes: routesForHistory,
          })
        } catch {
          /* jangan blokir alur itinerary */
        }
      }

      sessionStorage.setItem('routeData', JSON.stringify(allRoutes))
      sessionStorage.setItem('selectedPOIs', JSON.stringify(effectiveSelectedPOIs))
      sessionStorage.setItem('poiDayAssignments', JSON.stringify(effectiveAssignments))
      sessionStorage.setItem('generationMode', generationMode)
      sessionStorage.setItem('clusterData', JSON.stringify(itineraryClusterData))
      router.push('/itinerary')
    } catch (err) {
      const Swal = (await import('sweetalert2')).default
      await Swal.fire({
        icon: 'error',
        title: 'Gagal membuat itinerary',
        text:
          err instanceof Error
            ? err.message
            : 'Routing OSRM tidak tersedia. Periksa koneksi internet lalu coba lagi.',
        confirmButtonText: 'OK',
        confirmButtonColor: '#22c55e',
      })
    } finally {
      setLoading(false)
    }
  }

  const itinerarySidebarFooter = (
    <button
      type="button"
      onClick={handleCreateItinerary}
      disabled={(generationMode === 'manual' && totalSelected === 0) || loading}
      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
    >
      Buat Itinerary
      <ArrowRight className="h-4 w-4 shrink-0" />
    </button>
  )

  const analysisResult = useMemo(() => {
    const { minK, maxK } = resolvedKBounds
    if (allPois.length === 0) {
      return {
        clusters: {},
        comparisonClusters: {},
        zscoreRows: [] as ZScoreRow[],
        zscoreDetails: {} as Record<string, ZScoreDetailRow[]>,
        metrics: { k: minK, wcss: 0, silhouette: 0, dbi: 0, iterations: 0 },
        kMetrics: [] as Array<{ k: number; wcss: number; silhouette: number; dbi: number; iterations: number }>,
        baselineKMetrics: [] as Array<{ k: number; wcss: number; silhouette: number; dbi: number; iterations: number }>,
      }
    }
    const vectors = allPois.map((poi) => [
      poi.latitude,
      poi.longitude,
      poi.semantic_score,
      poi.dist_to_hotel_m,
      poi.dist_to_stop_m,
      poi.resto_count,
      poi.minimarket_count,
    ])

    const means = FEATURE_KEYS.map((_, idx) => vectors.reduce((acc, row) => acc + row[idx], 0) / vectors.length)
    const stds = FEATURE_KEYS.map((_, idx) => {
      const variance = vectors.reduce((acc, row) => {
        const d = row[idx] - means[idx]
        return acc + d * d
      }, 0) / vectors.length
      const std = Math.sqrt(variance)
      return std > 1e-9 ? std : 1
    })

    const zVectors = vectors.map((row) => row.map((value, idx) => (value - means[idx]) / stds[idx]))

    const runKMeans = (kValue: number) => {
      const centroids = Array.from({ length: kValue }, (_, idx) => {
        const sourceIndex = Math.floor((idx * (zVectors.length - 1)) / Math.max(1, kValue - 1))
        return [...zVectors[sourceIndex]]
      })
      let assignments = Array(zVectors.length).fill(0)
      let iterations = 0
      for (let iteration = 0; iteration < 25; iteration += 1) {
        iterations = iteration + 1
        let changed = false
        assignments = zVectors.map((vec, currentIdx) => {
          let bestCluster = 0
          let bestDist = Number.POSITIVE_INFINITY
          for (let c = 0; c < kValue; c += 1) {
            const dist = distanceSquared(vec, centroids[c])
            if (dist < bestDist) {
              bestDist = dist
              bestCluster = c
            }
          }
          if (assignments[currentIdx] !== bestCluster) changed = true
          return bestCluster
        })

        const sums = Array.from({ length: kValue }, () => Array(FEATURE_KEYS.length).fill(0))
        const counts = Array(kValue).fill(0)
        assignments.forEach((clusterIdx, vecIdx) => {
          counts[clusterIdx] += 1
          for (let j = 0; j < FEATURE_KEYS.length; j += 1) {
            sums[clusterIdx][j] += zVectors[vecIdx][j]
          }
        })
        for (let c = 0; c < kValue; c += 1) {
          if (counts[c] === 0) continue
          for (let j = 0; j < FEATURE_KEYS.length; j += 1) {
            centroids[c][j] = sums[c][j] / counts[c]
          }
        }
        if (!changed) break
      }
      return { assignments, centroids, iterations }
    }

    const runKMeansBaseline = (kValue: number) => {
      const centroids = Array.from({ length: kValue }, (_, idx) => {
        const sourceIndex = (kValue * 37 + idx * 17) % zVectors.length
        return [...zVectors[sourceIndex]]
      })
      let assignments = Array(zVectors.length).fill(0)
      let iterations = 0
      for (let iteration = 0; iteration < 25; iteration += 1) {
        iterations = iteration + 1
        let changed = false
        assignments = zVectors.map((vec, currentIdx) => {
          let bestCluster = 0
          let bestDist = Number.POSITIVE_INFINITY
          for (let c = 0; c < kValue; c += 1) {
            const dist = distanceSquared(vec, centroids[c])
            if (dist < bestDist) {
              bestDist = dist
              bestCluster = c
            }
          }
          if (assignments[currentIdx] !== bestCluster) changed = true
          return bestCluster
        })

        const sums = Array.from({ length: kValue }, () => Array(FEATURE_KEYS.length).fill(0))
        const counts = Array(kValue).fill(0)
        assignments.forEach((clusterIdx, vecIdx) => {
          counts[clusterIdx] += 1
          for (let j = 0; j < FEATURE_KEYS.length; j += 1) {
            sums[clusterIdx][j] += zVectors[vecIdx][j]
          }
        })
        for (let c = 0; c < kValue; c += 1) {
          if (counts[c] === 0) continue
          for (let j = 0; j < FEATURE_KEYS.length; j += 1) {
            centroids[c][j] = sums[c][j] / counts[c]
          }
        }
        if (!changed) break
      }
      return { assignments, centroids, iterations }
    }

    const calculateSilhouette = (kValue: number, assignments: number[]) =>
      zVectors.length <= 1
        ? 0
        : zVectors.reduce((acc, vec, idx) => {
            const ownCluster = assignments[idx]
            const ownMembers = assignments
              .map((cIdx, mIdx) => ({ cIdx, mIdx }))
              .filter((x) => x.cIdx === ownCluster && x.mIdx !== idx)
              .map((x) => zVectors[x.mIdx])

            const a =
              ownMembers.length === 0
                ? 0
                : ownMembers.reduce((sum, other) => sum + Math.sqrt(distanceSquared(vec, other)), 0) / ownMembers.length

            let b = Number.POSITIVE_INFINITY
            for (let c = 0; c < kValue; c += 1) {
              if (c === ownCluster) continue
              const otherMembers = assignments
                .map((cIdx, mIdx) => ({ cIdx, mIdx }))
                .filter((x) => x.cIdx === c)
                .map((x) => zVectors[x.mIdx])
              if (otherMembers.length === 0) continue
              const avgDist =
                otherMembers.reduce((sum, other) => sum + Math.sqrt(distanceSquared(vec, other)), 0) /
                otherMembers.length
              if (avgDist < b) b = avgDist
            }

            const denom = Math.max(a, b)
            const s = !Number.isFinite(denom) || denom <= 0 ? 0 : (b - a) / denom
            return acc + s
          }, 0) / zVectors.length

    const calculateDBI = (kValue: number, assignments: number[], centroids: number[][]) => {
      if (kValue <= 1) return 0
      const membersByCluster = Array.from({ length: kValue }, () => [] as number[])
      assignments.forEach((clusterIdx, vecIdx) => {
        membersByCluster[clusterIdx].push(vecIdx)
      })
      const scatters = membersByCluster.map((memberIdxs, clusterIdx) => {
        if (memberIdxs.length === 0) return 0
        const centroid = centroids[clusterIdx]
        const avgDist =
          memberIdxs.reduce((sum, idx) => sum + Math.sqrt(distanceSquared(zVectors[idx], centroid)), 0) / memberIdxs.length
        return avgDist
      })
      const rValues = Array.from({ length: kValue }, (_, i) => {
        let maxR = 0
        for (let j = 0; j < kValue; j += 1) {
          if (i === j) continue
          const centroidDist = Math.sqrt(distanceSquared(centroids[i], centroids[j]))
          if (centroidDist <= 1e-9) continue
          const r = (scatters[i] + scatters[j]) / centroidDist
          if (r > maxR) maxR = r
        }
        return maxR
      })
      return rValues.reduce((sum, v) => sum + v, 0) / kValue
    }

    const assignmentsByK = new Map<number, number[]>()
    const kMetrics = Array.from({ length: maxK - minK + 1 }, (_, idx) => {
      const kValue = minK + idx
      const { assignments: kAssignments, centroids: kCentroids, iterations: kIterations } = runKMeans(kValue)
      assignmentsByK.set(kValue, kAssignments)
      const wcss = kAssignments.reduce((acc, clusterIdx, vecIdx) => {
        return acc + distanceSquared(zVectors[vecIdx], kCentroids[clusterIdx])
      }, 0)
      const silhouette = calculateSilhouette(kValue, kAssignments)
      const dbi = calculateDBI(kValue, kAssignments, kCentroids)
      return {
        k: kValue,
        wcss,
        silhouette: Number.isFinite(silhouette) ? silhouette : 0,
        dbi: Number.isFinite(dbi) ? dbi : 0,
        iterations: kIterations,
      }
    })

    const baselineKMetrics = Array.from({ length: maxK - minK + 1 }, (_, idx) => {
      const kValue = minK + idx
      const { assignments: kAssignments, centroids: kCentroids, iterations: kIterations } = runKMeansBaseline(kValue)
      const wcss = kAssignments.reduce((acc, clusterIdx, vecIdx) => {
        return acc + distanceSquared(zVectors[vecIdx], kCentroids[clusterIdx])
      }, 0)
      const silhouette = calculateSilhouette(kValue, kAssignments)
      const dbi = calculateDBI(kValue, kAssignments, kCentroids)
      return {
        k: kValue,
        wcss,
        silhouette: Number.isFinite(silhouette) ? silhouette : 0,
        dbi: Number.isFinite(dbi) ? dbi : 0,
        iterations: kIterations,
      }
    })

    const buildDerivedForK = (kValue: number, assignments: number[]) => {
      const groupedPois: Record<string, EnrichedPOI[]> = {}
      const groupedZVectors: Record<string, number[][]> = {}
      for (let c = 0; c < kValue; c += 1) {
        groupedPois[String(c)] = []
        groupedZVectors[String(c)] = []
      }
      assignments.forEach((clusterIdx, poiIdx) => {
        const key = String(clusterIdx)
        groupedPois[key].push(allPois[poiIdx])
        groupedZVectors[key].push(zVectors[poiIdx])
      })

      const derivedClusters: ClusterResponse['clusters'] = {}
      const zscoreRows: ZScoreRow[] = []
      const zscoreDetails: Record<string, ZScoreDetailRow[]> = {}
      for (let c = 0; c < kValue; c += 1) {
        const key = String(c)
        const pois = groupedPois[key]
        const count = pois.length || 1
        const dominantMap = new Map<string, number>()
        pois.forEach((poi) => {
          dominantMap.set(poi.category, (dominantMap.get(poi.category) ?? 0) + 1)
        })
        const dominantCategory =
          [...dominantMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '-'

        derivedClusters[key] = {
          day: c + 1,
          pois,
          summary: {
            member_count: pois.length,
            avg_semantic_score: pois.reduce((acc, poi) => acc + poi.semantic_score, 0) / count,
            avg_dist_to_hotel_m: pois.reduce((acc, poi) => acc + poi.dist_to_hotel_m, 0) / count,
            avg_dist_to_stop_m: pois.reduce((acc, poi) => acc + poi.dist_to_stop_m, 0) / count,
            avg_resto_count: pois.reduce((acc, poi) => acc + poi.resto_count, 0) / count,
            dominant_category: dominantCategory,
          },
        }

        const zCount = groupedZVectors[key].length || 1
        const zAvg = FEATURE_KEYS.map((_, idx) => groupedZVectors[key].reduce((acc, row) => acc + row[idx], 0) / zCount)
        zscoreRows.push({
          cluster: `Cluster ${c + 1}`,
          latitude: zAvg[0],
          longitude: zAvg[1],
          semantic_score: zAvg[2],
          dist_to_hotel_m: zAvg[3],
          dist_to_stop_m: zAvg[4],
          resto_count: zAvg[5],
          minimarket_count: zAvg[6],
        })

        zscoreDetails[key] = pois.map((poi, idx) => {
          const zv = groupedZVectors[key][idx] ?? [0, 0, 0, 0, 0, 0, 0]
          return {
            poi_id: poi.poi_id,
            name: poi.name,
            category: poi.category,
            subcategory: poi.subcategory,
            latitude: zv[0],
            longitude: zv[1],
            semantic_score: zv[2],
            dist_to_hotel_m: zv[3],
            dist_to_stop_m: zv[4],
            resto_count: zv[5],
            minimarket_count: zv[6],
          }
        })
      }
      return { derivedClusters, zscoreRows, zscoreDetails }
    }

    const selectedMetric = kMetrics.find((metric) => metric.k === selectedOptimalK) ?? kMetrics[kMetrics.length - 1]
    const selectedAssignments = assignmentsByK.get(selectedMetric.k) ?? runKMeans(selectedMetric.k).assignments
    const selectedDerived = buildDerivedForK(selectedMetric.k, selectedAssignments)
    const maxKAssignments = assignmentsByK.get(maxK) ?? runKMeans(maxK).assignments
    const maxKDerived = buildDerivedForK(maxK, maxKAssignments)

    return {
      clusters: selectedDerived.derivedClusters,
      comparisonClusters: maxKDerived.derivedClusters,
      zscoreRows: selectedDerived.zscoreRows,
      zscoreDetails: selectedDerived.zscoreDetails,
      metrics: {
          k: selectedMetric.k,
          wcss: selectedMetric.wcss,
          silhouette: selectedMetric.silhouette,
          dbi: selectedMetric.dbi,
          iterations: selectedMetric.iterations,
      },
        kMetrics,
        baselineKMetrics,
    }
  }, [allPois, resolvedKBounds, selectedOptimalK])

  const analysisFeatureChartData = useMemo(() => {
    return Object.entries(analysisResult.comparisonClusters).map(([clusterId, cluster]) => {
      const count = cluster.pois.length || 1
      return {
        cluster: `C${Number(clusterId) + 1}`,
        avg_lat: cluster.pois.reduce((acc, poi) => acc + poi.latitude, 0) / count,
        avg_lon: cluster.pois.reduce((acc, poi) => acc + poi.longitude, 0) / count,
        avg_semantic: cluster.pois.reduce((acc, poi) => acc + poi.semantic_score, 0) / count,
        avg_dist_hotel_m: cluster.pois.reduce((acc, poi) => acc + poi.dist_to_hotel_m, 0) / count,
        avg_dist_stop_m: cluster.pois.reduce((acc, poi) => acc + poi.dist_to_stop_m, 0) / count,
        avg_resto: cluster.pois.reduce((acc, poi) => acc + poi.resto_count, 0) / count,
        avg_minimarket: cluster.pois.reduce((acc, poi) => acc + poi.minimarket_count, 0) / count,
      }
    })
  }, [analysisResult.comparisonClusters])

  useEffect(() => {
    setSelectedOptimalK((prev) => {
      return Math.max(resolvedKBounds.minK, Math.min(prev, resolvedKBounds.maxK))
    })
  }, [resolvedKBounds.minK, resolvedKBounds.maxK])

  const derivedOptimalK = useMemo(() => {
    if (!analysisResult.kMetrics.length) return 1
    return analysisResult.kMetrics.reduce((best, curr) => {
      if (curr.silhouette > best.silhouette) return curr
      if (curr.silhouette === best.silhouette && curr.wcss < best.wcss) return curr
      return best
    }).k
  }, [analysisResult.kMetrics])

  useEffect(() => {
    if (!analysisResult.kMetrics.length) return
    setSelectedOptimalK(derivedOptimalK)
  }, [analysisMinK, analysisMaxK, derivedOptimalK, analysisResult.kMetrics.length])

  const chartKAnalysis = useMemo(() => {
    if (!analysisResult.kMetrics.length) {
      return { k_range: [], wcss_values: [], silhouette_values: [] }
    }
    return {
      k_range: analysisResult.kMetrics.map((m) => m.k),
      wcss_values: analysisResult.kMetrics.map((m) => m.wcss),
      silhouette_values: analysisResult.kMetrics.map((m) => m.silhouette),
    }
  }, [analysisResult.kMetrics])

  const clusterCountOptions = useMemo(() => {
    if (analysisResult.kMetrics.length > 0) return analysisResult.kMetrics.map((m) => m.k)
    const { minK, maxK } = resolvedKBounds
    return Array.from({ length: maxK - minK + 1 }, (_, idx) => minK + idx)
  }, [analysisResult.kMetrics, resolvedKBounds])

  const destinationClusterEntries = useMemo(
    () => Object.entries(analysisResult.clusters).sort(([a], [b]) => Number(a) - Number(b)),
    [analysisResult.clusters],
  )

  useEffect(() => {
    if (!destinationClusterEntries.length) return
    setCurrentDestinationClusterId((prev) => {
      if (prev && destinationClusterEntries.some(([cid]) => cid === prev)) return prev
      return destinationClusterEntries[0][0]
    })
  }, [destinationClusterEntries])

  const interpretationFeatureValues = useMemo(() => {
    const out: Record<string, Record<InterpretationFeatureKey, number>> = {}
    Object.entries(analysisResult.clusters).forEach(([clusterId, cluster]) => {
      const count = Math.max(cluster.pois.length, 1)
      const minmarketAvg = cluster.pois.reduce((sum, poi) => sum + poi.minimarket_count, 0) / count
      const avgHotelFromPois = cluster.pois.reduce((sum, poi) => sum + poi.dist_to_hotel_m, 0) / count
      const avgStopFromPois = cluster.pois.reduce((sum, poi) => sum + poi.dist_to_stop_m, 0) / count
      const avgRestoFromPois = cluster.pois.reduce((sum, poi) => sum + poi.resto_count, 0) / count
      out[clusterId] = {
        semantic: Number(cluster.summary.avg_semantic_score ?? 0),
        dist_hotel: Number(cluster.summary.avg_dist_to_hotel_m ?? avgHotelFromPois),
        dist_stop: Number(cluster.summary.avg_dist_to_stop_m ?? avgStopFromPois),
        resto: Number(cluster.summary.avg_resto_count ?? avgRestoFromPois),
        minimarket: Number(minmarketAvg ?? 0),
      }
    })
    return out
  }, [analysisResult.clusters])

  const interpretationRanksByFeature = useMemo(() => {
    const out: Record<InterpretationFeatureKey, Record<string, number>> = {
      semantic: {},
      dist_hotel: {},
      dist_stop: {},
      resto: {},
      minimarket: {},
    }
    INTERPRETATION_FEATURES.forEach((feature) => {
      const sorted = Object.entries(interpretationFeatureValues).sort((a, b) => {
        const aVal = a[1][feature.key]
        const bVal = b[1][feature.key]
        return feature.higherIsBetter ? bVal - aVal : aVal - bVal
      })
      sorted.forEach(([clusterId], idx) => {
        out[feature.key][clusterId] = idx + 1
      })
    })
    return out
  }, [interpretationFeatureValues])

  const sortedInterpretationEntries = useMemo(() => {
    const featureMeta = INTERPRETATION_FEATURES.find((item) => item.key === interpretationSortFeature)
    const higherIsBetter = featureMeta?.higherIsBetter ?? true
    return Object.entries(analysisResult.clusters).sort(([aId], [bId]) => {
      const aVal = interpretationFeatureValues[aId]?.[interpretationSortFeature] ?? 0
      const bVal = interpretationFeatureValues[bId]?.[interpretationSortFeature] ?? 0
      return higherIsBetter ? bVal - aVal : aVal - bVal
    })
  }, [analysisResult.clusters, interpretationFeatureValues, interpretationSortFeature])

  useEffect(() => {
    if (generationMode !== 'auto') return
    if (!clusterData) return
    const entries = Object.entries(analysisResult.clusters)
    if (!entries.length) return

    const perDay = Math.max(
      1,
      Math.min(20, Math.round(dailyDestinationLimit) || DEFAULT_DESTINATIONS_PER_DAY),
    )
    const autoKey = `${clusterFingerprint(clusterData)}|${plannedDays}|${perDay}`
    if (lastAutoFillKeyRef.current === autoKey) return
    lastAutoFillKeyRef.current = autoKey

    const auto = buildAutoSelectionsByDay(analysisResult.clusters, plannedDays, perDay)
    setSelectedPOIs(auto.selectedPOIs)
    setPoiDayAssignments(auto.poiDayAssignments)
    setSidebarDaySequences(auto.sidebarDaySequences)
    try {
      sessionStorage.setItem('dailyDestinationLimit', String(perDay))
    } catch {
      /* ignore write error */
    }
  }, [generationMode, clusterData, analysisResult.clusters, dailyDestinationLimit, plannedDays])

  if (!clusterData) {
    return (
      <>
        <Navbar />
        <main className="flex min-h-[50vh] flex-col items-center justify-center gap-4 bg-background px-4 py-16">
          <div
            className="h-12 w-12 animate-spin rounded-full border-4 border-primary/20 border-t-primary"
            aria-hidden
          />
          <div className="max-w-md text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Memuat hasil clustering…</p>
            <p className="mt-2 text-xs">Jika lama tidak berubah, jalankan lagi pencarian dari beranda.</p>
          </div>
        </main>
      </>
    )
  }
  const clusters = analysisResult.clusters
  const destinationClusterIds = destinationClusterEntries.map(([cid]) => cid)
  const activeDestinationClusterId =
    currentDestinationClusterId && destinationClusterIds.includes(currentDestinationClusterId)
      ? currentDestinationClusterId
      : destinationClusterIds[0] ?? null
  const activeDestinationCluster = activeDestinationClusterId ? clusters[activeDestinationClusterId] : null

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background">

        {/* Page Header */}
        <div className="page-hero">
          <div className="page-hero-inner">
            <div className="flex items-center gap-2 mb-1">
              <Layers className="w-5 h-5 text-accent" />
              <h1 className="text-xl md:text-2xl font-bold">Hasil Intelligent K-Means Clustering</h1>
            </div>
            <p className="text-primary-foreground/75 text-sm">Pengelompokan dari 7 fitur spasial dan semantik</p>
          </div>
        </div>

        <section className="app-container py-6">
          <AppFlowStepIndicator activeStep={1} />
        </section>

        <div className="app-container space-y-2">

          {/* === SECTION 2: ALGORITHM INFO BANNER === */}
          {/* <div className="presentation-hide bg-primary/5 border border-primary/20 rounded-2xl p-4 flex flex-col sm:flex-row gap-3 items-start">
            <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
              <Info className="w-4 h-4 text-primary" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1 text-sm">
              <div>
                <p className="font-semibold text-foreground text-xs mb-1">Algoritma</p>
                <p className="text-muted-foreground text-xs">Intelligent K-Means dengan inisialisasi centroid probabilistik. K dibatasi &le; jumlah hari.</p>
              </div>
              <div>
                <p className="font-semibold text-foreground text-xs mb-1">7 Fitur Clustering</p>
                <p className="text-muted-foreground text-xs">Lat, Lon, Skor Semantik, Jarak Hotel, Jarak Halte, Jumlah Restoran, Jumlah Minimarket</p>
              </div>
              <div>
                <p className="font-semibold text-foreground text-xs mb-1">Normalisasi</p>
                <p className="text-muted-foreground text-xs">Z-Score StandardScaler sebelum Euclidean Distance dihitung</p>
              </div>
            </div>
          </div> */}

          {/* === SECTION 3: TABS (Clusters | Analysis | Destination Picker) === */}
          <div>
            <div className="mb-2 grid w-full grid-cols-1 gap-1 rounded-xl border border-primary/25 bg-primary/5 p-1.5 sm:grid-cols-3">
              <button
                onClick={() => setActiveTab('clusters')}
                className={`w-full rounded-lg px-3 py-1.5 text-sm font-semibold transition-all ${
                  activeTab === 'clusters'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
                }`}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  Cluster Destinasi
                </span>
              </button>
              <button
                onClick={() => setActiveTab('destinations')}
                className={`w-full rounded-lg px-3 py-1.5 text-sm font-semibold transition-all ${
                  activeTab === 'destinations'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
                }`}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Pilih Destinasi
                </span>
              </button>
              <button
                onClick={() => setActiveTab('analysis')}
                className={`w-full rounded-lg px-3 py-1.5 text-sm font-semibold transition-all ${
                  activeTab === 'analysis'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
                }`}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <BarChart2 className="w-3.5 h-3.5" />
                  Analisis Grafik
                </span>
              </button>
            </div>

            {/* --- TAB: CLUSTER DESTINASI & PILIH DESTINASI --- */}
            {(activeTab === 'clusters' || activeTab === 'destinations') && (
              <div className="space-y-6">
                {activeTab === 'clusters' && (
                  <p className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                    Setelah memahami cluster, lanjut ke{' '}
                    <button
                      type="button"
                      onClick={() => setActiveTab('destinations')}
                      className="font-semibold text-primary underline-offset-2 hover:underline"
                    >
                      pilih destinasi
                    </button>
                    {' '}atau langsung{' '}
                    <button
                      type="button"
                      onClick={() => void handleCreateItinerary()}
                      disabled={(generationMode === 'manual' && totalSelected === 0) || loading}
                      className="font-semibold text-primary underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50"
                    >
                      buat itinerary
                    </button>
                    .
                  </p>
                )}

                {activeTab === 'clusters' && (
                  <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="h-5 w-1 rounded-full bg-primary" />
                        <h3 className="text-sm font-bold text-foreground">Jumlah Kelompok Cluster</h3>
                      </div>
                      <p className="text-xs text-muted-foreground">Pilih jumlah kelompok untuk melihat informasi cluster.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Jumlah kelompok cluster">
                      {clusterCountOptions.map((kValue) => {
                        const selected = selectedOptimalK === kValue
                        const isOptimal = derivedOptimalK === kValue
                        return (
                          <label
                            key={`cluster-count-tab-${kValue}`}
                            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                              selected
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border bg-background text-foreground hover:bg-muted'
                            }`}
                          >
                            <input
                              type="radio"
                              name="cluster-tab-k-selector"
                              checked={selected}
                              onChange={() => setSelectedOptimalK(kValue)}
                              className="h-3.5 w-3.5 border-border text-primary focus:ring-primary/30"
                            />
                            <span>{kValue} kelompok</span>
                            {isOptimal ? <span className="text-emerald-600">(optimal)</span> : null}
                          </label>
                        )
                      })}
                    </div>
                  </section>
                )}

                {activeTab === 'clusters' && (
                <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-1 rounded-full bg-primary" />
                      <h3 className="text-sm font-bold text-foreground">Interpretasi Cluster (Ringkas)</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <label htmlFor="interpretation-sort" className="text-xs font-semibold text-muted-foreground">
                        Sorting
                      </label>
                      <select
                        id="interpretation-sort"
                        value={interpretationSortFeature}
                        onChange={(e) => setInterpretationSortFeature(e.target.value as InterpretationFeatureKey)}
                        className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        {INTERPRETATION_FEATURES.map((feature) => (
                          <option key={`sort-${feature.key}`} value={feature.key}>
                            {feature.label}
                          </option>
                        ))}
                      </select>
                      <div className="inline-flex items-center rounded-lg border border-border bg-background p-1">
                        <button
                          type="button"
                          onClick={() => setDestinationListView('card')}
                          aria-label="View cluster card"
                          title="View card"
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                            destinationListView === 'card'
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          }`}
                        >
                          <LayoutGrid className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDestinationListView('table')}
                          aria-label="View cluster tabel"
                          title="View tabel"
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                            destinationListView === 'table'
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          }`}
                        >
                          <List className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Fokus pada makna cluster agar pemilihan destinasi lebih cepat dan mudah dipahami.
                  </p>
                  {destinationListView === 'card' ? (
                    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                      {sortedInterpretationEntries.map(([clusterId, cluster]) => {
                        const parsed = parseInt(clusterId, 10)
                        const cidx = parsed % CLUSTER_COLORS.length
                        const interpretation = interpretClusterForUser(cluster)
                        const featureValues = interpretationFeatureValues[clusterId]
                        const interpretationSegments = getClusterInterpretationParagraphSegments(
                          cluster,
                          clusterId,
                          parsed,
                          interpretationRanksByFeature,
                        )
                        return (
                          <article
                            key={`cluster-quick-interpretation-${clusterId}`}
                            className="relative rounded-xl border border-border bg-muted/20 p-3 pb-12"
                            style={{ borderLeftWidth: 4, borderLeftColor: CLUSTER_COLORS[cidx] }}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
                                style={{ backgroundColor: CLUSTER_COLORS[cidx] }}
                              >
                                {parsed + 1}
                              </span>
                              <p className="text-sm font-semibold text-foreground">{interpretation.label}</p>
                              <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                                {formatPreferencePercent(featureValues.semantic)}
                              </span>
                            </div>
                            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                              <InterpretationColoredText
                                segments={interpretationSegments}
                                clusterColor={CLUSTER_COLORS[cidx]}
                              />
                            </p>
                            <div className="mt-2 grid grid-cols-5 gap-2 text-[10px]">
                              {INTERPRETATION_FEATURE_UI.map((featureUi) => {
                                const Icon = featureUi.icon
                                const rank = interpretationRanksByFeature[featureUi.key][clusterId] ?? parsed + 1
                                return (
                                  <div
                                    key={`interp-feature-${clusterId}-${featureUi.key}`}
                                    className={`rounded-lg border px-1.5 py-1.5 text-center ${featureUi.boxClass}`}
                                  >
                                    <Icon className={`mx-auto h-3.5 w-3.5 ${featureUi.iconClass}`} />
                                    <p className="mt-0.5 text-[9px] font-semibold leading-tight text-foreground">
                                      {featureUi.label}
                                    </p>
                                    <p className="mt-0.5 text-[9px] leading-tight text-muted-foreground">
                                      {featureUi.description}
                                    </p>
                                    <p className="mt-1 text-[11px] font-bold text-foreground">#{rank}</p>
                                    <p className="text-[10px] font-semibold tabular-nums text-foreground">
                                      {formatInterpretationFeatureValue(featureUi.key, featureValues)}
                                    </p>
                                  </div>
                                )
                              })}
                            </div>
                            <button
                              type="button"
                              onClick={() => goToDestinationCluster(clusterId)}
                              className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                            >
                              Pilih Destinasi
                              <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                          </article>
                        )
                      })}
                    </div>
                  ) : (
                    <>
                    <div className="overflow-x-auto rounded-xl border border-border">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border bg-muted/40">
                            <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Cluster</th>
                            <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Tema</th>
                            <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                              <button
                                type="button"
                                onClick={() => setInterpretationSortFeature('semantic')}
                                className={`inline-flex items-center gap-1 transition-colors ${interpretationSortFeature === 'semantic' ? 'text-primary' : 'hover:text-foreground'}`}
                              >
                                Preferensi
                                <ArrowUpDown className="h-3 w-3" />
                              </button>
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                              <button
                                type="button"
                                onClick={() => setInterpretationSortFeature('dist_hotel')}
                                className={`inline-flex items-center gap-1 transition-colors ${interpretationSortFeature === 'dist_hotel' ? 'text-primary' : 'hover:text-foreground'}`}
                              >
                                Hotel
                                <ArrowUpDown className="h-3 w-3" />
                              </button>
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                              <button
                                type="button"
                                onClick={() => setInterpretationSortFeature('dist_stop')}
                                className={`inline-flex items-center gap-1 transition-colors ${interpretationSortFeature === 'dist_stop' ? 'text-primary' : 'hover:text-foreground'}`}
                              >
                                Halte
                                <ArrowUpDown className="h-3 w-3" />
                              </button>
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                              <button
                                type="button"
                                onClick={() => setInterpretationSortFeature('resto')}
                                className={`inline-flex items-center gap-1 transition-colors ${interpretationSortFeature === 'resto' ? 'text-primary' : 'hover:text-foreground'}`}
                              >
                                Restoran
                                <ArrowUpDown className="h-3 w-3" />
                              </button>
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                              <button
                                type="button"
                                onClick={() => setInterpretationSortFeature('minimarket')}
                                className={`inline-flex items-center gap-1 transition-colors ${interpretationSortFeature === 'minimarket' ? 'text-primary' : 'hover:text-foreground'}`}
                              >
                                Minimarket
                                <ArrowUpDown className="h-3 w-3" />
                              </button>
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {sortedInterpretationEntries.map(([clusterId, cluster]) => {
                            const parsed = parseInt(clusterId, 10)
                            const semanticRank = interpretationRanksByFeature.semantic[clusterId] ?? parsed + 1
                            const distHotelRank = interpretationRanksByFeature.dist_hotel[clusterId] ?? parsed + 1
                            const distStopRank = interpretationRanksByFeature.dist_stop[clusterId] ?? parsed + 1
                            const restoRank = interpretationRanksByFeature.resto[clusterId] ?? parsed + 1
                            const minimarketRank = interpretationRanksByFeature.minimarket[clusterId] ?? parsed + 1
                            const featureValues = interpretationFeatureValues[clusterId]
                            const total = Math.max(1, sortedInterpretationEntries.length)
                            const topCut = Math.max(1, Math.ceil(total / 3))
                            const midCut = Math.max(topCut + 1, Math.ceil((2 * total) / 3))
                            const semText = semanticRank <= topCut ? 'sangat relevan' : semanticRank <= midCut ? 'cukup relevan' : 'relevansi rendah'
                            const hotelText = distHotelRank <= topCut ? 'dekat hotel' : distHotelRank <= midCut ? 'jarak sedang' : 'cenderung jauh'
                            const stopText = distStopRank <= topCut ? 'akses halte baik' : distStopRank <= midCut ? 'akses sedang' : 'halte cukup jauh'
                            const restoText = restoRank <= topCut ? 'resto padat' : restoRank <= midCut ? 'resto cukup' : 'resto terbatas'
                            const minimarketText = minimarketRank <= topCut ? 'mini padat' : minimarketRank <= midCut ? 'mini cukup' : 'mini terbatas'
                            return (
                              <tr key={`cluster-interp-row-${clusterId}`} className="hover:bg-muted/20">
                                <td className="px-3 py-2 font-semibold" style={{ color: CLUSTER_COLORS[parsed % CLUSTER_COLORS.length] }}>
                                  Cluster {parsed + 1}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">{cluster.summary.dominant_category || 'umum'}</td>
                                <td className="px-3 py-2">
                                  <p className="font-semibold text-foreground">
                                    #{semanticRank} •{' '}
                                    <span className={interpretationFeatureTextClass('semantic')}>{semText}</span>
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">{formatPreferencePercent(featureValues.semantic)}</p>
                                </td>
                                <td className="px-3 py-2">
                                  <p className="font-semibold text-foreground">
                                    #{distHotelRank} •{' '}
                                    <span className={interpretationFeatureTextClass('dist_hotel')}>{hotelText}</span>
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">{Math.round(featureValues.dist_hotel)} m</p>
                                </td>
                                <td className="px-3 py-2">
                                  <p className="font-semibold text-foreground">
                                    #{distStopRank} •{' '}
                                    <span className={interpretationFeatureTextClass('dist_stop')}>{stopText}</span>
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">{Math.round(featureValues.dist_stop)} m</p>
                                </td>
                                <td className="px-3 py-2">
                                  <p className="font-semibold text-foreground">
                                    #{restoRank} •{' '}
                                    <span className={interpretationFeatureTextClass('resto')}>{restoText}</span>
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">{featureValues.resto.toFixed(1)}</p>
                                </td>
                                <td className="px-3 py-2">
                                  <p className="font-semibold text-foreground">
                                    #{minimarketRank} •{' '}
                                    <span className={interpretationFeatureTextClass('minimarket')}>{minimarketText}</span>
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">{featureValues.minimarket.toFixed(1)}</p>
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <button
                                    type="button"
                                    onClick={() => goToDestinationCluster(clusterId)}
                                    className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                                  >
                                    Pilih Destinasi
                                    <ArrowRight className="h-3 w-3" />
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    </>
                  )}
                </section>
                )}

                {activeTab === 'destinations' && (
                  <>
                <p className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                  Destinasi bisa dipilih dari daftar atau langsung di{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setDestinationPanelTab('summary')
                      setShowDestinationMap(true)
                    }}
                    className="font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    peta
                  </button>
                  . Setelah memilih destinasi, lanjut ke{' '}
                  <button
                    type="button"
                    onClick={() => setDestinationPanelTab('summary')}
                    className="font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    ringkasan per hari
                  </button>
                  {' '}atau tinjau{' '}
                  <button
                    type="button"
                    onClick={() => setActiveTab('clusters')}
                    className="font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    cluster destinasi
                  </button>
                  {' '}kembali.
                </p>

                <div className="flex flex-wrap items-center justify-center gap-3 rounded-xl border border-border bg-card px-3 py-2 sm:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center justify-center gap-2">
                    <span className="text-xs font-medium text-foreground">Durasi (hari):</span>
                    <div className="flex flex-wrap gap-1" role="group" aria-label="Jumlah hari itinerary">
                      {Array.from({ length: MAX_PLANNED_TRIP_DAYS }, (_, i) => i + 1).map((d) => (
                        <button
                          key={`duration-${d}`}
                          type="button"
                          onClick={() => {
                            setPlannedDays(d)
                            sessionStorage.setItem('numDays', String(d))
                            if (assignmentTargetDay > d) setAssignmentTargetDay(d)
                          }}
                          className={`min-w-[2rem] rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
                            plannedDays === d
                              ? 'bg-primary text-primary-foreground'
                              : 'border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  </div>
                  <div className="inline-flex items-center rounded-lg border border-border bg-background p-1">
                    <button
                      type="button"
                      onClick={() => setDestinationListView('card')}
                      aria-label="Ganti ke view card"
                      title="View card"
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                        destinationListView === 'card'
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDestinationListView('table')}
                      aria-label="Ganti ke view tabel"
                      title="View tabel"
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                        destinationListView === 'table'
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      <List className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="inline-flex w-full items-center rounded-xl border border-border bg-card p-1">
                  <button
                    type="button"
                    onClick={() => setDestinationPanelTab('picker')}
                    className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                      destinationPanelTab === 'picker'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    Pilih Destinasi
                  </button>
                  <button
                    type="button"
                    onClick={() => setDestinationPanelTab('summary')}
                    className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                      destinationPanelTab === 'summary'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    Ringkasan per Hari
                  </button>
                </div>

                {destinationPanelTab === 'picker' && (
                <>
                {/* Summary + kontrol */}
                <div className="surface-card grid grid-cols-1 gap-3 rounded-xl px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-4">
                  <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-self-start sm:justify-start">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                      <span className="text-muted-foreground">Dipilih:</span>
                      <span className="font-bold text-foreground">
                      <span className="text-base text-primary">{totalSelected}</span> / {totalPOIs} destinasi
                      </span>
                    </div>

                  <div className="flex max-w-[min(100%,28rem)] flex-wrap items-center justify-center gap-x-1 gap-y-1 justify-self-center sm:max-w-none">
                    <span className="text-sm text-muted-foreground">Pilih destinasi untuk hari ke-</span>
                    <span
                      className="flex flex-wrap items-center justify-center gap-1"
                      role="group"
                      aria-label="Nomor hari untuk pemilihan destinasi"
                    >
                      {Array.from({ length: plannedDays }, (_, i) => i + 1).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setAssignmentTargetDay(d)}
                          title={`Masukkan ke dalam hari ${d}`}
                          className={`min-w-[2rem] rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                            assignmentTargetDay === d
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-1 justify-self-center sm:justify-self-end sm:justify-end">
                    {destinationClusterEntries.map(([clusterId]) => {
                      const parsed = Number(clusterId)
                      const selected = clusterId === activeDestinationClusterId
                      return (
                        <button
                          key={`cluster-nav-inline-${clusterId}`}
                          type="button"
                          onClick={() => setCurrentDestinationClusterId(clusterId)}
                          className={`rounded-md border px-1.5 py-1 text-[10px] font-semibold transition-colors sm:px-2 sm:text-[11px] ${
                            selected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border bg-background text-foreground hover:bg-muted'
                          }`}
                        >
                          C{parsed + 1}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Daftar cluster compact dengan pindah cluster */}
                <div className="space-y-3">
                  {activeDestinationCluster ? (() => {
                    const clusterId = activeDestinationClusterId as string
                    const cluster = activeDestinationCluster
                    const cidx = parseInt(clusterId, 10) % CLUSTER_COLORS.length
                    const color = CLUSTER_COLORS[cidx]
                    const selectedCount = (selectedPOIs[clusterId] || []).length
                    const allSelected = selectedCount === cluster.pois.length
                    const someSelected = selectedCount > 0 && selectedCount < cluster.pois.length
                    const nPoi = Math.max(cluster.pois.length, 1)
                    const avgDistHotelM = cluster.pois.reduce((sum, p) => sum + p.dist_to_hotel_m, 0) / nPoi

                    return (
                      <div className="surface-card overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: color }}>
                        <div className="flex items-center justify-between p-4">
                          <div className="flex items-center gap-3">
                            <div
                              className="h-9 w-9 rounded-full text-sm font-bold text-white inline-flex items-center justify-center"
                              style={{ backgroundColor: color }}
                            >
                              {parseInt(clusterId, 10) + 1}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-bold text-foreground">Cluster {parseInt(clusterId, 10) + 1}</p>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CLUSTER_BADGE[cidx]}`}>
                                  {cluster.summary.dominant_category}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {cluster.summary.member_count} destinasi &bull; Preferensi avg{' '}
                                {formatPreferencePercent(cluster.summary.avg_semantic_score)}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                              allSelected
                                ? 'bg-primary/10 text-primary'
                                : someSelected
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {selectedCount}/{cluster.pois.length}
                          </span>
                        </div>

                        <div className={`px-4 py-2.5 grid grid-cols-2 gap-2 text-center border-t border-border sm:grid-cols-3 lg:grid-cols-5 ${CLUSTER_BG[cidx]}`}>
                          <div>
                            <p className="text-xs text-muted-foreground leading-tight">Jarak ke hotel (avg)</p>
                            <p className="text-sm font-bold text-amber-600">{Math.round(avgDistHotelM)} m</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground leading-tight">Jarak ke halte (avg)</p>
                            <p className="text-sm font-bold" style={{ color: '#3B82F6' }}>
                              {Math.round(cluster.summary.avg_dist_to_stop_m)} m
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground leading-tight">Restoran (avg)</p>
                            <p className="text-sm font-bold text-orange-600">{cluster.summary.avg_resto_count.toFixed(1)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground leading-tight">Minimarket (avg)</p>
                            <p className="text-sm font-bold text-violet-600">
                              {(cluster.pois.reduce((s, p) => s + p.minimarket_count, 0) / nPoi).toFixed(1)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground leading-tight">Jumlah POI</p>
                            <p className="text-sm font-bold text-foreground">{cluster.summary.member_count}</p>
                          </div>
                        </div>

                        <div className="border-t border-border">
                          <div className="flex items-center justify-between px-4 py-2 bg-muted/20 border-b border-border">
                            <p className="text-xs text-muted-foreground">Pilih destinasi dari Cluster {parseInt(clusterId, 10) + 1}:</p>
                            <button
                              onClick={() => toggleAllInCluster(clusterId, cluster.pois)}
                              className="text-xs font-semibold text-primary hover:underline"
                            >
                              {allSelected ? 'Batalkan Semua' : 'Pilih Semua'}
                            </button>
                          </div>

                          <div className="max-h-[34rem] overflow-y-auto p-3">
                            <div className="mb-2.5 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground sm:grid-cols-4">
                              <p className="rounded-md bg-muted/40 px-2 py-1">Preferensi: relevansi terhadap preferensi</p>
                              <p className="rounded-md bg-muted/40 px-2 py-1">Hotel: jarak dari titik hotel</p>
                              <p className="rounded-md bg-muted/40 px-2 py-1">Halte: akses transportasi terdekat</p>
                              <p className="rounded-md bg-muted/40 px-2 py-1">Resto dan mini: fasilitas sekitar</p>
                            </div>
                            {destinationListView === 'card' ? (
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                {cluster.pois.map((poi, idx) => {
                                  const selected = isPOISelected(clusterId, poi.poi_id)
                                  const assignedDay = poiDayAssignments[poi.poi_id]
                                  const toggleThis = () => {
                                    togglePOI(clusterId, poi)
                                  }
                                  return (
                                    <div
                                      key={poi.poi_id}
                                      className={`flex h-full flex-col overflow-hidden rounded-xl border-2 transition-all ${
                                        selected
                                          ? 'border-primary bg-primary/5 shadow-sm ring-2 ring-primary/25'
                                          : 'border-border hover:border-border/70 hover:bg-muted/20'
                                      }`}
                                    >
                                      <button
                                        type="button"
                                        aria-pressed={selected}
                                        aria-label={
                                          selected
                                            ? `Batalkan pemilihan ${poi.name}`
                                            : `Pilih ${poi.name} untuk hari ke-${assignmentTargetDay}`
                                        }
                                        onClick={toggleThis}
                                        className="flex flex-1 flex-col cursor-pointer p-0 text-left outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2"
                                      >
                                        <DestinationItineraryCard
                                          poi={poi}
                                          accentColor={color}
                                          orderBadge={idx + 1}
                                          distanceMode="from_hotel"
                                          primaryDistanceKm={poi.dist_to_hotel_m / 1000}
                                          className="h-full flex-1 rounded-none border-0 shadow-none"
                                        />
                                      </button>
                                      <div className="border-t border-border bg-muted/30 px-2.5 py-2">
                                        <div className="flex items-center justify-center gap-1.5">
                                          <select
                                            value={selected && assignedDay ? String(assignedDay) : ''}
                                            onChange={(e) => {
                                              const val = e.target.value
                                              if (!val) return
                                              assignPoiToDay(clusterId, poi, Number(val))
                                            }}
                                            aria-label={`Pilih hari untuk ${poi.name}`}
                                            className={`min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-[10px] font-semibold focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-40 ${
                                              selected && assignedDay
                                                ? 'border-primary bg-primary/10 text-primary'
                                                : 'border-border bg-background text-muted-foreground'
                                            }`}
                                          >
                                            <option value="" disabled>
                                              Pilih hari
                                            </option>
                                            {Array.from({ length: plannedDays }, (_, i) => i + 1).map((d) => (
                                              <option key={`poi-day-${poi.poi_id}-${d}`} value={d}>
                                                Hari {d}
                                              </option>
                                            ))}
                                          </select>
                                          <button
                                            type="button"
                                            disabled={!selected}
                                            onClick={() => {
                                              if (selected) togglePOI(clusterId, poi)
                                            }}
                                            title="Batalkan pilihan"
                                            aria-label={`Batalkan pilihan ${poi.name}`}
                                            className={`h-8 w-8 ${BAN_DESTINATION_BUTTON_CLASS}`}
                                          >
                                            <Ban className="h-3.5 w-3.5 text-red-600" aria-hidden />
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            ) : (
                              <div className="overflow-x-auto rounded-xl border border-border">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-border bg-muted/40">
                                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Destinasi</th>
                                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Kategori</th>
                                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Status Hari</th>
                                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Preferensi</th>
                                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Hotel (m)</th>
                                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Halte (m)</th>
                                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Resto</th>
                                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Mini</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border">
                                    {cluster.pois.map((poi) => {
                                      const selected = isPOISelected(clusterId, poi.poi_id)
                                      const assignedDay = poiDayAssignments[poi.poi_id]
                                      return (
                                        <tr key={`table-poi-${clusterId}-${poi.poi_id}`} className={selected ? 'bg-primary/5' : 'hover:bg-muted/20'}>
                                          <td className="px-3 py-2">
                                            <p className="font-semibold text-foreground">{poi.name}</p>
                                          </td>
                                          <td className="px-3 py-2 text-[11px] text-muted-foreground">
                                            {poi.category}
                                            {poi.subcategory ? ` / ${poi.subcategory}` : ''}
                                          </td>
                                          <td className="px-3 py-2">
                                            <select
                                              value={selected && assignedDay ? String(assignedDay) : ''}
                                              onChange={(e) => {
                                                const val = e.target.value
                                                if (val === '') {
                                                  if (selected) togglePOI(clusterId, poi)
                                                  return
                                                }
                                                assignPoiToDay(clusterId, poi, Number(val))
                                              }}
                                              aria-label={`Status hari untuk ${poi.name}`}
                                              className="w-full min-w-[7rem] rounded-lg border border-border bg-background px-2 py-1.5 text-[11px] font-semibold text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                              <option value="">Belum dipilih</option>
                                              {Array.from({ length: plannedDays }, (_, i) => i + 1).map((d) => (
                                                <option key={`table-day-${poi.poi_id}-${d}`} value={d}>
                                                  Hari {d}
                                                </option>
                                              ))}
                                            </select>
                                          </td>
                                          <td className="px-3 py-2 text-right font-mono text-primary">
                                            {formatPreferencePercent(poi.semantic_score)}
                                          </td>
                                          <td className="px-3 py-2 text-right font-mono text-amber-600">{Math.round(poi.dist_to_hotel_m)}</td>
                                          <td className="px-3 py-2 text-right font-mono text-blue-600">{Math.round(poi.dist_to_stop_m)}</td>
                                          <td className="px-3 py-2 text-right font-mono text-orange-600">{poi.resto_count}</td>
                                          <td className="px-3 py-2 text-right font-mono text-violet-600">{poi.minimarket_count}</td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })() : (
                    <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
                      Tidak ada cluster untuk dipilih.
                    </div>
                  )}
                </div>
                </>
                )}

                {destinationPanelTab === 'summary' && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Ringkasan per Hari</p>
                        <p className="text-xs text-muted-foreground">Tinjau urutan destinasi harian dan peta sebaran cluster.</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">Klik peta untuk hari</span>
                          {Array.from({ length: plannedDays }, (_, i) => i + 1).map((d) => (
                            <button
                              key={`summary-target-day-${d}`}
                              type="button"
                              onClick={() => setAssignmentTargetDay(d)}
                              className={`min-w-[2rem] rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                                assignmentTargetDay === d
                                  ? 'bg-primary text-primary-foreground shadow-sm'
                                  : 'border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                              }`}
                            >
                              {d}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowDestinationMap((v) => !v)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-primary bg-background px-3 py-1.5 text-xs font-semibold text-primary shadow-sm transition-colors hover:bg-primary/5"
                        >
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          {showDestinationMap ? 'Sembunyikan peta' : 'Lihat peta'}
                        </button>
                      </div>
                    </div>

                    {showDestinationMap && !mapPoiModal ? (
                      <div className="surface-card w-full overflow-hidden rounded-2xl border border-border shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-primary" />
                            <span className="text-sm font-semibold text-foreground">Peta Cluster Destinasi</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            Arahkan ke marker untuk preview · klik untuk detail destinasi
                          </span>
                        </div>
                        <div className="relative w-full" style={{ minHeight: 360, height: 'min(56vh, 560px)' }}>
                          <MapCluster
                            clusters={clusters}
                            hotel={hotel}
                            selectedPOIs={selectedPOIs}
                            poiDayAssignments={poiDayAssignments}
                            plannedDays={plannedDays}
                            onPoiMarkerClick={handleSummaryMapPoiClick}
                          />
                        </div>
                        <div className="space-y-2 border-t border-border px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Legenda</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                            {Object.entries(clusters).map(([cid]) => (
                              <div key={cid} className="flex items-center gap-1.5">
                                <div
                                  className="h-3 w-3 rounded-full"
                                  style={{ backgroundColor: CLUSTER_COLORS[parseInt(cid, 10) % CLUSTER_COLORS.length] }}
                                />
                                <span className="text-xs text-muted-foreground">Cluster {parseInt(cid, 10) + 1}</span>
                              </div>
                            ))}
                            <div className="flex items-center gap-1.5">
                              <div className="h-3 w-3 rounded-full border border-black/20 bg-yellow-400" />
                              <span className="text-xs text-muted-foreground">Hotel</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <DayItinerarySidebarPanel
                      plannedDays={plannedDays}
                      grouped={groupedSelectedByDay}
                      footer={itinerarySidebarFooter}
                      poiIdToClusterIdx={poiIdToClusterIdx}
                      generationMode={generationMode}
                      onReorderSidebar={handleSidebarReorder}
                      onRemoveSelected={removeSidebarSelectedPoi}
                      onClearDay={clearSelectedDay}
                      hideWideViewButton
                      daysLayout="row"
                      destinationVariant="picker"
                      poiIdToClusterId={poiIdToClusterId}
                      poiDayAssignments={poiDayAssignments}
                      onAssignPoiToDay={assignPoiToDay}
                      onTogglePoi={togglePOI}
                      isPoiSelected={isPOISelected}
                    />
                  </div>
                )}
                  </>
                )}
              </div>
            )}

            {/* --- TAB: ANALISIS GRAFIK --- */}
            {activeTab === 'analysis' && (
              <div className="space-y-6">
                {/* <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-1 rounded-full bg-primary" />
                      <h2 className="font-bold text-foreground">Ringkasan Metrik Clustering</h2>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-xl border border-border bg-muted/20 p-3">
                      <p className="text-[11px] text-muted-foreground">Silhouette</p>
                      <p className="mt-1 text-sm font-bold text-emerald-600">{analysisResult.metrics.silhouette.toFixed(4)}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/20 p-3">
                      <p className="text-[11px] text-muted-foreground">DBI</p>
                      <p className="mt-1 text-sm font-bold text-blue-600">{analysisResult.metrics.dbi.toFixed(4)}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/20 p-3">
                      <p className="text-[11px] text-muted-foreground">WCSS</p>
                      <p className="mt-1 text-sm font-bold text-orange-600">{analysisResult.metrics.wcss.toFixed(4)}</p>
                    </div>
                    <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3">
                      <p className="text-[11px] text-emerald-700/80">K Optimal</p>
                      <p className="mt-1 text-sm font-bold text-emerald-700">{selectedOptimalK}</p>
                    </div>
                  </div>
                </section> */}

                {/* Cluster comparison charts */}
                <section>
                  <div className="flex items-center gap-2 mb-3 pt-4">
                    <div className="w-1 h-5 bg-primary rounded-full" />
                    <h3 className="font-bold text-foreground text-sm">Perbandingan Antar Cluster</h3>
                    <span className="text-xs text-muted-foreground">(Avg fitur per cluster)</span>
                  </div>
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <label htmlFor="analysis-k-min" className="text-xs font-semibold text-muted-foreground">
                      K :
                    </label>
                    <span className="text-[11px] font-medium text-slate-300">min</span>
                    <input
                      id="analysis-k-min"
                      type="number"
                      step={1}
                      value={analysisMinK}
                      onChange={(e) => {
                        const raw = Number(e.target.value)
                        if (!Number.isFinite(raw)) return
                        setAnalysisMinK(Math.max(1, Math.round(raw)))
                      }}
                      placeholder="min"
                      className="h-8 w-20 rounded-md border border-border bg-background px-2 text-sm font-semibold text-foreground placeholder:text-[11px] placeholder:font-medium placeholder:text-slate-300 outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-primary/35"
                    />
                    <span className="text-sm text-muted-foreground">-</span>
                    <span className="text-[11px] font-medium text-slate-300">max</span>
                    <input
                      id="analysis-k-max"
                      type="number"
                      step={1}
                      value={analysisMaxK}
                      onChange={(e) => {
                        const raw = Number(e.target.value)
                        if (!Number.isFinite(raw)) return
                        setAnalysisMaxK(Math.max(1, Math.round(raw)))
                      }}
                      placeholder="max"
                      className="h-8 w-20 rounded-md border border-border bg-background px-2 text-sm font-semibold text-foreground placeholder:text-[11px] placeholder:font-medium placeholder:text-slate-300 outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-primary/35"
                    />
                    <span className="text-[11px] text-muted-foreground">
                      (rentang tersedia 1 - {resolvedKBounds.maxByData})
                    </span>
                  </div>
                  <div className="mb-4">
                    <div className="mb-3 flex items-center gap-2">
                      <div className="w-1 h-5 rounded-full bg-primary" />
                      <h3 className="text-sm font-bold text-foreground">Penentuan K Optimal</h3>
                      <span className="text-xs text-muted-foreground">(Elbow Method + Silhouette)</span>
                    </div>
                    <ElbowChart kAnalysis={chartKAnalysis} optimalK={selectedOptimalK} />
                  </div>
                  {/* <ClusterSummaryBar clusters={analysisResult.clusters} /> */}
                  <div className="mt-4 overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-[15px]">
                      <thead>
                        <tr className="bg-muted/50 border-b border-border">
                          <th className="text-left px-4 py-3 text-sm font-semibold text-muted-foreground">K</th>
                          <th className="text-right px-4 py-3 text-sm font-semibold text-muted-foreground">WCSS</th>
                          <th className="text-right px-4 py-3 text-sm font-semibold text-muted-foreground">Silhouette</th>
                          <th className="text-right px-4 py-3 text-sm font-semibold text-muted-foreground">Status</th>
                          <th className="px-4 py-3" aria-label="Pilih k optimal" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {analysisResult.kMetrics.map((metric) => {
                          const isOptimal = metric.k === derivedOptimalK
                          const isSelected = metric.k === selectedOptimalK
                          return (
                            <tr
                              key={`metric-k-${metric.k}`}
                              className={
                                isOptimal
                                  ? 'bg-emerald-50/70'
                                  : isSelected
                                    ? 'bg-primary/10'
                                    : 'hover:bg-muted/20'
                              }
                            >
                              <td className="px-4 py-3 font-semibold text-foreground">{metric.k}</td>
                              <td className="px-4 py-3 text-right text-red-600 font-mono">
                                {metric.wcss.toFixed(4)}
                              </td>
                              <td className="px-4 py-3 text-right text-blue-600 font-mono">
                                {metric.silhouette.toFixed(4)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {isOptimal ? <span className="text-sm font-semibold text-emerald-600">optimal</span> : null}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end">
                                  <input
                                    type="radio"
                                    name="selected-optimal-k"
                                    checked={isSelected}
                                    onChange={() => setSelectedOptimalK(metric.k)}
                                    className="h-4 w-4 border-border text-primary focus:ring-primary/30"
                                    aria-label={`Pilih K optimal ${metric.k}`}
                                  />
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {analysisResult.kMetrics.length > 0 && analysisResult.baselineKMetrics.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={() => setShowBaselineComparisonTable((prev) => !prev)}
                          className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-primary"
                        >
                          Perbandingan Intelligent K-Means vs K-Means baseline (Buka/Tutup)
                          {showBaselineComparisonTable ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      {showBaselineComparisonTable ? (
                        <div className="overflow-x-auto rounded-xl border border-border">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border bg-muted/40">
                                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">K</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">WCSS (Intelligent)</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">WCSS (Baseline)</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Silhouette (Intelligent)</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Silhouette (Baseline)</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">DBI (Intelligent)</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">DBI (Baseline)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {analysisResult.kMetrics.map((metric) => {
                                const baselineMetric = analysisResult.baselineKMetrics.find((row) => row.k === metric.k)
                                const isOptimal = metric.k === derivedOptimalK
                                return (
                                  <tr key={`baseline-by-k-${metric.k}`} className={isOptimal ? 'bg-emerald-50/50' : 'hover:bg-muted/20'}>
                                    <td className="px-4 py-3 font-semibold text-foreground">{metric.k}</td>
                                    <td className="px-4 py-3 text-right font-mono text-foreground">{metric.wcss.toFixed(4)}</td>
                                    <td className="px-4 py-3 text-right font-mono text-foreground">{Number(baselineMetric?.wcss ?? 0).toFixed(4)}</td>
                                    <td className="px-4 py-3 text-right font-mono text-foreground">{metric.silhouette.toFixed(4)}</td>
                                    <td className="px-4 py-3 text-right font-mono text-foreground">{Number(baselineMetric?.silhouette ?? 0).toFixed(4)}</td>
                                    <td className="px-4 py-3 text-right font-mono text-foreground">{metric.dbi.toFixed(4)}</td>
                                    <td className="px-4 py-3 text-right font-mono text-foreground">{Number(baselineMetric?.dbi ?? 0).toFixed(4)}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {FEATURE_CONFIGS.map((feature) => (
                      <div key={`analysis-feature-${feature.key}`} className="rounded-xl border border-border bg-card p-3 shadow-sm">
                        <p className="mb-2 text-[11px] font-semibold text-foreground">
                          {feature.label} (K max={resolvedKBounds.maxK})
                        </p>
                        <ResponsiveContainer width="100%" height={135}>
                          <BarChart data={analysisFeatureChartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="cluster" />
                            <YAxis />
                            <Tooltip formatter={(value: number) => feature.formatter(Number(value))} />
                            <Bar dataKey={feature.key} fill={feature.color} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ))}
                  </div>
                </section>

                {/* K optimal explanation */}
                <section className="bg-card rounded-2xl border border-border p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1 h-5 bg-primary rounded-full" />
                    <h3 className="font-bold text-foreground text-sm">Ringkasan Hasil Clustering</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* WCSS */}
                    <div className="bg-muted/30 rounded-xl p-4 text-center">
                      <p className="text-xs text-muted-foreground mb-1">WCSS (Fungsi Objektif)</p>
                      <p className="text-[1.7rem] font-bold text-red-600">{analysisResult.metrics.wcss.toFixed(4)}</p>
                    </div>
                    {/* Silhouette */}
                    <div className="bg-muted/30 rounded-xl p-4 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Silhouette Score</p>
                      <p className="text-[1.7rem] font-bold text-primary">{analysisResult.metrics.silhouette.toFixed(4)}</p>
                    </div>
                    {/* DBI */}
                    <div className="bg-muted/30 rounded-xl p-4 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Davies-Bouldin Index</p>
                      <p className="text-[1.7rem] font-bold text-blue-600">{analysisResult.metrics.dbi.toFixed(4)}</p>
                    </div>
                    {/* Iterations */}
                    <div className="bg-muted/30 rounded-xl p-4 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Iterasi Konvergensi</p>
                      <p className="text-[1.7rem] font-bold text-orange-600">{analysisResult.metrics.iterations}</p>
                      <p className="text-xs text-muted-foreground mt-1">toleransi &lt; 1e-4</p>
                    </div>
                  </div>

                </section>

                {/* Per-cluster detail table */}
                <section className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-border">
                    <h3 className="font-bold text-foreground text-sm">Detail Ringkasan per Cluster</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Statistik agregat setelah konvergensi K-Means</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/40 border-b border-border">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Cluster</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Jumlah POI</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Avg Lat</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Avg Lon</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Avg Skor Semantik</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Avg Jarak Hotel (m)</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Avg Jarak Halte (m)</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Avg Restoran</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Avg Minimarket</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Kategori Dominan</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {Object.entries(analysisResult.clusters).map(([cid, cluster]) => {
                          const cidx = parseInt(cid) % CLUSTER_COLORS.length
                          const count = cluster.pois.length || 1
                          const avgLat = cluster.pois.reduce((acc, poi) => acc + poi.latitude, 0) / count
                          const avgLon = cluster.pois.reduce((acc, poi) => acc + poi.longitude, 0) / count
                          const avgHotel = cluster.pois.reduce((acc, poi) => acc + poi.dist_to_hotel_m, 0) / count
                          const avgMinimarket = cluster.pois.reduce((acc, poi) => acc + poi.minimarket_count, 0) / count
                          const isExpanded = expandedAnalysisClusterId === cid
                          return (
                            <>
                            <tr key={cid} className="hover:bg-muted/20 transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2 whitespace-nowrap">
                                  <div
                                    className="w-3 h-3 rounded-full shrink-0"
                                    style={{ backgroundColor: CLUSTER_COLORS[cidx] }}
                                  />
                                  <span className="whitespace-nowrap font-semibold text-foreground">Cluster {parseInt(cid, 10) + 1}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-foreground">
                                {cluster.summary.member_count}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-foreground">
                                {avgLat.toFixed(5)}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-foreground">
                                {avgLon.toFixed(5)}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-primary font-semibold">
                                {cluster.summary.avg_semantic_score.toFixed(4)}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-amber-600">
                                {Math.round(avgHotel)}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-blue-600">
                                {Math.round(cluster.summary.avg_dist_to_stop_m)}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-orange-600">
                                {cluster.summary.avg_resto_count.toFixed(1)}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-violet-600">
                                {avgMinimarket.toFixed(2)}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${CLUSTER_BADGE[cidx]}`}>
                                  {cluster.summary.dominant_category}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => setExpandedAnalysisClusterId((prev) => (prev === cid ? null : cid))}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
                                  title={isExpanded ? 'Sembunyikan detail' : 'Lihat detail'}
                                  aria-label={isExpanded ? 'Sembunyikan detail' : 'Lihat detail'}
                                >
                                  {isExpanded ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
                                </button>
                              </td>
                            </tr>
                            {isExpanded ? (
                              <tr key={`detail-${cid}`} className="bg-muted/10">
                                <td colSpan={11} className="px-4 py-3">
                                    <div className="overflow-x-auto rounded-xl border border-border bg-background">
                                      <table className="w-full text-sm">
                                        <thead>
                                          <tr className="bg-muted/50 border-b border-border">
                                            <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Destinasi</th>
                                            <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Kategori</th>
                                            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Lat</th>
                                            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Lon</th>
                                            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Semantik</th>
                                            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Hotel (m)</th>
                                            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Halte (m)</th>
                                            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Resto</th>
                                            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Mini</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                          {cluster.pois.map((poi) => (
                                            <tr key={`cluster-${cid}-poi-${poi.poi_id}`} className="hover:bg-muted/20 transition-colors">
                                              <td className="px-3 py-2 text-xs font-semibold text-foreground">{poi.name}</td>
                                              <td className="px-3 py-2 text-xs text-muted-foreground">
                                                {poi.category}
                                                {poi.subcategory ? ` / ${poi.subcategory}` : ''}
                                              </td>
                                              <td className="px-3 py-2 text-right text-xs font-mono text-foreground">{poi.latitude.toFixed(5)}</td>
                                              <td className="px-3 py-2 text-right text-xs font-mono text-foreground">{poi.longitude.toFixed(5)}</td>
                                              <td className="px-3 py-2 text-right text-xs font-mono text-primary">{poi.semantic_score.toFixed(4)}</td>
                                              <td className="px-3 py-2 text-right text-xs font-mono text-amber-600">{Math.round(poi.dist_to_hotel_m)}</td>
                                              <td className="px-3 py-2 text-right text-xs font-mono text-blue-600">{Math.round(poi.dist_to_stop_m)}</td>
                                              <td className="px-3 py-2 text-right text-xs font-mono text-orange-600">{poi.resto_count}</td>
                                              <td className="px-3 py-2 text-right text-xs font-mono text-violet-600">{poi.minimarket_count}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                            </>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-border">
                    <h3 className="font-bold text-foreground text-sm">Ringkasan Z-Score per Cluster</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Nilai sudah ternormalisasi (hasil z-score).</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/40 border-b border-border">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Cluster</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Lat Z</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Lon Z</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Semantic Z</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Hotel Z</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Halte Z</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Resto Z</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Minimarket Z</th>
                          <th className="px-4 py-3" aria-label="Aksi detail z-score" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {analysisResult.zscoreRows.map((row, idx) => {
                          const cid = String(idx)
                          const isExpanded = expandedZScoreClusterId === cid
                          return (
                            <>
                              <tr key={`z-${row.cluster}`} className="hover:bg-muted/20 transition-colors">
                                <td className="px-4 py-3 font-semibold text-foreground">{row.cluster}</td>
                                <td className="px-4 py-3 text-right font-mono">{row.latitude.toFixed(3)}</td>
                                <td className="px-4 py-3 text-right font-mono">{row.longitude.toFixed(3)}</td>
                                <td className="px-4 py-3 text-right font-mono">{row.semantic_score.toFixed(3)}</td>
                                <td className="px-4 py-3 text-right font-mono">{row.dist_to_hotel_m.toFixed(3)}</td>
                                <td className="px-4 py-3 text-right font-mono">{row.dist_to_stop_m.toFixed(3)}</td>
                                <td className="px-4 py-3 text-right font-mono">{row.resto_count.toFixed(3)}</td>
                                <td className="px-4 py-3 text-right font-mono">{row.minimarket_count.toFixed(3)}</td>
                                <td className="px-4 py-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedZScoreClusterId((prev) => (prev === cid ? null : cid))}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
                                    title={isExpanded ? 'Sembunyikan detail z-score' : 'Lihat detail z-score'}
                                    aria-label={isExpanded ? 'Sembunyikan detail z-score' : 'Lihat detail z-score'}
                                  >
                                    {isExpanded ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
                                  </button>
                                </td>
                              </tr>
                              {isExpanded ? (
                                <tr key={`z-detail-${cid}`} className="bg-muted/10">
                                  <td colSpan={9} className="px-4 py-3">
                                    <div className="overflow-x-auto rounded-xl border border-border bg-background">
                                      <table className="w-full text-sm">
                                        <thead>
                                          <tr className="bg-muted/50 border-b border-border">
                                            <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Destinasi</th>
                                            <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Kategori</th>
                                            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Lat Z</th>
                                            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Lon Z</th>
                                            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Semantic Z</th>
                                            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Hotel Z</th>
                                            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Halte Z</th>
                                            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Resto Z</th>
                                            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Minimarket Z</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                          {(analysisResult.zscoreDetails[cid] ?? []).map((detail) => (
                                            <tr key={`z-row-${cid}-${detail.poi_id}`} className="hover:bg-muted/20 transition-colors">
                                              <td className="px-3 py-2 text-xs font-semibold text-foreground">{detail.name}</td>
                                              <td className="px-3 py-2 text-xs text-muted-foreground">
                                                {detail.category}
                                                {detail.subcategory ? ` / ${detail.subcategory}` : ''}
                                              </td>
                                              <td className="px-3 py-2 text-right text-xs font-mono">{detail.latitude.toFixed(3)}</td>
                                              <td className="px-3 py-2 text-right text-xs font-mono">{detail.longitude.toFixed(3)}</td>
                                              <td className="px-3 py-2 text-right text-xs font-mono">{detail.semantic_score.toFixed(3)}</td>
                                              <td className="px-3 py-2 text-right text-xs font-mono">{detail.dist_to_hotel_m.toFixed(3)}</td>
                                              <td className="px-3 py-2 text-right text-xs font-mono">{detail.dist_to_stop_m.toFixed(3)}</td>
                                              <td className="px-3 py-2 text-right text-xs font-mono">{detail.resto_count.toFixed(3)}</td>
                                              <td className="px-3 py-2 text-right text-xs font-mono">{detail.minimarket_count.toFixed(3)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </td>
                                </tr>
                              ) : null}
                            </>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      </main>

      {loading && <LoadingSpinner message="Menyusun rute optimal..." />}

      {mapPoiModal && (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/55 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="map-poi-modal-title"
          onClick={() => setMapPoiModal(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const { poi, clusterId } = mapPoiModal
              const cidx = parseInt(clusterId, 10) % CLUSTER_COLORS.length
              const accent = CLUSTER_COLORS[cidx]
              const selectedInModal = isPOISelected(clusterId, poi.poi_id)
              const assignedDay = poiDayAssignments[poi.poi_id]

              return (
                <>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Cluster {parseInt(clusterId, 10) + 1}
                      </p>
                      <h2 id="map-poi-modal-title" className="text-lg font-bold leading-snug text-foreground">
                        {poi.name}
                      </h2>
                    </div>
                    <button
                      type="button"
                      className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label="Tutup"
                      onClick={() => setMapPoiModal(null)}
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <DestinationItineraryCard
                    poi={poi}
                    accentColor={accent}
                    orderBadge={1}
                    distanceMode="from_hotel"
                    primaryDistanceKm={poi.dist_to_hotel_m / 1000}
                    className="shadow-none"
                  />

                  <dl className="mt-4 space-y-2.5 text-sm">
                    <div className="flex justify-between gap-3 border-b border-border/60 pb-2">
                      <dt className="shrink-0 text-muted-foreground">Kategori</dt>
                      <dd className="text-right font-medium text-foreground">
                        {poi.category}
                        {poi.subcategory ? ` · ${poi.subcategory}` : ''}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3 border-b border-border/60 pb-2">
                      <dt className="shrink-0 text-muted-foreground">Wilayah</dt>
                      <dd className="text-right font-medium text-foreground">{poi.district || '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-3 pb-1">
                      <dt className="shrink-0 text-muted-foreground">Preferensi</dt>
                      <dd className="text-right font-semibold text-primary">
                        {(poi.semantic_score * 100).toFixed(1)}%
                      </dd>
                    </div>
                  </dl>

                  {poi.description ? (
                    <div className="mt-4 rounded-lg border border-border/70 bg-muted/25 p-3">
                      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                        Deskripsi
                      </p>
                      <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{poi.description}</p>
                    </div>
                  ) : null}

                  <div className="mt-4 rounded-xl border border-border bg-muted/30 px-3 py-3">
                    <p className="mb-2 text-[11px] font-semibold text-muted-foreground">Pilih hari itinerary</p>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={selectedInModal && assignedDay ? String(assignedDay) : ''}
                        onChange={(e) => {
                          const val = e.target.value
                          if (val === '') {
                            if (selectedInModal) togglePOI(clusterId, poi)
                            return
                          }
                          assignPoiToDay(clusterId, poi, Number(val))
                        }}
                        aria-label={`Pilih hari untuk ${poi.name}`}
                        className={`min-w-0 flex-1 rounded-lg border px-2.5 py-2 text-xs font-semibold focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-40 ${
                          selectedInModal && assignedDay
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-background text-muted-foreground'
                        }`}
                      >
                        <option value="">Belum dipilih</option>
                        {Array.from({ length: plannedDays }, (_, i) => i + 1).map((d) => (
                          <option key={`modal-day-${poi.poi_id}-${d}`} value={d}>
                            Hari {d}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!selectedInModal}
                        onClick={() => {
                          if (selectedInModal) togglePOI(clusterId, poi)
                        }}
                        title="Batalkan pilihan"
                        aria-label={`Batalkan pilihan ${poi.name}`}
                        className={`h-9 w-9 ${BAN_DESTINATION_BUTTON_CLASS}`}
                      >
                        <Ban className="h-4 w-4 text-red-600" aria-hidden />
                      </button>
                    </div>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </>
  )
}
