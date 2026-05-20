'use client'

import dynamic from 'next/dynamic'
import { useState, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, Search, ChevronRight, RefreshCw, Pencil, CheckCircle2 } from 'lucide-react'
import Navbar from '@/components/wisata/Navbar'
import LoadingSpinner from '@/components/wisata/LoadingSpinner'
import { fetchHotels, RESOLVED_PUBLIC_API_BASE, runFullPipeline, saveClusterHistory } from '@/lib/api'
import { getClientSession } from '@/lib/auth'
import type { HotelOption } from '@/lib/types'

const MapInput = dynamic(() => import('@/components/wisata/MapInput'), { ssr: false })

const LOADING_STEPS = [
  'Menghasilkan embedding preferensi Anda...',
  'Menjalankan Vector Similarity Search...',
  'Menghitung fitur spasial destinasi...',
  'Mengelompokkan destinasi per hari...',
]

const DESTINATION_INTENSITY_OPTIONS = [
  { key: 'santai', label: 'Santai', limitPerDay: 3 },
  { key: 'standar', label: 'Standar', limitPerDay: 4 },
  { key: 'petualang', label: 'Petualang', limitPerDay: 5 },
] as const
const APP_FLOW_STEPS = [
  { title: 'Input Preferensi', short: '1', detail: 'Isi hotel dan preferensi perjalanan', href: '/planner' },
  { title: 'Review Cluster', short: '2', detail: 'Tinjau hasil cluster destinasi', href: '/cluster' },
  { title: 'Finalisasi Itinerary', short: '3', detail: 'Atur timeline, peta, dan cetak', href: '/itinerary' },
] as const

type DestinationIntensity = (typeof DESTINATION_INTENSITY_OPTIONS)[number]['key']

function parseEnvNumber(raw: string | undefined, fallback: number, min: number, max?: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  if (n < min) return min
  if (typeof max === 'number' && n > max) return max
  return n
}

const SEARCH_MIN_QUERY_CHARS = Math.round(
  parseEnvNumber(process.env.NEXT_PUBLIC_SEARCH_MIN_QUERY_CHARS, 5, 2, 200),
)
const SEARCH_MIN_QUERY_ALPHA_RATIO = parseEnvNumber(
  process.env.NEXT_PUBLIC_SEARCH_MIN_QUERY_ALPHA_RATIO,
  0.55,
  0.1,
  1,
)

