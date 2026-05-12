'use client'

import dynamic from 'next/dynamic'
import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronDown,
  ChevronUp,
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
} from 'lucide-react'
import Navbar from '@/components/wisata/Navbar'
import MetricsCard from '@/components/wisata/MetricsCard'
import LoadingSpinner from '@/components/wisata/LoadingSpinner'
import ElbowChart from '@/components/wisata/ElbowChart'
import DestinationItineraryCard from '@/components/wisata/DestinationItineraryCard'
import { optimizeRoute } from '@/lib/api'
import type { ClusterResponse, HotelLocation, EnrichedPOI } from '@/lib/types'
import { MOCK_ROUTES } from '@/lib/mockData'
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

type ActiveTab = 'clusters' | 'analysis'
type GenerationMode = 'manual' | 'auto'
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

const CLUSTER_SELECTION_DRAFT_KEY = 'clusterSelectionDraft'

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
  onOpenWideView,
  hideWideViewButton,
  spreadDaysLayout,
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
  onOpenWideView?: () => void
  hideWideViewButton?: boolean
  spreadDaysLayout?: boolean
}) {
  const MIME = 'application/x-cluster-sidebar-poi'
  const showWideBtn = Boolean(onOpenWideView) && !hideWideViewButton

  return (
    <div className={`surface-card rounded-xl border border-border p-4 shadow-sm ${className}`.trim()}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <h3 className="text-sm font-bold text-foreground">Ringkasan per hari</h3>
        </div>
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
      </div>
      <div className={spreadDaysLayout ? 'grid gap-3 sm:grid-cols-2' : 'space-y-3'}>
        {Array.from({ length: plannedDays }, (_, i) => i + 1).map((day) => {
          const stripeColor = CLUSTER_COLORS[(day - 1) % CLUSTER_COLORS.length]
          const list = grouped[day] ?? []
          const dndLocked = generationMode === 'auto'

          return (
            <div key={day} className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
              <div
                className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white"
                style={{ backgroundColor: stripeColor }}
              >
                Hari {day}
              </div>
              <div
                className="max-h-[min(420px,60vh)] overflow-y-auto p-2"
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
                    Seret destinasi dari hari lain ke sini untuk memindahkan hari.
                  </p>
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
      {footer}
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
  const [expandedCluster, setExpandedCluster] = useState<string | null>('0')
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<ActiveTab>('clusters')
  const [showDestinationMap, setShowDestinationMap] = useState(false)
  const [mapPoiModal, setMapPoiModal] = useState<{ clusterId: string; poi: EnrichedPOI } | null>(null)
  const [generationMode, setGenerationMode] = useState<GenerationMode>('manual')
  const [dailyDestinationLimit, setDailyDestinationLimit] = useState(4)
  const [selectedAnalysisK, setSelectedAnalysisK] = useState(2)
  const [assignmentTargetDay, setAssignmentTargetDay] = useState(1)
  const [sidebarDaySequences, setSidebarDaySequences] = useState<Record<number, number[]>>({})
  const [wideItineraryOpen, setWideItineraryOpen] = useState(false)

  useEffect(() => {
    const raw = sessionStorage.getItem('clusterData')
    const rawHotel = sessionStorage.getItem('hotelLocation')
    const rawNumDays = sessionStorage.getItem('numDays')
    if (!raw) {
      router.push('/')
      return
    }

    let parsed: ClusterResponse
    try {
      parsed = JSON.parse(raw) as ClusterResponse
    } catch {
      router.push('/')
      return
    }

    if (!parsed.clusters || typeof parsed.clusters !== 'object' || !parsed.evaluation) {
      router.push('/')
      return
    }

    const days = rawNumDays
      ? Math.max(1, Math.min(MAX_PLANNED_TRIP_DAYS, Number(rawNumDays) || 3))
      : 3
    const rawDailyLimit = sessionStorage.getItem('dailyDestinationLimit')
    const parsedDailyLimit = rawDailyLimit ? Number(rawDailyLimit) : 4
    const safeDailyLimit = Number.isFinite(parsedDailyLimit)
      ? Math.max(1, Math.min(12, Math.round(parsedDailyLimit)))
      : 4
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
    setExpandedCluster(clusterIdsSorted[0] ?? null)

    const rawGenerationMode = sessionStorage.getItem('generationMode')
    if (rawGenerationMode === 'manual' || rawGenerationMode === 'auto') {
      setGenerationMode(rawGenerationMode)
    }
    setSelectedAnalysisK(parsed.evaluation.k_optimal)
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

  useEffect(() => {
    if (activeTab !== 'clusters') setWideItineraryOpen(false)
  }, [activeTab])

  useEffect(() => {
    if (!wideItineraryOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setWideItineraryOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [wideItineraryOpen])

  const handleSidebarReorder = useCallback(
    (
      payload:
        | { type: 'reorder'; day: number; fromIndex: number; toIndex: number }
        | { type: 'move'; poiId: number; fromDay: number; toDay: number; toIndex: number },
    ) => {
      if (generationMode === 'auto') return
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
    [generationMode, plannedDays],
  )

  const removeSidebarSelectedPoi = useCallback(
    (poiId: number) => {
      if (generationMode === 'auto') return
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
    [generationMode, plannedDays],
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

  const openMapDestinationModal = (clusterId: string, poi: EnrichedPOI) => {
    setMapPoiModal({ clusterId, poi })
  }

  const effectiveAssignmentDay = Math.min(assignmentTargetDay, plannedDays)

  const isPOISelected = (clusterId: string, poiId: number) =>
    (selectedPOIs[clusterId] || []).some((p) => p.poi_id === poiId)

  const totalSelected = Object.values(selectedPOIs).reduce((s, arr) => s + arr.length, 0)
  const totalPOIs = clusterData
    ? Object.values(clusterData.clusters).reduce((s, c) => s + c.pois.length, 0)
    : 0

  const clusters = clusterData?.clusters ?? {}

  const poiIdToClusterIdx = useMemo(() => {
    const m = new Map<number, number>()
    Object.entries(clusters).forEach(([cid, c]) => {
      const n = parseInt(cid, 10)
      const ci = Number.isFinite(n) ? n % CLUSTER_COLORS.length : 0
      c.pois.forEach((p) => m.set(p.poi_id, ci))
    })
    return m
  }, [clusters])

  const allPois = useMemo(
    () => Object.values(clusters).flatMap((cluster) => cluster.pois),
    [clusters],
  )

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
    if (!hotel) return
    if (generationMode === 'manual' && totalSelected === 0) return
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
        Object.assign(allRoutes, MOCK_ROUTES)
      }
      sessionStorage.setItem('routeData', JSON.stringify(allRoutes))
      sessionStorage.setItem('selectedPOIs', JSON.stringify(effectiveSelectedPOIs))
      sessionStorage.setItem('poiDayAssignments', JSON.stringify(effectiveAssignments))
      sessionStorage.setItem('generationMode', generationMode)
      router.push('/itinerary')
    } catch {
      sessionStorage.setItem('routeData', JSON.stringify(MOCK_ROUTES))
      sessionStorage.setItem('selectedPOIs', JSON.stringify(selectedPOIs))
      sessionStorage.setItem('poiDayAssignments', JSON.stringify(poiDayAssignments))
      sessionStorage.setItem('generationMode', generationMode)
      router.push('/itinerary')
    } finally {
      setLoading(false)
    }
  }

  const itinerarySidebarFooter = (
    <div className="mt-4 border-t border-border pt-4">
      <button
        type="button"
        onClick={handleCreateItinerary}
        disabled={(generationMode === 'manual' && totalSelected === 0) || loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
      >
        {generationMode === 'auto' ? 'Auto Generate Itinerary' : 'Buat Itinerary'}
        <ArrowRight className="h-4 w-4 shrink-0" />
      </button>
    </div>
  )

  const analysisResult = useMemo(() => {
    if (allPois.length === 0) {
      return { clusters: {}, zscoreRows: [] as ZScoreRow[] }
    }

    const k = Math.max(2, Math.min(selectedAnalysisK, allPois.length))
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
    const centroids = Array.from({ length: k }, (_, idx) => {
      const sourceIndex = Math.floor((idx * (zVectors.length - 1)) / Math.max(1, k - 1))
      return [...zVectors[sourceIndex]]
    })

    let assignments = Array(zVectors.length).fill(0)
    for (let iteration = 0; iteration < 25; iteration += 1) {
      let changed = false
      assignments = zVectors.map((vec, currentIdx) => {
        let bestCluster = 0
        let bestDist = Number.POSITIVE_INFINITY
        for (let c = 0; c < k; c += 1) {
          const dist = distanceSquared(vec, centroids[c])
          if (dist < bestDist) {
            bestDist = dist
            bestCluster = c
          }
        }
        if (assignments[currentIdx] !== bestCluster) changed = true
        return bestCluster
      })

      const sums = Array.from({ length: k }, () => Array(FEATURE_KEYS.length).fill(0))
      const counts = Array(k).fill(0)
      assignments.forEach((clusterIdx, vecIdx) => {
        counts[clusterIdx] += 1
        for (let j = 0; j < FEATURE_KEYS.length; j += 1) {
          sums[clusterIdx][j] += zVectors[vecIdx][j]
        }
      })
      for (let c = 0; c < k; c += 1) {
        if (counts[c] === 0) continue
        for (let j = 0; j < FEATURE_KEYS.length; j += 1) {
          centroids[c][j] = sums[c][j] / counts[c]
        }
      }
      if (!changed) break
    }

    const groupedPois: Record<string, EnrichedPOI[]> = {}
    const groupedZVectors: Record<string, number[][]> = {}
    for (let c = 0; c < k; c += 1) {
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
    for (let c = 0; c < k; c += 1) {
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
    }

    return { clusters: derivedClusters, zscoreRows }
  }, [allPois, selectedAnalysisK])

  const analysisFeatureChartData = useMemo(() => {
    return Object.entries(analysisResult.clusters).map(([clusterId, cluster]) => {
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
  }, [analysisResult.clusters])

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

  const { evaluation, k_analysis } = clusterData

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

        <div className="app-container space-y-6 py-6">

          {/* === SECTION 1: EVALUATION METRICS === */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-5 bg-primary rounded-full" />
              <h2 className="font-bold text-foreground">Metrik Evaluasi Clustering</h2>
            </div>
            {/* <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-center shadow-sm">
                <p className="text-xs text-muted-foreground">Silhouette Optimal</p>
                <p className="mt-1 text-2xl font-bold text-primary">{evaluation.silhouette_score.toFixed(4)}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">K optimal = {evaluation.k_optimal}</p>
              </div>
            </div> */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-foreground">Durasi (hari):</span>
              <div className="flex flex-wrap gap-1" role="group" aria-label="Jumlah hari itinerary">
                {Array.from({ length: MAX_PLANNED_TRIP_DAYS }, (_, i) => i + 1).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setPlannedDays(d)
                      sessionStorage.setItem('numDays', String(d))
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
            <MetricsCard evaluation={evaluation} />
          </section>

          {/* {baseline_evaluation && (
            <AlgorithmComparison intelligent={evaluation} baseline={baseline_evaluation} />
          )} */}

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

          {/* === SECTION 3: TABS (Clusters | Analysis) === */}
          <div>
            <div className="flex gap-1 bg-muted rounded-xl p-1 w-fit mb-5">
              <button
                onClick={() => setActiveTab('clusters')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === 'clusters'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  Cluster Destinasi
                </span>
              </button>
              <button
                onClick={() => setActiveTab('analysis')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === 'analysis'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <BarChart2 className="w-3.5 h-3.5" />
                  Analisis Grafik
                </span>
              </button>
            </div>

            {/* --- TAB: CLUSTER DESTINASI --- */}
            {activeTab === 'clusters' && (
              <div className="space-y-6">
                {/* Summary + kontrol */}
                <div className="surface-card grid grid-cols-1 gap-3 rounded-xl px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-4">
                  <div className="flex flex-wrap items-center gap-2 justify-self-start">
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
                          disabled={generationMode === 'auto'}
                          onClick={() => setAssignmentTargetDay(d)}
                          title={`Masukkan ke dalam hari ${d}`}
                          className={`min-w-[2rem] rounded-lg px-2.5 py-1 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
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

                  <div className="flex justify-end justify-self-end">
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

                {/* Peta selebar kontainer utama */}
                {showDestinationMap && (
                  <div className="surface-card w-full max-w-none overflow-hidden rounded-2xl border border-border shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold text-foreground">Peta Cluster Destinasi</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{Object.keys(clusters).length} cluster</span>
                    </div>
                    <div className="relative w-full" style={{ minHeight: 360, height: 'min(56vh, 560px)' }}>
                      <MapCluster
                        clusters={clusters}
                        hotel={hotel}
                        selectedPOIs={selectedPOIs}
                        poiDayAssignments={poiDayAssignments}
                        plannedDays={plannedDays}
                        onPoiMarkerClick={openMapDestinationModal}
                      />
                      {mapPoiModal && (
                        <div
                          className="pointer-events-auto absolute inset-0 z-[520] flex flex-col items-center justify-center gap-2 bg-background/75 px-4 text-center backdrop-blur-[3px]"
                          aria-hidden={false}
                        >
                          <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-lg">
                            <p className="text-sm font-semibold text-foreground">Detail destinasi — tutup kartu atau klik di luar untuk kembali ke peta</p>
                          </div>
                        </div>
                      )}
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
                )}

                <DayItinerarySidebarPanel
                  plannedDays={plannedDays}
                  grouped={groupedSelectedByDay}
                  className="xl:hidden"
                  footer={itinerarySidebarFooter}
                  poiIdToClusterIdx={poiIdToClusterIdx}
                  generationMode={generationMode}
                  onReorderSidebar={handleSidebarReorder}
                  onRemoveSelected={removeSidebarSelectedPoi}
                  onOpenWideView={() => setWideItineraryOpen(true)}
                />

                {/* Daftar cluster + ringkasan hari (desktop) */}
                <div className="xl:grid xl:grid-cols-12 xl:items-start xl:gap-6">
                  <div className="space-y-4 xl:col-span-8">
                  {Object.entries(clusters).map(([clusterId, cluster]) => {
                    const cidx = parseInt(clusterId) % CLUSTER_COLORS.length
                    const color = CLUSTER_COLORS[cidx]
                    const isExpanded = expandedCluster === clusterId
                    const selectedCount = (selectedPOIs[clusterId] || []).length
                    const allSelected = selectedCount === cluster.pois.length
                    const someSelected = selectedCount > 0 && selectedCount < cluster.pois.length
                    const nPoi = Math.max(cluster.pois.length, 1)
                    const avgDistHotelM =
                      cluster.pois.reduce((sum, p) => sum + p.dist_to_hotel_m, 0) / nPoi

                    return (
                      <div key={clusterId} className="surface-card overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: color }}>
                        {/* --- Cluster Header --- */}
                        <div className="flex items-center">
                          <button
                            className="flex-1 p-4 flex items-center justify-between hover:bg-muted/30 transition-colors text-left"
                            onClick={() => setExpandedCluster(isExpanded ? null : clusterId)}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-base shrink-0"
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
                                  {cluster.summary.member_count} destinasi &bull; Skor avg {cluster.summary.avg_semantic_score.toFixed(3)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
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
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                              )}
                            </div>
                          </button>
                        </div>

                        {/* --- Cluster Stats Row --- */}
                        <div
                          className={`px-4 py-2.5 grid grid-cols-2 gap-2 text-center border-t border-border sm:grid-cols-3 lg:grid-cols-5 ${CLUSTER_BG[cidx]}`}
                        >
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
                            <p className="text-sm font-bold text-orange-600">
                              {cluster.summary.avg_resto_count.toFixed(1)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground leading-tight">Minimarket (avg)</p>
                            <p className="text-sm font-bold text-violet-600">
                              {(
                                cluster.pois.reduce((s, p) => s + p.minimarket_count, 0) / nPoi
                              ).toFixed(1)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground leading-tight">Jumlah POI</p>
                            <p className="text-sm font-bold text-foreground">{cluster.summary.member_count}</p>
                          </div>
                        </div>

                        {/* --- POI List (Expandable) --- */}
                        {isExpanded && (
                          <div className="border-t border-border">
                            {/* Select all row */}
                            <div className="flex items-center justify-between px-4 py-2 bg-muted/20 border-b border-border">
                              <p className="text-xs text-muted-foreground">Pilih destinasi dari Cluster {parseInt(clusterId, 10) + 1}:</p>
                              <button
                                onClick={() => toggleAllInCluster(clusterId, cluster.pois)}
                                disabled={generationMode === 'auto'}
                                className="text-xs font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50"
                              >
                                {allSelected ? 'Batalkan Semua' : 'Pilih Semua'}
                              </button>
                            </div>

                            <div className="max-h-[32rem] overflow-y-auto p-3">
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {cluster.pois.map((poi, idx) => {
                                  const selected = isPOISelected(clusterId, poi.poi_id)
                                  const toggleThis = () => {
                                    if (generationMode === 'manual') togglePOI(clusterId, poi)
                                  }
                                  return (
                                    <button
                                      key={poi.poi_id}
                                      type="button"
                                      aria-pressed={selected}
                                      aria-label={
                                        selected
                                          ? `Batalkan pemilihan ${poi.name}`
                                          : `Pilih ${poi.name} untuk hari ke-${assignmentTargetDay}`
                                      }
                                      disabled={generationMode === 'auto'}
                                      onClick={toggleThis}
                                      className={`w-full overflow-hidden rounded-xl border-2 p-0 text-left outline-none ring-offset-background transition-all focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 ${
                                        selected
                                          ? 'border-primary bg-primary/5 shadow-sm ring-2 ring-primary/25'
                                          : 'border-border hover:border-border/70 hover:bg-muted/20'
                                      } ${generationMode === 'auto' ? 'cursor-not-allowed opacity-85' : 'cursor-pointer'}`}
                                    >
                                      <DestinationItineraryCard
                                        poi={poi}
                                        accentColor={color}
                                        orderBadge={idx + 1}
                                        distanceMode="from_hotel"
                                        primaryDistanceKm={poi.dist_to_hotel_m / 1000}
                                        className="rounded-none border-0 shadow-none"
                                      />
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  </div>

                  <DayItinerarySidebarPanel
                    plannedDays={plannedDays}
                    grouped={groupedSelectedByDay}
                    className="hidden xl:block xl:col-span-4 xl:sticky xl:top-24 xl:self-start"
                    footer={itinerarySidebarFooter}
                    poiIdToClusterIdx={poiIdToClusterIdx}
                    generationMode={generationMode}
                    onReorderSidebar={handleSidebarReorder}
                    onRemoveSelected={removeSidebarSelectedPoi}
                    onOpenWideView={() => setWideItineraryOpen(true)}
                  />
                </div>
              </div>
            )}

            {/* --- TAB: ANALISIS GRAFIK --- */}
            {activeTab === 'analysis' && (
              <div className="space-y-6">
                {/* Elbow & Silhouette charts */}
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1 h-5 bg-primary rounded-full" />
                    <h3 className="font-bold text-foreground text-sm">Penentuan K Optimal</h3>
                    <span className="text-xs text-muted-foreground">(Elbow Method + Silhouette)</span>
                  </div>
                  <ElbowChart kAnalysis={k_analysis} optimalK={evaluation.k_optimal} />
                </section>

                {/* Cluster comparison charts */}
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1 h-5 bg-primary rounded-full" />
                    <h3 className="font-bold text-foreground text-sm">Perbandingan Antar Cluster</h3>
                    <span className="text-xs text-muted-foreground">(Avg fitur per cluster)</span>
                  </div>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">Klik K untuk ubah ringkasan:</span>
                    {k_analysis.k_range.map((k) => (
                      <button
                        key={`selector-${k}`}
                        type="button"
                        onClick={() => setSelectedAnalysisK(k)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                          selectedAnalysisK === k
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        K={k}
                      </button>
                    ))}
                  </div>
                  {/* <ClusterSummaryBar clusters={analysisResult.clusters} /> */}
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {FEATURE_CONFIGS.map((feature) => (
                      <div key={`analysis-feature-${feature.key}`} className="rounded-xl border border-border bg-card p-3 shadow-sm">
                        <p className="mb-2 text-[11px] font-semibold text-foreground">{feature.label} (K={selectedAnalysisK})</p>
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
                      <p className="text-2xl font-bold text-red-600">{evaluation.wcss.toFixed(4)}</p>
                    </div>
                    {/* Silhouette */}
                    <div className="bg-muted/30 rounded-xl p-4 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Silhouette Score</p>
                      <p className="text-2xl font-bold text-primary">{evaluation.silhouette_score.toFixed(4)}</p>
                    </div>
                    {/* DBI */}
                    <div className="bg-muted/30 rounded-xl p-4 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Davies-Bouldin Index</p>
                      <p className="text-2xl font-bold text-blue-600">{evaluation.davies_bouldin_index.toFixed(4)}</p>
                    </div>
                    {/* Iterations */}
                    <div className="bg-muted/30 rounded-xl p-4 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Iterasi Konvergensi</p>
                      <p className="text-2xl font-bold text-orange-600">{evaluation.iterations}</p>
                      <p className="text-xs text-muted-foreground mt-1">toleransi &lt; 1e-4</p>
                    </div>
                  </div>

                  {/* K analysis table */}
                  <div className="mt-5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Tabel Nilai K vs Metrik
                    </p>
                    <div className="overflow-x-auto rounded-xl border border-border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/50 border-b border-border">
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">K (Cluster)</th>
                            <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">WCSS</th>
                            <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Silhouette</th>
                            <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {k_analysis.k_range.map((k, i) => {
                            const isOptimal = k === evaluation.k_optimal
                            const isSelected = k === selectedAnalysisK
                            return (
                              <tr
                                key={k}
                                onClick={() => setSelectedAnalysisK(k)}
                                className={`${isSelected ? 'bg-primary/10' : isOptimal ? 'bg-primary/5' : 'hover:bg-muted/20'} cursor-pointer`}
                              >
                                <td className="px-4 py-2.5 font-semibold text-foreground">
                                  K = {k}
                                  {isOptimal && (
                                    <span className="ml-2 text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                                      Optimal
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-right text-red-600 font-mono">
                                  {k_analysis.wcss_values[i].toFixed(4)}
                                </td>
                                <td className="px-4 py-2.5 text-right text-blue-600 font-mono">
                                  {k_analysis.silhouette_values[i].toFixed(4)}
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                  {isSelected ? (
                                    <span className="text-xs text-primary font-semibold flex items-center justify-end gap-1">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      Aktif
                                    </span>
                                  ) : isOptimal ? (
                                    <span className="text-xs text-primary font-semibold flex items-center justify-end gap-1">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      Dipilih
                                    </span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">-</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
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
                          return (
                            <tr key={cid} className="hover:bg-muted/20 transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div
                                    className="w-3 h-3 rounded-full shrink-0"
                                    style={{ backgroundColor: CLUSTER_COLORS[cidx] }}
                                  />
                                  <span className="font-semibold text-foreground">Cluster {parseInt(cid, 10) + 1}</span>
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
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-border">
                    <h3 className="font-bold text-foreground text-sm">Ringkasan Z-Score per Cluster</h3>
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
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {analysisResult.zscoreRows.map((row) => (
                          <tr key={`z-${row.cluster}`} className="hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3 font-semibold text-foreground">{row.cluster}</td>
                            <td className="px-4 py-3 text-right font-mono">{row.latitude.toFixed(3)}</td>
                            <td className="px-4 py-3 text-right font-mono">{row.longitude.toFixed(3)}</td>
                            <td className="px-4 py-3 text-right font-mono">{row.semantic_score.toFixed(3)}</td>
                            <td className="px-4 py-3 text-right font-mono">{row.dist_to_hotel_m.toFixed(3)}</td>
                            <td className="px-4 py-3 text-right font-mono">{row.dist_to_stop_m.toFixed(3)}</td>
                            <td className="px-4 py-3 text-right font-mono">{row.resto_count.toFixed(3)}</td>
                            <td className="px-4 py-3 text-right font-mono">{row.minimarket_count.toFixed(3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      </main>

      {wideItineraryOpen && activeTab === 'clusters' && (
        <div className="fixed inset-0 z-[190] flex items-end justify-center p-3 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Ringkasan per hari tampilan lebar">
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            aria-label="Tutup tampilan ringkasan lebar"
            onClick={() => setWideItineraryOpen(false)}
          />
          <div className="relative z-10 w-full max-w-6xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <button
              type="button"
              className="absolute right-3 top-3 z-[1] rounded-lg border border-border bg-background/95 p-2 shadow-sm backdrop-blur-sm transition-colors hover:bg-muted"
              aria-label="Tutup"
              onClick={() => setWideItineraryOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
            <div className="max-h-[min(90vh,860px)] overflow-y-auto px-4 pb-4 pt-14 sm:py-5 sm:pr-14">
              <DayItinerarySidebarPanel
                plannedDays={plannedDays}
                grouped={groupedSelectedByDay}
                className="border-0 bg-transparent shadow-none sm:rounded-none sm:p-0"
                footer={itinerarySidebarFooter}
                poiIdToClusterIdx={poiIdToClusterIdx}
                generationMode={generationMode}
                onReorderSidebar={handleSidebarReorder}
                onRemoveSelected={removeSidebarSelectedPoi}
                hideWideViewButton
                spreadDaysLayout
              />
            </div>
          </div>
        </div>
      )}

      {mapPoiModal && (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/55 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="map-poi-modal-title"
          onClick={() => setMapPoiModal(null)}
        >
          <div
            className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl sm:max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const { poi, clusterId } = mapPoiModal
              const cNum = parseInt(clusterId, 10) + 1
              const selectedInModal = isPOISelected(clusterId, poi.poi_id)
              const manualLocked = generationMode === 'auto'

              return (
                <>
                  <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Cluster {cNum}
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

                  <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex justify-between gap-3 border-b border-border/60 pb-2">
                      <dt className="shrink-0 text-muted-foreground">Kategori</dt>
                      <dd className="text-right font-medium text-foreground">
                        {poi.category}
                        {poi.subcategory ? ` · ${poi.subcategory}` : ''}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3 border-b border-border/60 pb-2">
                      <dt className="shrink-0 text-muted-foreground">Kota / wilayah</dt>
                      <dd className="text-right font-medium text-foreground">{poi.district || '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-3 border-b border-border/60 pb-2">
                      <dt className="flex shrink-0 items-center gap-1 text-muted-foreground">
                        <Bus className="h-3.5 w-3.5" /> Jarak halte terdekat
                      </dt>
                      <dd className="text-right font-semibold text-primary">{Math.round(poi.dist_to_stop_m)} m</dd>
                    </div>
                    <div className="flex justify-between gap-3 border-b border-border/60 pb-2">
                      <dt className="flex shrink-0 items-center gap-1 text-muted-foreground">
                        <UtensilsCrossed className="h-3.5 w-3.5" /> Restoran (≈500&nbsp;m)
                      </dt>
                      <dd className="text-right font-semibold text-foreground">{poi.resto_count}</dd>
                    </div>
                    <div className="flex justify-between gap-3 pb-1">
                      <dt className="flex shrink-0 items-center gap-1 text-muted-foreground">
                        <ShoppingBag className="h-3.5 w-3.5" /> Minimarket (≈500&nbsp;m)
                      </dt>
                      <dd className="text-right font-semibold text-foreground">{poi.minimarket_count}</dd>
                    </div>
                  </dl>

                  {poi.description ? (
                    <div className="mt-4 rounded-lg border border-border/70 bg-muted/25 p-3">
                      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Deskripsi</p>
                      <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{poi.description}</p>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs italic text-muted-foreground">Belum ada deskripsi untuk destinasi ini.</p>
                  )}

                  <div className="mt-5 flex items-start gap-2 rounded-xl border border-primary/20 bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
                    <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <p>
                      Destinasi dipilih dari peta memakai{' '}
                      <span className="font-bold text-foreground">Hari {effectiveAssignmentDay}</span> (sama dengan
                      bilah &quot;Pilih destinasi untuk hari ke-&quot; di atas).
                    </p>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    {!selectedInModal ? (
                      <button
                        type="button"
                        disabled={manualLocked}
                        className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
                        onClick={() => {
                          if (manualLocked) return
                          addPoiWithDay(clusterId, poi, effectiveAssignmentDay)
                          setMapPoiModal(null)
                        }}
                      >
                        Tambah ke pilihan — Hari {effectiveAssignmentDay}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={manualLocked}
                          className="flex-1 rounded-xl border border-primary bg-background px-4 py-2.5 text-sm font-bold text-primary shadow-sm transition-colors hover:bg-primary/5 disabled:opacity-50"
                          onClick={() => {
                            if (manualLocked) return
                            const d = Math.max(1, Math.min(plannedDays, effectiveAssignmentDay))
                            setPoiDayAssignments((prev) => ({
                              ...prev,
                              [poi.poi_id]: d,
                            }))
                            setSidebarDaySequences((prev) => {
                              const nextSeq: Record<number, number[]> = { ...prev }
                              for (let day = 1; day <= plannedDays; day += 1) {
                                nextSeq[day] = [...(nextSeq[day] ?? [])].filter(
                                  (id) => id !== poi.poi_id,
                                )
                              }
                              const row = [...(nextSeq[d] ?? [])]
                              if (!row.includes(poi.poi_id)) row.push(poi.poi_id)
                              nextSeq[d] = row
                              return nextSeq
                            })
                            setMapPoiModal(null)
                          }}
                        >
                          Pindahkan ke hari {effectiveAssignmentDay}
                        </button>
                        <button
                          type="button"
                          disabled={manualLocked}
                          className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                          onClick={() => {
                            if (manualLocked) return
                            togglePOI(clusterId, poi)
                            setMapPoiModal(null)
                          }}
                        >
                          Hapus dari pilihan
                        </button>
                      </>
                    )}
                  </div>
                  {manualLocked && (
                    <p className="mt-3 text-center text-xs text-muted-foreground">
                      Pemilihan manual tidak tersedia di mode auto generate.
                    </p>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      )}

      {loading && <LoadingSpinner message="Menyusun rute optimal..." />}
    </>
  )
}
