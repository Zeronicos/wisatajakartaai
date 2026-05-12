'use client'

import { useEffect, useMemo, useState } from "react"
import { Building2, Inbox, Trash2 } from "lucide-react"
import { deleteAdminCity, fetchAdminCities } from "@/lib/api"
import type { AdminCity, PaginationMeta } from "@/lib/types"
import AdminModal from "@/components/admin/common/AdminModal"
import IconActionButton from "@/components/admin/common/IconActionButton"
import PaginationControls from "@/components/admin/common/PaginationControls"
import SortableHeader from "@/components/admin/common/SortableHeader"
import TableCard from "@/components/admin/common/TableCard"
import ToastStack from "@/components/admin/common/ToastStack"
import { useToast } from "@/components/admin/common/useToast"

const DEFAULT_META: PaginationMeta = { page: 1, page_size: 10, total: 0, total_pages: 1 }

export default function CityManagementPage() {
  const [rows, setRows] = useState<AdminCity[]>([])
  const [meta, setMeta] = useState<PaginationMeta>(DEFAULT_META)
  const [query, setQuery] = useState("")
  const [error, setError] = useState("")
  const [sortBy, setSortBy] = useState<"id" | "name">("id")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [deleteTarget, setDeleteTarget] = useState<AdminCity | null>(null)
  const toast = useToast()

  const loadData = async (page = 1) => {
    try {
      const response = await fetchAdminCities({ q: query, page, pageSize: 10 })
      setRows(response.items)
      setMeta(response.meta)
    } catch (err) {
      const message = (err as Error).message
      setError(message)
      toast.showError(message)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submitDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteAdminCity(deleteTarget.id)
      await loadData(1)
      toast.showSuccess("Kota berhasil dihapus.")
      setDeleteTarget(null)
    } catch (err) {
      const message = (err as Error).message
      setError(message)
      toast.showError(message)
    }
  }

  const sortedRows = useMemo(() => {
    const clone = [...rows]
    clone.sort((a, b) => {
      const left = sortBy === "id" ? a.id : a.name.toLowerCase()
      const right = sortBy === "id" ? b.id : b.name.toLowerCase()
      if (left < right) return sortDir === "asc" ? -1 : 1
      if (left > right) return sortDir === "asc" ? 1 : -1
      return 0
    })
    return clone
  }, [rows, sortBy, sortDir])

  const toggleSort = (column: "id" | "name") => {
    if (sortBy === column) {
      setSortDir((previous) => (previous === "asc" ? "desc" : "asc"))
      return
    }
    setSortBy(column)
    setSortDir("asc")
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">Kota &amp; wilayah</h2>
        <p className="text-[11px] text-slate-500">Kelola data kota atau distrik untuk destinasi wisata.</p>
      </div>

      {error && <div className="admin-alert-error text-xs">{error}</div>}
      <ToastStack items={toast.items} onDismiss={toast.dismiss} />

      <TableCard
        title="Daftar kota"
        icon={Building2}
        description={`${meta.total.toLocaleString("id-ID")} baris`}
        searchValue={query}
        searchPlaceholder="Cari kota…"
        onSearchChange={setQuery}
        onSearchSubmit={() => loadData(1)}
      >

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="admin-table-head">
                <SortableHeader label="ID" active={sortBy === "id"} direction={sortDir} onToggle={() => toggleSort("id")} />
                <SortableHeader label="Kota" active={sortBy === "name"} direction={sortDir} onToggle={() => toggleSort("name")} />
                <th className="px-4 py-2.5 text-right text-[11px]">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-0 align-middle">
                    <div className="admin-empty-state">
                      <Inbox className="h-10 w-10 shrink-0 text-slate-300" aria-hidden />
                      <p className="text-sm font-medium text-slate-500">Tidak ada data</p>
                    </div>
                  </td>
                </tr>
              )}
              {sortedRows.map((city) => (
                <tr key={city.id} className="admin-table-row">
                  <td className="px-4 py-2.5 font-mono text-[11px] font-medium text-slate-400">{city.id}</td>
                  <td className="px-4 py-2.5 font-semibold text-slate-800">{city.name}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      <IconActionButton label="Hapus kota" icon={Trash2} variant="danger" onClick={() => setDeleteTarget(city)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <PaginationControls
          page={meta.page}
          totalPages={meta.total_pages}
          total={meta.total}
          onPrev={() => loadData(Math.max(1, meta.page - 1))}
          onNext={() => loadData(Math.min(meta.total_pages, meta.page + 1))}
        />
      </TableCard>

      <AdminModal
        open={!!deleteTarget}
        title="Hapus kota"
        onClose={() => setDeleteTarget(null)}
        footer={
          <>
            <button type="button" onClick={() => setDeleteTarget(null)} className="admin-btn-cancel">
              Batal
            </button>
            <button type="button" onClick={submitDelete} className="admin-btn-danger">
              Hapus
            </button>
          </>
        }
      >
        <p className="text-[13px] text-slate-600">
          Yakin ingin menghapus kota <span className="font-semibold text-slate-900">{deleteTarget?.name}</span>?
        </p>
      </AdminModal>
    </section>
  )
}
