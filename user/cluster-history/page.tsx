'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Calendar, Download, Search } from 'lucide-react'
import Navbar from '@/components/wisata/Navbar'
import { fetchUserClusterHistory } from '@/lib/api'
import { getClientSession } from '@/lib/auth'
import type { ClusterHistoryItem } from '@/lib/types'

function toDateInputValue(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function defaultDateFrom(days: number): string {
  const now = new Date()
  now.setDate(now.getDate() - days)
  return toDateInputValue(now)
}

function totalRouteKm(item: ClusterHistoryItem): number {
  const routes = item.routes ?? {}
  return Object.values(routes).reduce((sum, route) => sum + (route.total_distance_km ?? 0), 0)
}

export default function UserClusterHistoryPage() {
  const [items, setItems] = useState<ClusterHistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState({
    total_runs: 0,
    avg_precision: 0,
    avg_recall: 0,
    avg_f1: 0,
  })
  const [queryText, setQueryText] = useState('')
  const [dateFrom, setDateFrom] = useState(defaultDateFrom(30))
  const [dateTo, setDateTo] = useState(toDateInputValue(new Date()))

  const session = useMemo(() => getClientSession(), [])
  const email = session?.email ?? ''

  const loadHistory = useCallback(async () => {
    if (!email) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetchUserClusterHistory({
        userEmail: email,
        queryText,
        dateFrom,
        dateTo,
        limit: 200,
      })
      setItems(res.items ?? [])
      setSummary(
        res.summary ?? {
          total_runs: 0,
          avg_precision: 0,
          avg_recall: 0,
          avg_f1: 0,
        },
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat riwayat cluster.')
      setItems([])
      setSummary({
        total_runs: 0,
        avg_precision: 0,
        avg_recall: 0,
        avg_f1: 0,
      })
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, email, queryText])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  if (!email) {
    return (
      <>
        <Navbar />
        <main className="min-h-screen bg-background px-4 py-10">
          <div className="mx-auto max-w-3xl surface-card p-5 text-sm text-muted-foreground">
            Silakan login sebagai user untuk melihat riwayat cluster.
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background">
        <section className="page-hero">
          <div className="mx-auto max-w-6xl px-4 py-8 text-center sm:py-10">
            <h1 className="text-2xl font-bold text-primary-foreground sm:text-3xl">Riwayat Cluster Saya</h1>
            <p className="mt-2 text-sm text-primary-foreground/80 sm:text-base">
              Input, analisis grafik, z-score, destinasi terfilter, pilihan per hari, dan jarak rute — ditampilkan dalam tabel.
            </p>
          </div>
        </section>

        <section className="landing-section">
          <div className="surface-card p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <label className="text-xs font-semibold text-muted-foreground">
                Query
                <div className="relative mt-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={queryText}
                    onChange={(e) => setQueryText(e.target.value)}
                    placeholder="Cari preferensi..."
                    className="w-full rounded-xl border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </label>

              <label className="text-xs font-semibold text-muted-foreground">
                Dari tanggal
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </label>

              <label className="text-xs font-semibold text-muted-foreground">
                Sampai tanggal
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </label>

              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={loadHistory}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Calendar className="h-4 w-4" />
                  Terapkan
                </button>
              </div>
            </div>

            <div className="mt-4">
              <Link
                href="/planner"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
              >
                <Download className="h-3.5 w-3.5" />
                Buat Cluster Baru
              </Link>
            </div>
          </div>
        </section>

        <section className="landing-section pt-0">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <article className="surface-card p-4 text-center">
              <p className="text-xs text-muted-foreground">Total Riwayat</p>
              <p className="mt-1 text-xl font-bold text-foreground">{summary.total_runs}</p>
            </article>
            <article className="surface-card p-4 text-center">
              <p className="text-xs text-muted-foreground">Avg Precision</p>
              <p className="mt-1 text-xl font-bold text-primary">{(summary.avg_precision * 100).toFixed(1)}%</p>
            </article>
            <article className="surface-card p-4 text-center">
              <p className="text-xs text-muted-foreground">Avg Recall</p>
              <p className="mt-1 text-xl font-bold text-foreground">{(summary.avg_recall * 100).toFixed(1)}%</p>
            </article>
            <article className="surface-card p-4 text-center">
              <p className="text-xs text-muted-foreground">Avg F1</p>
              <p className="mt-1 text-xl font-bold text-emerald-600">{summary.avg_f1.toFixed(4)}</p>
            </article>
          </div>
        </section>

        <section className="landing-section pt-0 pb-10">
          {loading ? (
            <div className="surface-card p-5 text-sm text-muted-foreground">Memuat riwayat cluster...</div>
          ) : error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="surface-card p-5 text-sm text-muted-foreground">
              Belum ada riwayat cluster sesuai filter. Riwayat tersimpan saat Anda menekan <strong>Buat Itinerary</strong> di halaman cluster.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full min-w-[760px] text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Waktu</th>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Preferensi</th>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Hotel</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Hari</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">POI</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Dipilih</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Jarak</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">F1</th>
                      <th className="px-3 py-2 text-center font-semibold text-muted-foreground">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((item) => (
                      <tr key={item.id} className="hover:bg-muted/20">
                        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                          {new Date(item.created_at).toLocaleString('id-ID')}
                        </td>
                        <td className="max-w-[220px] truncate px-3 py-2 font-medium text-foreground">{item.query_text}</td>
                        <td className="max-w-[160px] truncate px-3 py-2">{item.hotel_name ?? 'Tidak diketahui'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{item.num_days}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {item.filtered_destinations?.length ?? item.total_pois}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{item.selected_destinations?.length ?? 0}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{totalRouteKm(item).toFixed(2)} km</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{item.f1_score.toFixed(4)}</td>
                        <td className="px-3 py-2 text-center">
                          <Link
                            href={`/user/cluster-history/${item.id}`}
                            className="inline-block rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-muted"
                          >
                            Detail
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>
    </>
  )
}