function toSafeUnit(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function validatePreferenceInput(raw: string): string | null {
  const cleaned = raw.trim().replace(/\s+/g, ' ')
  if (cleaned.length < SEARCH_MIN_QUERY_CHARS) {
    return `Preferensi terlalu pendek. Minimal ${SEARCH_MIN_QUERY_CHARS} karakter yang jelas.`
  }
  const alphaNum = cleaned.replace(/[^a-zA-Z0-9]/g, '')
  if (alphaNum.length === 0) {
    return 'Preferensi tidak valid. Mohon isi kata yang bermakna.'
  }
  const alphaOnly = cleaned.replace(/[^a-zA-Z]/g, '')
  if (alphaOnly.length / Math.max(1, alphaNum.length) < SEARCH_MIN_QUERY_ALPHA_RATIO) {
    return 'Input terdeteksi terlalu acak. Mohon jelaskan minat wisata dengan kata yang jelas.'
  }
  return null
}

export default function HomePage() {
  const router = useRouter()
  const [preference, setPreference] = useState('')
  const [numDays, setNumDays] = useState(3)
  const [hotelLat, setHotelLat] = useState<number | null>(null)
  const [hotelLon, setHotelLon] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState('')
  const [error, setError] = useState('')
  const [stepIdx, setStepIdx] = useState(0)
  const [hotelSearch, setHotelSearch] = useState('')
  const [hotelOptions, setHotelOptions] = useState<HotelOption[]>([])
  const [allHotelOptions, setAllHotelOptions] = useState<HotelOption[]>([])
  const [hotelDistrictFilter, setHotelDistrictFilter] = useState('')
  const [selectedHotelId, setSelectedHotelId] = useState<number | null>(null)
  const [hotelLoading, setHotelLoading] = useState(false)
  const [hotelFetchError, setHotelFetchError] = useState<string | null>(null)
  const [hotelFetchNonce, setHotelFetchNonce] = useState(0)
  const [selectedHotelName, setSelectedHotelName] = useState('')
  const [selectedHotelDistrict, setSelectedHotelDistrict] = useState('')
  const [destinationIntensity, setDestinationIntensity] = useState<DestinationIntensity>('standar')
  const [hideHotelMapAfterGenerate, setHideHotelMapAfterGenerate] = useState(false)
  const [topK, setTopK] = useState(50)
  const [showManualTopK, setShowManualTopK] = useState(false)
  const [showHotelTable, setShowHotelTable] = useState(false)

  const handleLocationSelect = useCallback((lat: number, lon: number) => {
    setHotelLat(lat)
    setHotelLon(lon)
    setSelectedHotelId(null)
    sessionStorage.removeItem('hotelName')
    setError('')
  }, [])

  useEffect(() => {
    const generated = sessionStorage.getItem('clusterData')
    if (generated) {
      setHideHotelMapAfterGenerate(true)
      const savedHotel = sessionStorage.getItem('hotelLocation')
      if (savedHotel) {
        try {
          const parsed = JSON.parse(savedHotel) as { lat?: number; lon?: number }
          if (typeof parsed.lat === 'number' && typeof parsed.lon === 'number') {
            setHotelLat(parsed.lat)
            setHotelLon(parsed.lon)
          }
        } catch {
          // ignore parse errors and keep current state
        }
      }
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        setHotelLoading(true)
        setHotelFetchError(null)
        const response = await fetchHotels(hotelSearch, 40)
        if (response.status === 'success') {
          setHotelOptions(response.results ?? [])
        } else {
          setHotelOptions([])
          setHotelFetchError('Backend merespons tapi tanpa payload sukses.')
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setHotelOptions([])
        setHotelFetchError(msg)
        if (process.env.NODE_ENV === 'development') {
          console.warn('[fetchHotels]', RESOLVED_PUBLIC_API_BASE, err)
        }
      } finally {
        setHotelLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [hotelSearch, hotelFetchNonce])

  useEffect(() => {
    let alive = true
    const loadAllHotels = async () => {
      try {
        const response = await fetchHotels('', 200)
        if (!alive) return
        if (response.status === 'success') {
          setAllHotelOptions(response.results ?? [])
        } else {
          setAllHotelOptions([])
        }
      } catch {
        if (alive) setAllHotelOptions([])
      }
    }
    loadAllHotels()
    return () => {
      alive = false
    }
  }, [hotelFetchNonce])

  const districtOptions = useMemo(() => {
    const districts = Array.from(
      new Set(
        allHotelOptions
          .map((hotel) => (hotel.district || '').trim())
          .filter((district) => district.length > 0),
      ),
    )
    return districts.sort((a, b) => a.localeCompare(b))
  }, [allHotelOptions])

  const applyDistrictFilter = useCallback(
    (items: HotelOption[]) => {
      if (!hotelDistrictFilter) return items
      return items.filter((hotel) => (hotel.district || '').trim() === hotelDistrictFilter)
    },
    [hotelDistrictFilter],
  )

  const filteredAllHotels = useMemo(
    () => applyDistrictFilter(allHotelOptions),
    [allHotelOptions, applyDistrictFilter],
  )
  const filteredSearchHotels = useMemo(
    () => applyDistrictFilter(hotelOptions),
    [hotelOptions, applyDistrictFilter],
  )
  const displayedHotels = useMemo(
    () => (hotelSearch.trim() !== '' ? filteredSearchHotels : filteredAllHotels),
    [hotelSearch, filteredSearchHotels, filteredAllHotels],
  )

  useEffect(() => {
    const refreshHotels = () => setHotelFetchNonce((prev) => prev + 1)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshHotels()
      }
    }

    window.addEventListener('focus', refreshHotels)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('focus', refreshHotels)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  const handleRestart = useCallback(() => {
    sessionStorage.removeItem('clusterData')
    sessionStorage.removeItem('hotelLocation')
    sessionStorage.removeItem('searchQuery')
    sessionStorage.removeItem('numDays')
    sessionStorage.removeItem('destinationIntensity')
    sessionStorage.removeItem('dailyDestinationLimit')
    sessionStorage.removeItem('routeData')
    sessionStorage.removeItem('hotelName')

    setPreference('')
    setNumDays(3)
    setHotelLat(null)
    setHotelLon(null)
    setError('')
    setLoadingStep('')
    setStepIdx(0)
    setHotelSearch('')
    setHotelDistrictFilter('')
    setHotelOptions([])
    setHotelFetchError(null)
    setSelectedHotelId(null)
    setSelectedHotelName('')
    setSelectedHotelDistrict('')
    setHotelFetchNonce((prev) => prev + 1)
    setDestinationIntensity('standar')
    setHideHotelMapAfterGenerate(false)
    setTopK(50)
    setShowManualTopK(false)
  }, [])

  const handleHotelFromDatabase = (hotelIdText: string) => {
    const hotelId = Number(hotelIdText)
    setSelectedHotelId(hotelId)
    const selected =
      allHotelOptions.find((h) => h.id === hotelId) ??
      hotelOptions.find((h) => h.id === hotelId)
    if (!selected) return
    setHotelLat(selected.latitude)
    setHotelLon(selected.longitude)
    setHotelSearch('')
    setSelectedHotelName(selected.name)
    setSelectedHotelDistrict(selected.district || 'DKI Jakarta')
    setShowHotelTable(false)
    setError('')
  }

  const handleSubmit = async () => {
    if (!selectedHotelId || hotelLat === null || hotelLon === null) {
      setError('Mohon pilih hotel dari pencarian atau daftar hotel terlebih dahulu')
      return
    }
    if (!preference.trim()) {
      setError('Mohon masukkan preferensi wisata Anda')
      return
    }
    const preferenceValidationError = validatePreferenceInput(preference)
    if (preferenceValidationError) {
      setError(preferenceValidationError)
      return
    }

    setLoading(true)
    setError('')

    let idx = 0
    setLoadingStep(LOADING_STEPS[0])
    const stepInterval = setInterval(() => {
      idx = (idx + 1) % LOADING_STEPS.length
      setStepIdx(idx)
      setLoadingStep(LOADING_STEPS[idx])
    }, 1800)

    try {
      const clusterResult = await runFullPipeline(preference, numDays, hotelLat, hotelLon, topK)
      clearInterval(stepInterval)

      const selectedHotel = hotelOptions.find((h) => h.id === selectedHotelId)
      const chosenHotelName = selectedHotelName.trim() || selectedHotel?.name?.trim() || 'Tidak diketahui'
      sessionStorage.setItem('clusterData', JSON.stringify(clusterResult))
      sessionStorage.setItem('hotelLocation', JSON.stringify({ lat: hotelLat, lon: hotelLon }))
      sessionStorage.setItem('hotelName', chosenHotelName)
      sessionStorage.setItem('searchQuery', preference)
      sessionStorage.setItem('numDays', String(numDays))
      sessionStorage.setItem('topK', String(topK))
      const selectedIntensity = DESTINATION_INTENSITY_OPTIONS.find((o) => o.key === destinationIntensity)
      sessionStorage.setItem('destinationIntensity', destinationIntensity)
      sessionStorage.setItem('dailyDestinationLimit', String(selectedIntensity?.limitPerDay ?? 4))

      sessionStorage.removeItem('clusterSelectionDraft')
      sessionStorage.removeItem('selectedPOIs')
      sessionStorage.removeItem('poiDayAssignments')
      sessionStorage.removeItem('routeData')

      try {
        const sessionUser = getClientSession()
        if (sessionUser?.role === 'user') {
          const silhouette = Number(clusterResult.evaluation?.silhouette_score ?? 0)
          const dbi = Number(clusterResult.evaluation?.davies_bouldin_index ?? 0)
          const precision = toSafeUnit(silhouette)
          const recall = toSafeUnit(1 / (1 + Math.max(0, dbi)))
          const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
          const totalPois = Object.values(clusterResult.clusters ?? {}).reduce(
            (acc, item) => acc + (item.pois?.length ?? 0),
            0,
          )
          const selectedDestinations = Array.from(
            new Set(
              Object.values(clusterResult.clusters ?? {})
                .flatMap((item) => item.pois ?? [])
                .map((poi) => (poi?.name || '').trim())
                .filter((name) => name.length > 0),
            ),
          )

          await saveClusterHistory({
            user_email: sessionUser.email,
            query_text: preference,
            num_days: numDays,
            total_pois: totalPois,
            k_optimal: Number(clusterResult.evaluation?.k_optimal ?? 1),
            silhouette_score: silhouette,
            davies_bouldin_index: dbi,
            wcss: Number(clusterResult.evaluation?.wcss ?? 0),
            precision_score: precision,
            recall_score: recall,
            f1_score: toSafeUnit(f1),
            selected_destinations: selectedDestinations,
            hotel_name: chosenHotelName,
            hotel_lat: hotelLat,
            hotel_lon: hotelLon,
          })
        }
      } catch {
        // Tetap lanjut ke halaman cluster bila simpan history gagal.
      }

      router.push('/cluster')
    } catch (err) {
      clearInterval(stepInterval)
      setError('Terjadi kesalahan: ' + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background">

        {/* Hero */}
        <section className="page-hero">
          <div className="page-hero-inner">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="w-5 h-5 text-accent" />
              <h1 className="text-xl md:text-2xl font-bold">Input Preferensi & Hotel</h1>
            </div>
            <p className="text-primary-foreground/75 text-sm">
              Mulai dari titik hotel, tentukan preferensi, lalu lanjut ke hasil Intelligent K-Means clustering.
            </p>
          </div>
        </section>

        <section className="landing-section pt-6">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-col gap-2">
              <div className="overflow-x-auto pb-1">
                <div className="mx-auto min-w-[680px]">
                  <div className="flex items-start">
                    {APP_FLOW_STEPS.map((step, idx) => {
                      const isActive = idx === 0
                      const isCompleted = idx < 0
                      const isClickable = !isActive
                      return (
                        <div key={`step-pill-${step.title}`} className="contents">
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
                          {idx < APP_FLOW_STEPS.length - 1 && (
                            <div
                              className={`mx-3 mt-[1.15rem] h-1 flex-1 rounded-full ${idx < 0 ? 'bg-primary/55' : 'bg-border'}`}
                              aria-hidden
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Form */}
        <section id="form-generator" className="landing-section pt-0">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">

            {/* ── Left: Steps 1 & 2 ── */}
            <div className="order-2 flex flex-col gap-4 lg:col-span-5 lg:order-2">

              {/* Step 1 */}
              <div className="surface-card p-4">
                <div className="mb-2.5 flex items-center gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</div>
                  <span className="text-sm font-semibold text-foreground">Preferensi Wisata Anda</span>
                </div>
                <p className="mb-2 text-xs text-muted-foreground">
                  Jelaskan minat wisata Anda dengan kalimat singkat dan jelas agar hasil cluster lebih relevan.
                </p>
                <textarea
                  className="h-24 w-full resize-none rounded-xl border border-input bg-muted/50 p-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-primary focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="Contoh: Saya suka tempat bersejarah dan museum yang tenang, dekat dengan transportasi umum..."
                  value={preference}
                  onChange={(e) => { setPreference(e.target.value); setError('') }}
                />
                {/* Auto masukkan preferensi disembunyikan sesuai permintaan */}
              </div>

              {/* Step 2 */}
              <div className="surface-card p-4">
                <div className="mb-2.5 flex items-center gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</div>
                  <span className="text-sm font-semibold text-foreground">Filter Destinasi</span>
                </div>
                <p className="mb-2 text-xs text-muted-foreground">
                  Tentukan jumlah kandidat destinasi yang akan diproses sebelum pengelompokan cluster.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {[50, 100].map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={topK === option}
                      onClick={() => {
                        setTopK(option)
                        setShowManualTopK(false)
                      }}
                      className={`min-w-[3rem] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                        topK === option
                          ? 'bg-primary text-primary-foreground'
                          : 'border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      {option} destinasi
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowManualTopK((v) => !v)}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${
                      showManualTopK
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                    aria-label="Input jumlah destinasi manual"
                    title="Input manual"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {showManualTopK ? (
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={topK}
                      onChange={(e) => {
                        const raw = Number(e.target.value)
                        if (!Number.isFinite(raw)) return
                        setTopK(Math.max(1, Math.min(500, Math.round(raw))))
                      }}
                      className="w-24 rounded-xl border border-input bg-background px-3 py-2 text-sm font-semibold text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      aria-label="Nilai filter destinasi manual"
                    />
                  ) : null}
                </div>
              </div>

              {/* Step 3 */}
              <div className="surface-card p-4">
                <div className="mb-2.5 flex items-center gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">4</div>
                  <span className="text-sm font-semibold text-foreground">Jumlah Destinasi per Hari (Default)</span>
                </div>
                <p className="mb-2 text-xs text-muted-foreground">
                  Pilih kepadatan itinerary harian sesuai gaya perjalanan Anda.
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {DESTINATION_INTENSITY_OPTIONS.map((option) => {
                    const active = destinationIntensity === option.key
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setDestinationIntensity(option.key)}
                        className={`rounded-xl border px-3 py-2 text-left transition-all ${
                          active
                            ? 'border-primary bg-primary/10 shadow-sm'
                            : 'border-border bg-card hover:border-primary/30 hover:bg-primary/5'
                        }`}
                      >
                        <p className="text-xs font-bold text-foreground">{option.label}</p>
                        <p className="mt-0.5 text-[10px] text-slate-500">{option.limitPerDay} destinasi</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-md transition-all hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
              >
                <Search className="h-4 w-4" />
                Cari Destinasi
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* ── Right: Step 4 (Map) ── */}
            <div className="order-1 lg:col-span-7 lg:order-1">
              <div className="surface-card flex h-full flex-col p-4">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</div>
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <MapPin className="h-4 w-4 text-primary" />
                      Pilih Lokasi Hotel
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setShowHotelTable((prev) => {
                        const next = !prev
                        if (next) setHotelSearch('')
                        return next
                      })
                    }
                    className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                  >
                    {showHotelTable ? 'Tutup daftar hotel' : 'Daftar hotel'}
                  </button>
                </div>
                <p className="mb-2 text-xs text-muted-foreground">
                  Cari hotel untuk memilih titik awal secara cepat. Peta ditampilkan hanya untuk visualisasi lokasi.
                </p>

                {selectedHotelId && hotelLat !== null && hotelLon !== null ? (
                  <div className="mb-3 rounded-xl border border-emerald-300 bg-emerald-50 p-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="font-semibold">Hotel terpilih</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedHotelId(null)
                          setSelectedHotelName('')
                          setSelectedHotelDistrict('')
                          setHotelLat(null)
                          setHotelLon(null)
                          setHotelSearch('')
                        }}
                        className="rounded-md border border-emerald-300 bg-white px-2 py-0.5 font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                      >
                        Ganti
                      </button>
                    </div>
                    <p className="mt-1 font-semibold text-foreground">{selectedHotelName || 'Hotel terpilih'}</p>
                    <p className="mt-0.5 text-muted-foreground">
                      {selectedHotelDistrict || 'DKI Jakarta'} • {hotelLat.toFixed(4)}, {hotelLon.toFixed(4)}
                    </p>
                  </div>
                ) : null}

                {loading ? (
                  <div className="flex min-h-[280px] flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
                    Peta dijeda sementara saat sistem memproses pencarian destinasi…
                  </div>
                ) : hideHotelMapAfterGenerate ? (
                  <div className="flex min-h-[280px] flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <RefreshCw className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Hasil generate sudah tersedia
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => router.push('/cluster')}
                        className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                      >
                        Lihat Hasil Cluster
                      </button>
                      <button
                        type="button"
                        onClick={handleRestart}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Mulai Ulang
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {!selectedHotelId ? (
                      <>
                        <div className="mb-3 grid gap-2 sm:grid-cols-3">
                          <div className="relative sm:col-span-2">
                            <input
                              type="text"
                              value={hotelSearch}
                              onChange={(e) => setHotelSearch(e.target.value)}
                              placeholder="Cari hotel atau wilayah…"
                              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                          </div>
                          <select
                            value={hotelDistrictFilter}
                            onChange={(e) => setHotelDistrictFilter(e.target.value)}
                            className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                            aria-label="Filter wilayah hotel"
                          >
                            <option value="">Semua wilayah</option>
                            {districtOptions.map((district) => (
                              <option key={`district-${district}`} value={district}>
                                {district}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="relative mb-3">
                          {hotelSearch.trim() !== '' && filteredSearchHotels.length > 0 ? (
                            <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
                              {filteredSearchHotels.slice(0, 10).map((hotel) => (
                                <button
                                  key={`hotel-suggest-${hotel.id}`}
                                  type="button"
                                  onClick={() => handleHotelFromDatabase(String(hotel.id))}
                                  className="flex w-full items-start justify-between gap-2 border-b border-border/60 px-3 py-2 text-left text-xs hover:bg-muted/50 last:border-b-0"
                                >
                                  <span className="font-medium text-foreground">{hotel.name}</span>
                                  <span className="text-muted-foreground">{hotel.district || 'DKI Jakarta'}</span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <p className="mb-3 text-xs text-muted-foreground">
                          Ketik nama hotel untuk melihat saran otomatis atau klik tombol Daftar Hotel untuk memilih lewat tabel.
                        </p>
                      </>
                    ) : (
                      <p className="mb-3 text-xs text-muted-foreground">
                        Hotel sudah dipilih. Gunakan tombol <span className="font-semibold text-foreground">Ganti</span> bila ingin memilih hotel lain.
                      </p>
                    )}
                    {!selectedHotelId ? (
                      <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        Pilih satu hotel terlebih dahulu agar proses clustering bisa dijalankan.
                      </div>
                    ) : null}
                    {!hotelLoading && filteredSearchHotels.length === 0 ? (
                      hotelFetchError ? (
                        <p className="mb-3 text-xs text-destructive">
                          Gagal memuat hotel. Periksa koneksi ke API ({RESOLVED_PUBLIC_API_BASE}).
                        </p>
                      ) : hotelSearch.trim() !== '' ? (
                        <p className="mb-3 text-xs text-muted-foreground">Tidak ada hotel yang cocok — coba kata kunci lain atau buka daftar hotel.</p>
                      ) : null
                    ) : null}

                    <p className="mb-2 text-xs text-muted-foreground">
                      Peta hotel ditampilkan untuk visualisasi posisi awal perjalanan (mode baca saja / non-interaktif).
                    </p>
                    {showHotelTable ? (
                      <div className="flex min-h-[280px] flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 p-4 text-center text-xs text-muted-foreground">
                        Peta disembunyikan sementara saat daftar hotel dibuka.
                      </div>
                    ) : (
                      <div className="relative min-h-[280px] flex-1 overflow-hidden rounded-xl border border-border">
                        <MapInput
                          onLocationSelect={handleLocationSelect}
                          selectedLat={hotelLat}
                          selectedLon={hotelLon}
                          allowMapClick={false}
                          hotelMarkers={filteredAllHotels.map((hotel) => ({
                            id: hotel.id,
                            name: hotel.name,
                            district: hotel.district || 'DKI Jakarta',
                            latitude: hotel.latitude,
                            longitude: hotel.longitude,
                          }))}
                          onHotelMarkerSelect={(hotelId) => handleHotelFromDatabase(String(hotelId))}
                        />
                        <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-background/90 px-3 py-1 text-[11px] font-semibold text-muted-foreground shadow-sm">
                          Peta visualisasi
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Modul 1-4 disembunyikan sesuai permintaan */}
        </section>
      </main>

      {showHotelTable && !loading && !hideHotelMapAfterGenerate ? (
        <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/50 p-3 sm:items-center sm:p-6">
          <button
            type="button"
            onClick={() => setShowHotelTable(false)}
            className="absolute inset-0"
            aria-label="Tutup modal daftar hotel"
          />
          <div className="relative z-10 w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <p className="text-sm font-bold text-foreground">Daftar Hotel</p>
                <p className="text-xs text-muted-foreground">Pilih hotel sebagai titik awal itinerary.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowHotelTable(false)}
                className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Tutup
              </button>
            </div>
            <div className="grid gap-2 border-b border-border px-4 py-3 sm:grid-cols-3">
              <input
                type="text"
                value={hotelSearch}
                onChange={(e) => setHotelSearch(e.target.value)}
                placeholder="Cari hotel atau wilayah…"
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:col-span-2"
              />
              <select
                value={hotelDistrictFilter}
                onChange={(e) => setHotelDistrictFilter(e.target.value)}
                className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                aria-label="Filter wilayah hotel pada modal"
              >
                <option value="">Semua wilayah</option>
                {districtOptions.map((district) => (
                  <option key={`modal-district-${district}`} value={district}>
                    {district}
                  </option>
                ))}
              </select>
            </div>
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/60">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Nama Hotel</th>
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Wilayah</th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedHotels.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-3 text-center text-muted-foreground">
                        {hotelLoading ? 'Memuat data hotel...' : 'Hotel tidak ditemukan.'}
                      </td>
                    </tr>
                  ) : (
                    displayedHotels.map((hotel) => (
                      <tr
                        key={`hotel-modal-row-${hotel.id}`}
                        className={`border-t border-border/60 ${
                          selectedHotelId === hotel.id ? 'bg-primary/10' : 'hover:bg-primary/5'
                        }`}
                      >
                        <td className="px-3 py-2 text-foreground">{hotel.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{hotel.district || 'DKI Jakarta'}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => handleHotelFromDatabase(String(hotel.id))}
                            className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold text-primary-foreground transition-colors ${
                              selectedHotelId === hotel.id
                                ? 'bg-emerald-600 hover:bg-emerald-700'
                                : 'bg-primary hover:bg-emerald-600'
                            }`}
                          >
                            {selectedHotelId === hotel.id ? 'Terpilih' : 'Pilih'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {loading && (
        <LoadingSpinner
          message={loadingStep}
          subMessage={`Langkah ${stepIdx + 1} dari ${LOADING_STEPS.length}`}
        />
      )}
    </>
  )
}
