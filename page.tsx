'use client'

import dynamic from 'next/dynamic'
import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, Search, ChevronRight, Sparkles, RefreshCw, Pencil } from 'lucide-react'
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

type DestinationIntensity = (typeof DESTINATION_INTENSITY_OPTIONS)[number]['key']

function toSafeUnit(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
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
  const [selectedHotelId, setSelectedHotelId] = useState<number | null>(null)
  const [hotelLoading, setHotelLoading] = useState(false)
  const [hotelFetchError, setHotelFetchError] = useState<string | null>(null)
  const [hotelFetchNonce, setHotelFetchNonce] = useState(0)
  const [destinationIntensity, setDestinationIntensity] = useState<DestinationIntensity>('standar')
  const [hideHotelMapAfterGenerate, setHideHotelMapAfterGenerate] = useState(false)
  const [topK, setTopK] = useState(50)
  const [showManualTopK, setShowManualTopK] = useState(false)

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
    setHotelOptions([])
    setHotelFetchError(null)
    setSelectedHotelId(null)
    setHotelFetchNonce((prev) => prev + 1)
    setDestinationIntensity('standar')
    setHideHotelMapAfterGenerate(false)
    setTopK(50)
    setShowManualTopK(false)
  }, [])

  const handleHotelFromDatabase = (hotelIdText: string) => {
    const hotelId = Number(hotelIdText)
    setSelectedHotelId(hotelId)
    const selected = hotelOptions.find((h) => h.id === hotelId)
    if (!selected) return
    setHotelLat(selected.latitude)
    setHotelLon(selected.longitude)
    setError('')
  }

  const handleSubmit = async () => {
    if (!preference.trim()) {
      setError('Mohon masukkan preferensi wisata Anda')
      return
    }
    if (hotelLat === null || hotelLon === null) {
      setError('Mohon klik peta untuk memilih lokasi hotel')
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
      const chosenHotelName = selectedHotel?.name?.trim() || 'Tidak diketahui'
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
          <div className="mx-auto max-w-5xl px-4 py-5 text-center sm:py-7">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              <span>Sistem Rekomendasi Berbasis AI</span>
            </div>
            <h1 className="mb-1.5 text-2xl font-bold sm:text-3xl">
              Wisata Jakarta Cerdas
            </h1>
            <p className="mx-auto max-w-2xl text-sm leading-relaxed text-primary-foreground/80 sm:text-base">
              Rencanakan perjalanan wisata DKI Jakarta Anda menggunakan Vector Similarity Search &amp; Intelligent K-Means
            </p>
          </div>
        </section>

        {/* Form */}
        <section className="mx-auto max-w-5xl px-4 py-5 sm:py-7">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">

            {/* ── Left: Steps 1 & 2 ── */}
            <div className="flex flex-col gap-4 lg:col-span-5">

              {/* Step 1 */}
              <div className="surface-card p-4">
                <div className="mb-2.5 flex items-center gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</div>
                  <span className="text-sm font-semibold text-foreground">Preferensi Wisata Anda</span>
                </div>
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
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</div>
                  <span className="text-sm font-semibold text-foreground">Top-K Destinasi</span>
                </div>
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
                      {option}
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
                    aria-label="Input top-k manual"
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
                      aria-label="Nilai top-k manual"
                    />
                  ) : null}
                </div>
              </div>

              {/* Step 3 */}
              <div className="surface-card p-4">
                <div className="mb-2.5 flex items-center gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</div>
                  <span className="text-sm font-semibold text-foreground">Jumlah Destinasi per Hari (Default)</span>
                </div>
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
            <div className="lg:col-span-7">
              <div className="surface-card flex h-full flex-col p-4">
                <div className="mb-2.5 flex items-center gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">4</div>
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <MapPin className="h-4 w-4 text-primary" />
                    Pilih Lokasi Hotel
                  </span>
                </div>

                {hotelLat !== null && hotelLon !== null ? (
                  <div className="mb-2 flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
                    <MapPin className="h-3 w-3" />
                    Hotel: {hotelLat.toFixed(4)}, {hotelLon.toFixed(4)}
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
                    <div className="mb-3 grid gap-2 sm:grid-cols-2">
                      <input
                        type="text"
                        value={hotelSearch}
                        onChange={(e) => setHotelSearch(e.target.value)}
                        placeholder="Cari hotel atau wilayah…"
                        className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      <select
                        value={selectedHotelId ?? ''}
                        onChange={(e) => handleHotelFromDatabase(e.target.value)}
                        className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="">{hotelLoading ? 'Memuat hotel…' : 'Pilih hotel dari daftar'}</option>
                        {hotelOptions.map((hotel) => (
                          <option key={hotel.id} value={hotel.id}>
                            {hotel.name} ({hotel.district || 'DKI Jakarta'})
                          </option>
                        ))}
                      </select>
                    </div>
                    {!hotelLoading && hotelOptions.length === 0 ? (
                      hotelFetchError ? (
                        <p className="mb-3 text-xs text-destructive">
                          Gagal memuat hotel. Periksa koneksi ke API ({RESOLVED_PUBLIC_API_BASE}).
                        </p>
                      ) : hotelSearch.trim() !== '' ? (
                        <p className="mb-3 text-xs text-muted-foreground">Tidak ada hotel yang cocok — coba kata kunci lain atau pilih di peta.</p>
                      ) : null
                    ) : null}

                    <div className="min-h-[280px] flex-1 overflow-hidden rounded-xl border border-border">
                      <MapInput onLocationSelect={handleLocationSelect} selectedLat={hotelLat} selectedLon={hotelLon} />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Modul 1-4 disembunyikan sesuai permintaan */}
        </section>
      </main>

      {loading && (
        <LoadingSpinner
          message={loadingStep}
          subMessage={`Langkah ${stepIdx + 1} dari ${LOADING_STEPS.length}`}
        />
      )}
    </>
  )
}
