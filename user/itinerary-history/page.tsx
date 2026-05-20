'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Calendar, Download, FileSpreadsheet, Printer, Search } from 'lucide-react'
import Navbar from '@/components/wisata/Navbar'
import { fetchUserItineraryHistory } from '@/lib/api'
import { getClientSession } from '@/lib/auth'
import type { ItineraryHistoryItem } from '@/lib/types'

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

export default function UserItineraryHistoryPage() {
  const [items, setItems] = useState<ItineraryHistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState({
    total_runs: 0,
    avg_total_distance_km: 0,
    avg_total_stops: 0,
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
      const res = await fetchUserItineraryHistory({
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
          avg_total_distance_km: 0,
          avg_total_stops: 0,
          avg_f1: 0,
        },
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat riwayat itinerary.')
      setItems([])
      setSummary({
        total_runs: 0,
        avg_total_distance_km: 0,
        avg_total_stops: 0,
        avg_f1: 0,
      })
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, email, queryText])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const exportCsv = () => {
    if (!items.length) return
    const header = [
      'created_at',
      'query_text',
      'hotel_name',
      'total_days',
      'total_stops',
      'total_distance_km',
      'k_optimal',
      'silhouette_score',
      'davies_bouldin_index',
      'wcss',
      'precision_score',
      'recall_score',
      'f1_score',
      'itinerary_days',
    ]

    const escapeCsv = (value: string | number | null | undefined) => {
      const raw = value == null ? '' : String(value)
      if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
        return `"${raw.replaceAll('"', '""')}"`
      }
      return raw
    }

    const rows = items.map((item) => [
      item.created_at,
      item.query_text,
      item.hotel_name ?? 'Tidak diketahui',
      item.total_days,
      item.total_stops,
      item.total_distance_km,
      item.k_optimal,
      item.silhouette_score,
      item.davies_bouldin_index,
      item.wcss,
      item.precision_score,
      item.recall_score,
      item.f1_score,
      item.itinerary_days.map((d) => `H${d.day}:${d.poi_names.join(' | ')}`).join(' || '),
    ])

    const csv = [header, ...rows]
      .map((r) => r.map((c) => escapeCsv(c as string | number)).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `itinerary-history-${toDateInputValue(new Date())}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportPdf = () => {
    if (!items.length) return
    const w = window.open('', '_blank', 'width=1100,height=760')
    if (!w) return
    const rows = items
      .map(
        (item, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${new Date(item.created_at).toLocaleString('id-ID')}</td>
          <td>${item.query_text}</td>
          <td>${item.hotel_name ?? 'Tidak diketahui'}</td>
          <td>${item.total_days}</td>
          <td>${item.total_stops}</td>
          <td>${item.total_distance_km.toFixed(2)} km</td>
          <td>${item.f1_score.toFixed(4)}</td>
        </tr>
      `,
      )
      .join('')

    w.document.write(`
      <html>
        <head>
          <title>Riwayat Itinerary Saya</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
            h1 { margin: 0 0 8px; }
            p { margin: 0 0 16px; color: #555; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 8px; vertical-align: top; text-align: left; }
            th { background: #f5f5f5; font-weight: 700; }
          </style>
        </head>
        <body>
          <h1>Riwayat Itinerary Saya</h1>
          <p>Dicetak pada ${new Date().toLocaleString('id-ID')}</p>
          <table>
            <thead>
              <tr>
                <th>No</th>
                <th>Waktu</th>
                <th>Query</th>
                <th>Hotel</th>
                <th>Hari</th>
                <th>Destinasi</th>
                <th>Total Jarak</th>
                <th>F1</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>
    `)
    w.document.close()
    w.focus()
    w.print()
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background">
        <section className="page-hero">
          <div className="mx-auto max-w-6xl px-4 py-8 text-center sm:py-10">
            <h1 className="text-2xl font-bold text-primary-foreground sm:text-3xl">Riwayat Itinerary Saya</h1>
            <p className="mt-2 text-sm text-primary-foreground/80 sm:text-base">
              Lihat riwayat itinerary yang pernah Anda rancang, lengkap dengan metrik evaluasi.
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
                    placeholder="Cari query itinerary..."
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

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={exportCsv}
                disabled={!items.length}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Export CSV
              </button>
              <button
                type="button"
                onClick={exportPdf}
                disabled={!items.length}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Printer className="h-3.5 w-3.5" />
                Export PDF
              </button>
              <Link
                href="/planner"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
              >
                <Download className="h-3.5 w-3.5" />
                Buat Itinerary Baru
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
              <p className="text-xs text-muted-foreground">Rata-rata Jarak</p>
              <p className="mt-1 text-xl font-bold text-primary">{summary.avg_total_distance_km.toFixed(2)} km</p>
            </article>
            <article className="surface-card p-4 text-center">
              <p className="text-xs text-muted-foreground">Rata-rata Destinasi</p>
              <p className="mt-1 text-xl font-bold text-foreground">{summary.avg_total_stops.toFixed(1)}</p>
            </article>
            <article className="surface-card p-4 text-center">
              <p className="text-xs text-muted-foreground">Avg F1</p>
              <p className="mt-1 text-xl font-bold text-emerald-600">{summary.avg_f1.toFixed(4)}</p>
            </article>
          </div>
        </section>

        <section className="landing-section pt-0 pb-10">
          {loading ? (
            <div className="surface-card p-5 text-sm text-muted-foreground">Memuat riwayat itinerary...</div>
          ) : error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="surface-card p-5 text-sm text-muted-foreground">
              Belum ada riwayat itinerary sesuai filter.
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <article key={item.id} className="surface-card p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-foreground">{item.query_text}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(item.created_at).toLocaleString('id-ID')} · Hotel: {item.hotel_name ?? 'Tidak diketahui'}
                      </p>
                    </div>
                    <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                      {item.total_distance_km.toFixed(2)} km
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
                      <p className="text-muted-foreground">Hari</p>
                      <p className="font-semibold text-foreground">{item.total_days}</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
                      <p className="text-muted-foreground">Destinasi</p>
                      <p className="font-semibold text-foreground">{item.total_stops}</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
                      <p className="text-muted-foreground">K Optimal</p>
                      <p className="font-semibold text-foreground">{item.k_optimal}</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
                      <p className="text-muted-foreground">F1</p>
                      <p className="font-semibold text-emerald-600">{item.f1_score.toFixed(4)}</p>
                    </div>
                  </div>

                  <details className="mt-3 rounded-lg border border-border bg-background p-3">
                    <summary className="cursor-pointer text-xs font-semibold text-foreground">
                      Lihat detail per hari
                    </summary>
                    <div className="mt-3 space-y-2">
                      {item.itinerary_days?.map((day) => (
                        <div key={`${item.id}-day-${day.day}`} className="rounded-lg bg-muted/30 p-2.5 text-xs">
                          <p className="font-semibold text-foreground">
                            Hari {day.day} · {day.distance_km.toFixed(2)} km · {day.stops} destinasi
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            {day.poi_names.length ? day.poi_names.join(' • ') : 'Tidak ada destinasi tersimpan.'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </details>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  )
}
