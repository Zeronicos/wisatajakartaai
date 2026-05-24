'use client'

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { BusFront, Database, Inbox, ToggleLeft, ToggleRight } from "lucide-react"
import {
  fetchTransjakartaFiles,
  fetchTransjakartaRecords,
  updateTransjakartaRouteStatus,
} from "@/lib/api"
import type { PaginationMeta, TransjakartaFileInfo } from "@/lib/types"
import IconActionButton from "@/components/admin/common/IconActionButton"
import PaginationControls from "@/components/admin/common/PaginationControls"
import TableCard from "@/components/admin/common/TableCard"
import ToastStack from "@/components/admin/common/ToastStack"
import { useToast } from "@/components/admin/common/useToast"

const DATASET_OPTIONS = [
  { id: "stops", label: "Stops" },
  { id: "routes", label: "Routes" },
  { id: "trips", label: "Trips" },
  { id: "shapes", label: "Shapes" },
  { id: "stop_times", label: "Stop Times" },
] as const

const DEFAULT_META: PaginationMeta = { page: 1, page_size: 20, total: 0, total_pages: 1 }

export default function TransjakartaDataPage() {
  const searchParams = useSearchParams()
  const datasetFromUrl = searchParams.get("dataset")
  const selectedDataset = DATASET_OPTIONS.some((item) => item.id === datasetFromUrl)
    ? (datasetFromUrl as (typeof DATASET_OPTIONS)[number]["id"])
    : "stops"

  const [rows, setRows] = useState<TransjakartaFileInfo[]>([])
  const [records, setRecords] = useState<Record<string, string | number | boolean | null>[]>([])
  const [recordMeta, setRecordMeta] = useState<PaginationMeta>(DEFAULT_META)
  const [loading, setLoading] = useState(true)
  const [queryInput, setQueryInput] = useState("")
  const [query, setQuery] = useState("")
  const [updatingRouteId, setUpdatingRouteId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const toast = useToast()

  const loadRecords = async (page = 1, searchQuery = query) => {
    const response = await fetchTransjakartaRecords({
      dataset: selectedDataset,
      q: searchQuery,
      page,
      pageSize: 20,
    })
    setRecords(response.items)
    setRecordMeta(response.meta)
  }

  const loadData = async () => {
    try {
      const fileResponse = await fetchTransjakartaFiles()
      setRows(fileResponse.files)
      await loadRecords(1, query)
      setError("")
    } catch (err) {
      const message = (err as Error).message
      setError(message)
      toast.showError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setQueryInput("")
    setQuery("")
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDataset])

  const recordColumns = useMemo(() => {
    const first = records[0]
    return first ? Object.keys(first) : []
  }, [records])

  const handleSearch = async () => {
    setLoading(true)
    setQuery(queryInput)
    try {
      await loadRecords(1, queryInput)
    } catch (err) {
      const message = (err as Error).message
      setError(message)
      toast.showError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleRouteStatus = async (row: Record<string, string | number | boolean | null>) => {
    const routeId = String(row.route_id ?? "").trim()
    if (!routeId) return
    const rawActive = row.is_active
    const isActive = rawActive === true || rawActive === 1 || rawActive === "1" || rawActive === "true"
    try {
      setUpdatingRouteId(routeId)
      const response = await updateTransjakartaRouteStatus(routeId, !isActive)
      setRecords((prev) =>
        prev.map((item) =>
          String(item.route_id ?? "") === routeId
            ? { ...item, is_active: response.route.is_active }
            : item,
        ),
      )
      toast.showSuccess(
        `Route ${routeId} ${response.route.is_active ? "diaktifkan" : "dinonaktifkan"}.
Tidak aktif tidak dipakai di EDA dan perhitungan jarak halte clustering.`,
      )
    } catch (err) {
      const message = (err as Error).message
      setError(message)
      toast.showError(message)
    } finally {
      setUpdatingRouteId(null)
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">TransJakarta</h2>
        <p className="text-[11px] text-slate-500">Kelola data GTFS TransJakarta di database.</p>
      </div>

      {error && <div className="admin-alert-error text-xs">{error}</div>}
      <ToastStack items={toast.items} onDismiss={toast.dismiss} />

      {/* File table */}
      <TableCard title="Daftar File GTFS" icon={BusFront} description="Metadata file GTFS TransJakarta">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="admin-table-head">
                <th className="px-5 py-3 text-left">File</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-left">Kolom</th>
                <th className="px-5 py-3 text-right">Total Record</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} className="p-0 align-middle">
                    <div className="admin-empty-state">
                      <Database className="h-10 w-10 shrink-0 animate-pulse text-slate-300" aria-hidden />
                      <p className="text-sm font-medium text-slate-500">Memuat…</p>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-0 align-middle">
                    <div className="admin-empty-state">
                      <Inbox className="h-10 w-10 shrink-0 text-slate-300" aria-hidden />
                      <p className="text-sm font-medium text-slate-500">Tidak ada data</p>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && rows.map((item) => (
                <tr key={item.file_name} className="admin-table-row">
                  <td className="px-5 py-3 font-semibold text-slate-800">{item.file_name}</td>
                  <td className="px-5 py-3">
                    <span className={item.exists ? "admin-badge-success" : "admin-badge-danger"}>
                      {item.exists ? "Tersedia" : "Tidak Ada"}
                    </span>
                  </td>
                  <td className="px-5 py-3 tabular-nums text-slate-600">{item.column_count}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-600">{item.row_count.toLocaleString("id-ID")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TableCard>

      {/* Records table */}
      <TableCard
        title={`Data ${selectedDataset} (Database)`}
        icon={Database}
        description={selectedDataset === "routes" ? "Route nonaktif tidak dimuat ke EDA dan tidak dipakai hitung jarak halte di clustering." : undefined}
        searchValue={queryInput}
        searchPlaceholder="Cari data..."
        onSearchChange={setQueryInput}
        onSearchSubmit={handleSearch}
      >

        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="admin-table-head">
                {recordColumns.map((column) => (
                  <th key={column} className="px-5 py-3 text-left">{column}</th>
                ))}
                {selectedDataset === "routes" ? (
                  <th className="px-5 py-3 text-center">Aksi</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {records.length === 0 && (
                <tr>
                  <td colSpan={(recordColumns.length || 1) + (selectedDataset === "routes" ? 1 : 0)} className="p-0 align-middle">
                    <div className="admin-empty-state">
                      <Inbox className="h-10 w-10 shrink-0 text-slate-300" aria-hidden />
                      <p className="text-sm font-medium text-slate-500">Tidak ada data</p>
                    </div>
                  </td>
                </tr>
              )}
              {records.map((row, index) => (
                <tr key={`row-${index}`} className="admin-table-row">
                  {recordColumns.map((column) => (
                    <td key={`${index}-${column}`} className="px-5 py-3 text-slate-600">
                      {column === "is_active" ? (
                        row[column] === true || row[column] === 1 || row[column] === "1" || row[column] === "true" ? (
                          <span className="admin-badge-success">Aktif</span>
                        ) : (
                          <span className="admin-badge-danger">Nonaktif</span>
                        )
                      ) : row[column] != null ? (
                        String(row[column])
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                  ))}
                  {selectedDataset === "routes" ? (
                    <td className="px-5 py-3 text-center">
                      <div className="flex items-center justify-center">
                        <IconActionButton
                          label={
                            row.is_active === true || row.is_active === 1 || row.is_active === "1" || row.is_active === "true"
                              ? "Nonaktifkan route"
                              : "Aktifkan route"
                          }
                          icon={
                            row.is_active === true || row.is_active === 1 || row.is_active === "1" || row.is_active === "true"
                              ? ToggleRight
                              : ToggleLeft
                          }
                          variant={
                            row.is_active === true || row.is_active === 1 || row.is_active === "1" || row.is_active === "true"
                              ? "success"
                              : "default"
                          }
                          disabled={updatingRouteId === String(row.route_id ?? "")}
                          onClick={() => handleToggleRouteStatus(row)}
                        />
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <PaginationControls
          page={recordMeta.page}
          totalPages={recordMeta.total_pages}
          total={recordMeta.total}
          onPrev={async () => {
            if (recordMeta.page <= 1) return
            setLoading(true)
            try { await loadRecords(recordMeta.page - 1) } finally { setLoading(false) }
          }}
          onNext={async () => {
            if (recordMeta.page >= recordMeta.total_pages) return
            setLoading(true)
            try { await loadRecords(recordMeta.page + 1) } finally { setLoading(false) }
          }}
        />
      </TableCard>
    </section>
  )
}
