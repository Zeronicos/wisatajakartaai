'use client'

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Building2, Eye, Inbox, Layers3, MapPinned, RefreshCw, RotateCcw, Shapes, BusFront, Store, Trash2 } from "lucide-react"
import {
  deleteAdminClusterHistory,
  fetchAdminClusterHistory,
  fetchAdminMasterData,
  fetchFacilitiesSummary,
  fetchTransjakartaDbSummary,
} from "@/lib/api"
import type { ClusterHistoryItem } from "@/lib/types"
import TableCard from "@/components/admin/common/TableCard"
import AdminModal from "@/components/admin/common/AdminModal"

const HISTORY_FILTER_INPUT =
  "h-8 rounded-md border border-slate-300 bg-white px-2 text-[11px] text-slate-700 shadow-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/20"

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`
}

export default function AdminMainPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [summary, setSummary] = useState({
    cities: 0,
    categories: 0,
    destinations: 0,
    active: 0,
    inactive: 0,
    routes: 0,
    facilities: 0,
  })
  const [clusterHistorySummary, setClusterHistorySummary] = useState({
    total_runs: 0,
    avg_precision: 0,
    avg_recall: 0,
    avg_f1: 0,
  })
  const [clusterHistoryItems, setClusterHistoryItems] = useState<ClusterHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState("")
  const [historyDateFromDraft, setHistoryDateFromDraft] = useState("")
  const [historyDateToDraft, setHistoryDateToDraft] = useState("")
  const [historyUserDraft, setHistoryUserDraft] = useState("")
  const [historyDateFromApplied, setHistoryDateFromApplied] = useState("")
  const [historyDateToApplied, setHistoryDateToApplied] = useState("")
  const [historyUserApplied, setHistoryUserApplied] = useState("")
  const [detailItem, setDetailItem] = useState<ClusterHistoryItem | null>(null)
  const [historyDeletingId, setHistoryDeletingId] = useState<number | null>(null)

  const loadClusterHistory = useCallback(async () => {
    setHistoryLoading(true)
    setHistoryError("")
    try {
      const history = await fetchAdminClusterHistory({
        dateFrom: historyDateFromApplied || undefined,
        dateTo: historyDateToApplied || undefined,
        userEmail: historyUserApplied || undefined,
      })
      setClusterHistorySummary(history.summary)
      setClusterHistoryItems(history.items)
    } catch (err) {
      setHistoryError((err as Error).message)
    } finally {
      setHistoryLoading(false)
    }
  }, [historyDateFromApplied, historyDateToApplied, historyUserApplied])

  useEffect(() => {
    let isMounted = true
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const loadDashboardSummary = async (): Promise<boolean> => {
      if (!isMounted) return false
      setLoading(true)
      setError("")
      try {
        const [response, transjakarta, facilities] = await Promise.all([
          fetchAdminMasterData(),
          fetchTransjakartaDbSummary(),
          fetchFacilitiesSummary(),
        ])
        const active = response.destinations.filter((item) => item.is_active).length
        setSummary({
          cities: response.cities.length,
          categories: response.categories.length,
          destinations: response.destinations.length,
          active,
          inactive: response.destinations.length - active,
          routes: transjakarta.summary.total_routes,
          facilities: facilities.summary.total_restaurants + facilities.summary.total_minimarkets,
        })
        return true
      } catch (err) {
        if (isMounted) {
          setError((err as Error).message)
        }
        return false
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    const run = async () => {
      const ok = await loadDashboardSummary()
      if (!ok && isMounted) {
        retryTimer = setTimeout(run, 5000)
      }
    }

    run()

    return () => {
      isMounted = false
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [])

  useEffect(() => {
    void loadClusterHistory()
  }, [loadClusterHistory])

  const resetHistoryFilters = () => {
    setHistoryDateFromDraft("")
    setHistoryDateToDraft("")
    setHistoryUserDraft("")
    setHistoryDateFromApplied("")
    setHistoryDateToApplied("")
    setHistoryUserApplied("")
  }

  const handleDeleteClusterHistory = async (item: ClusterHistoryItem) => {
    if (
      !window.confirm(
        `Hapus riwayat cluster #${item.id} milik ${item.user_email}? Tindakan ini tidak dapat dibatalkan.`,
      )
    ) {
      return
    }
    setHistoryDeletingId(item.id)
    setHistoryError("")
    try {
      await deleteAdminClusterHistory(item.id)
      if (detailItem?.id === item.id) setDetailItem(null)
      await loadClusterHistory()
    } catch (err) {
      setHistoryError((err as Error).message)
    } finally {
      setHistoryDeletingId(null)
    }
  }

  const cards = useMemo(
    () => [
      { title: "Cities", count: summary.cities, href: "/admin/city-management", icon: Building2, caption: "kota/distrik" },
      { title: "Categories", count: summary.categories, href: "/admin/category-management", icon: Shapes, caption: "kategori" },
      { title: "Destinations", count: summary.destinations, href: "/admin/destination-management", icon: MapPinned, caption: "destinasi" },
      { title: "Active", count: summary.active, href: "/admin/destination-management?status=active", icon: Layers3, caption: `inactive: ${summary.inactive}` },
      { title: "TransJakarta", count: summary.routes, href: "/admin/transjakarta-data", icon: BusFront, caption: "rute" },
      { title: "Facilities", count: summary.facilities, href: "/admin/facilities-data", icon: Store, caption: "restoran + minimarket" },
    ],
    [summary],
  )

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">Dashboard</h2>
          <p className="text-[11px] text-slate-500">Ringkasan modul admin</p>
        </div>
        {loading && <span className="text-[10px] text-slate-400">memuat…</span>}
      </div>

      {error && (
        <div className="admin-alert-error text-xs">{error}</div>
      )}

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <Link
              key={card.title}
              href={card.href}
              className="group admin-panel flex flex-col gap-1 p-3 transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {card.title}
                </span>
                <Icon className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-700" />
              </div>
              <p className="text-2xl font-semibold tabular-nums leading-none text-slate-900">
                {loading ? (
                  <span className="inline-block h-6 w-10 animate-pulse rounded bg-slate-200" />
                ) : (
                  card.count.toLocaleString("id-ID")
                )}
              </p>
              <p className="truncate text-[10px] text-slate-400">{card.caption}</p>
            </Link>
          )
        })}
      </div>

      <TableCard
        title="Riwayat Cluster User"
        icon={Layers3}
        description={
          historyLoading
            ? "Memuat riwayat…"
            : `Total ${clusterHistorySummary.total_runs.toLocaleString("id-ID")} run (filter) · Precision ${(clusterHistorySummary.avg_precision * 100).toFixed(1)}% · Recall ${(clusterHistorySummary.avg_recall * 100).toFixed(1)}% · F1 ${(clusterHistorySummary.avg_f1 * 100).toFixed(1)}%`
        }
        toolbarExtras={
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2">
            <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
              <span className="shrink-0">Dari</span>
              <input
                type="date"
                value={historyDateFromDraft}
                onChange={(e) => {
                  const value = e.target.value
                  setHistoryDateFromDraft(value)
                  setHistoryDateFromApplied(value)
                }}
                className={`${HISTORY_FILTER_INPUT} w-[9.5rem]`}
              />
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
              <span className="shrink-0">Sampai</span>
              <input
                type="date"
                value={historyDateToDraft}
                onChange={(e) => {
                  const value = e.target.value
                  setHistoryDateToDraft(value)
                  setHistoryDateToApplied(value)
                }}
                className={`${HISTORY_FILTER_INPUT} w-[9.5rem]`}
              />
            </label>
            <input
              type="text"
              value={historyUserDraft}
              onChange={(e) => {
                const value = e.target.value
                setHistoryUserDraft(value)
                setHistoryUserApplied(value.trim())
              }}
              placeholder="Email / nama user"
              className={`${HISTORY_FILTER_INPUT} w-[min(100%,13rem)]`}
            />
          </div>
        }
        actions={
          <>
            <button
              type="button"
              onClick={() => void loadClusterHistory()}
              disabled={historyLoading}
              title="Muat ulang dari server"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${historyLoading ? "animate-spin" : ""}`} aria-hidden />
            </button>
            <button
              type="button"
              onClick={resetHistoryFilters}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-semibold text-slate-600 shadow-sm transition-colors hover:bg-white"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Reset
            </button>
          </>
        }
      >
        {historyError && <div className="admin-alert-error m-3 text-xs">{historyError}</div>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] text-sm">
            <thead>
              <tr className="admin-table-head">
                <th className="px-4 py-2.5 text-left text-[11px]">Query</th>
                <th className="px-4 py-2.5 text-left text-[11px]">Hotel</th>
                <th className="px-4 py-2.5 text-right text-[11px]">Hari</th>
                <th className="px-4 py-2.5 text-right text-[11px]">POI</th>
                <th className="px-4 py-2.5 text-right text-[11px]">Precision</th>
                <th className="px-4 py-2.5 text-right text-[11px]">Recall</th>
                <th className="px-4 py-2.5 text-right text-[11px]">F1</th>
                <th className="w-32 px-4 py-2.5 text-center text-[11px]">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {clusterHistoryItems.length === 0 && (
                <tr className="admin-table-row">
                  <td colSpan={8} className="p-0 align-middle">
                    <div className="admin-empty-state">
                      {historyLoading ? (
                        <>
                          <RefreshCw className="h-10 w-10 shrink-0 animate-spin text-slate-300" aria-hidden />
                          <p className="text-sm font-medium text-slate-500">Memuat…</p>
                        </>
                      ) : (
                        <>
                          <Inbox className="h-10 w-10 shrink-0 text-slate-300" aria-hidden />
                          <p className="text-sm font-medium text-slate-500">Tidak ada data</p>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              {clusterHistoryItems.map((item) => (
                <tr key={item.id} className="admin-table-row">
                  <td className="max-w-[320px] truncate px-4 py-2.5 text-xs text-slate-700">{item.query_text}</td>
                  <td className="max-w-[180px] truncate px-4 py-2.5 text-xs text-slate-700">{item.hotel_name || "-"}</td>
                  <td className="px-4 py-2.5 text-right text-xs tabular-nums">{item.num_days}</td>
                  <td className="px-4 py-2.5 text-right text-xs tabular-nums">{item.total_pois}</td>
                  <td className="px-4 py-2.5 text-right text-xs tabular-nums">
                    {(item.precision_score * 100).toFixed(1)}%
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs tabular-nums">
                    {(item.recall_score * 100).toFixed(1)}%
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs tabular-nums font-semibold text-slate-900">
                    {(item.f1_score * 100).toFixed(1)}%
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-center">
                    <div className="inline-flex items-center justify-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => setDetailItem(item)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border-0 bg-transparent text-emerald-600 outline-none transition-colors hover:bg-emerald-500/15 hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500/35"
                        title="Lihat detail"
                      >
                        <Eye className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteClusterHistory(item)}
                        disabled={historyDeletingId === item.id}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border-0 bg-transparent text-red-600 outline-none transition-colors hover:bg-red-500/15 hover:text-red-700 focus-visible:ring-2 focus-visible:ring-red-500/35 disabled:pointer-events-none disabled:opacity-45"
                        title="Hapus riwayat"
                      >
                        <Trash2 className={`h-4 w-4 ${historyDeletingId === item.id ? "animate-pulse" : ""}`} aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TableCard>

      <AdminModal
        open={detailItem !== null}
        title="Detail riwayat cluster"
        onClose={() => setDetailItem(null)}
        size="2xl"
      >
        {detailItem ? (
          <div className="text-[11px] text-slate-700">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start">
              {/* Kolom kiri — ringkasan user + preferensi/query */}
              <div className="flex min-h-0 min-w-0 flex-col gap-3 lg:self-start">
                <div className="grid grid-cols-1 gap-2">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">ID</p>
                    <p className="mt-0.5 font-semibold tabular-nums text-slate-900">{detailItem.id}</p>
                  </div>
                </div>
                <div className="flex min-h-[12rem] max-h-[min(70vh,30rem)] min-w-0 flex-col">
                  <p className="mb-1.5 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Preferensi / query pipeline
                  </p>
                  <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-800">
                    {detailItem.query_text}
                  </pre>
                </div>
              </div>

              {/* Kolom tengah — metrik (tinggi tetap mengikuti isi kotaknya, tidak meregang ikut kolom lain) */}
              <div className="grid min-w-0 grid-cols-2 content-start gap-2 lg:self-start">
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <p className="text-[10px] text-slate-500">Hari</p>
                  <p className="font-semibold tabular-nums text-slate-900">{detailItem.num_days}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <p className="text-[10px] text-slate-500">Total POI</p>
                  <p className="font-semibold tabular-nums text-slate-900">{detailItem.total_pois}</p>
                </div>
                <div className="col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <p className="text-[10px] text-slate-500">Hotel</p>
                  <p className="truncate font-medium text-slate-900">{detailItem.hotel_name || "-"}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <p className="text-[10px] text-slate-500">K optimal</p>
                  <p className="font-medium tabular-nums text-slate-900">{detailItem.k_optimal}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <p className="text-[10px] text-slate-500">Silhouette</p>
                  <p className="font-medium tabular-nums text-slate-900">{detailItem.silhouette_score.toFixed(4)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <p className="text-[10px] text-slate-500">Davies-Bouldin</p>
                  <p className="font-medium tabular-nums text-slate-900">{detailItem.davies_bouldin_index.toFixed(4)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <p className="text-[10px] text-slate-500">WCSS</p>
                  <p className="font-medium tabular-nums text-slate-900">{detailItem.wcss.toFixed(4)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <p className="text-[10px] text-slate-500">Precision</p>
                  <p className="font-medium tabular-nums text-slate-900">{pct(detailItem.precision_score)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <p className="text-[10px] text-slate-500">Recall</p>
                  <p className="font-medium tabular-nums text-slate-900">{pct(detailItem.recall_score)}</p>
                </div>
                <div className="col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[10px] text-slate-500">F1</p>
                  <p className="font-semibold tabular-nums text-slate-900">{pct(detailItem.f1_score)}</p>
                </div>
              </div>

              {/* Kolom kanan — destinasi: mengalir ke samping + wrap dalam kolom ini saja */}
              <div className="flex min-w-0 flex-col rounded-lg border border-slate-200 bg-white lg:self-start">
                <p className="shrink-0 border-b border-slate-200 bg-slate-50/80 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Destinasi untuk evaluasi rekomendasi
                </p>
                <div className="wjai-scrollbar-hover-thin max-h-[min(70vh,30rem)] min-w-0 overflow-y-auto px-2 py-2">
                  {detailItem.selected_destinations && detailItem.selected_destinations.length > 0 ? (
                    <div className="flex flex-wrap content-start gap-1.5">
                      {detailItem.selected_destinations.map((name, idx) => (
                        <span
                          key={`${detailItem.id}-dest-${idx}`}
                          className="inline-block max-w-full break-words rounded-md border border-slate-100 bg-slate-50/90 px-1.5 py-1 text-left text-[9px] leading-tight text-slate-800"
                          title={name}
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="px-1 py-2 text-[10px] text-slate-500">Belum ada data destinasi tersimpan.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </AdminModal>
    </section>
  )
}
