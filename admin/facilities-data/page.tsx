'use client'

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Inbox, Pencil, Store, Trash2, UtensilsCrossed } from "lucide-react"
import {
  deleteFacilityRecord,
  fetchFacilitiesSummary,
  fetchFacilityRecords,
  updateFacilityRecord,
} from "@/lib/api"
import type { FacilitiesSummary, PaginationMeta } from "@/lib/types"
import AdminModal from "@/components/admin/common/AdminModal"
import IconActionButton from "@/components/admin/common/IconActionButton"
import PaginationControls from "@/components/admin/common/PaginationControls"
import TableCard from "@/components/admin/common/TableCard"
import ToastStack from "@/components/admin/common/ToastStack"
import { useToast } from "@/components/admin/common/useToast"

const FACILITY_OPTIONS = [
  { id: "restaurants", label: "Restoran" },
  { id: "minimarkets", label: "Minimarket" },
] as const

const DEFAULT_META: PaginationMeta = { page: 1, page_size: 20, total: 0, total_pages: 1 }

export default function FacilitiesDataPage() {
  const searchParams = useSearchParams()
  const facilityFromUrl = searchParams.get("facility")
  const selectedFacility = FACILITY_OPTIONS.some((item) => item.id === facilityFromUrl)
    ? (facilityFromUrl as (typeof FACILITY_OPTIONS)[number]["id"])
    : "restaurants"

  const [summary, setSummary] = useState<FacilitiesSummary | null>(null)
  const [records, setRecords] = useState<Record<string, string | number | null>[]>([])
  const [recordMeta, setRecordMeta] = useState<PaginationMeta>(DEFAULT_META)
  const [loading, setLoading] = useState(true)
  const [queryInput, setQueryInput] = useState("")
  const [query, setQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("")
  const [editTarget, setEditTarget] = useState<Record<string, string | number | null> | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Record<string, string | number | null> | null>(null)
  const [editForm, setEditForm] = useState({
    name: "",
    category: "",
    subcategory: "",
    cuisine: "",
    brand: "",
    facility_type: "",
  })
  const [error, setError] = useState("")
  const toast = useToast()

  const loadRecords = async (
    page = 1,
    searchQuery = query,
    category = selectedCategory,
  ) => {
    const response = await fetchFacilityRecords({
      facility: selectedFacility,
      q: searchQuery,
      category,
      page,
      pageSize: 20,
    })
    setRecords(response.items)
    setRecordMeta(response.meta)
  }

  const loadData = async () => {
    try {
      const response = await fetchFacilitiesSummary()
      setSummary(response.summary)
      await loadRecords(1, query, selectedCategory)
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
    setSelectedCategory("")
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFacility])

  const categoryOptions =
    selectedFacility === "restaurants"
      ? (summary?.restaurant_categories ?? []).map((item) => item.category_name)
      : (summary?.minimarket_categories ?? []).map((item) => item.category_name)

  const recordColumns = records[0] ? Object.keys(records[0]) : []
  const sortedRecords = useMemo(() => records, [records])

  const openEditModal = (record: Record<string, string | number | null>) => {
    setEditTarget(record)
    setEditForm({
      name: String(record.name ?? ""),
      category: String(record.category ?? ""),
      subcategory: String(record.subcategory ?? ""),
      cuisine: String(record.cuisine ?? ""),
      brand: String(record.brand ?? ""),
      facility_type: String(record.facility_type ?? ""),
    })
  }

  const submitEdit = async () => {
    if (!editTarget?.id) return
    try {
      await updateFacilityRecord(selectedFacility, Number(editTarget.id), {
        name: editForm.name,
        category: editForm.category || null,
        subcategory: editForm.subcategory || null,
        cuisine: editForm.cuisine || null,
        brand: editForm.brand || null,
        facility_type: editForm.facility_type || null,
      })
      toast.showSuccess("Data fasilitas berhasil diperbarui.")
      setEditTarget(null)
      await loadRecords(recordMeta.page, query, selectedCategory)
      await loadData()
    } catch (err) {
      const message = (err as Error).message
      setError(message)
      toast.showError(message)
    }
  }

  const submitDelete = async () => {
    if (!deleteTarget?.id) return
    try {
      await deleteFacilityRecord(selectedFacility, Number(deleteTarget.id))
      toast.showSuccess("Data fasilitas berhasil dihapus.")
      setDeleteTarget(null)
      await loadRecords(1, query, selectedCategory)
      await loadData()
    } catch (err) {
      const message = (err as Error).message
      setError(message)
      toast.showError(message)
    }
  }

  const handleSearch = async () => {
    setLoading(true)
    setQuery(queryInput)
    try {
      await loadRecords(1, queryInput, selectedCategory)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">Fasilitas</h2>
        <p className="text-[11px] text-slate-500">Kelola data restoran dan minimarket Jakarta.</p>
      </div>

      {error && <div className="admin-alert-error text-xs">{error}</div>}
      <ToastStack items={toast.items} onDismiss={toast.dismiss} />

      {/* Records table */}
      <TableCard
        title={`Data ${selectedFacility === "restaurants" ? "Restoran" : "Minimarket"}`}
        icon={selectedFacility === "restaurants" ? UtensilsCrossed : Store}
        description="Database records"
        searchValue={queryInput}
        searchPlaceholder="Cari nama / kategori / brand..."
        onSearchChange={setQueryInput}
        onSearchSubmit={handleSearch}
        toolbarExtras={
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="admin-select"
          >
            <option value="">Semua kategori</option>
            {categoryOptions.map((categoryName) => (
              <option key={categoryName} value={categoryName}>{categoryName}</option>
            ))}
          </select>
        }
      >

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
            <thead>
              <tr className="admin-table-head">
                {recordColumns.map((column) => (
                  <th key={column} className="px-5 py-3 text-left">{column}</th>
                ))}
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {sortedRecords.length === 0 && (
                <tr>
                  <td colSpan={(recordColumns.length || 1) + 1} className="p-0 align-middle">
                    <div className="admin-empty-state">
                      <Inbox className="h-10 w-10 shrink-0 text-slate-300" aria-hidden />
                      <p className="text-sm font-medium text-slate-500">Tidak ada data</p>
                    </div>
                  </td>
                </tr>
              )}
              {sortedRecords.map((row, index) => (
                <tr key={`record-${index}`} className="admin-table-row">
                  {recordColumns.map((column) => (
                    <td key={`${index}-${column}`} className="px-5 py-3 text-slate-600">
                      {row[column] != null ? String(row[column]) : <span className="text-slate-300">-</span>}
                    </td>
                  ))}
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex items-center gap-0.5">
                      <IconActionButton label="Edit data" icon={Pencil} onClick={() => openEditModal(row)} />
                      <IconActionButton label="Hapus data" icon={Trash2} variant="danger" onClick={() => setDeleteTarget(row)} />
                    </div>
                  </td>
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
            try { await loadRecords(recordMeta.page - 1, query, selectedCategory) } finally { setLoading(false) }
          }}
          onNext={async () => {
            if (recordMeta.page >= recordMeta.total_pages) return
            setLoading(true)
            try { await loadRecords(recordMeta.page + 1, query, selectedCategory) } finally { setLoading(false) }
          }}
        />
      </TableCard>

      {/* Edit Modal */}
      <AdminModal
        open={!!editTarget}
        title="Edit Data Fasilitas"
        onClose={() => setEditTarget(null)}
        footer={
          <>
            <button onClick={() => setEditTarget(null)} className="admin-btn-cancel">Batal</button>
            <button onClick={submitEdit} className="admin-btn-primary">Simpan</button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="admin-label">Nama</label>
            <input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} className="admin-modal-input" />
          </div>
          <div>
            <label className="admin-label">Category</label>
            <input value={editForm.category} onChange={(e) => setEditForm((p) => ({ ...p, category: e.target.value }))} className="admin-modal-input" />
          </div>
          <div>
            <label className="admin-label">Subcategory</label>
            <input value={editForm.subcategory} onChange={(e) => setEditForm((p) => ({ ...p, subcategory: e.target.value }))} className="admin-modal-input" />
          </div>
          <div>
            <label className="admin-label">Cuisine</label>
            <input value={editForm.cuisine} onChange={(e) => setEditForm((p) => ({ ...p, cuisine: e.target.value }))} className="admin-modal-input" />
          </div>
          <div>
            <label className="admin-label">Brand</label>
            <input value={editForm.brand} onChange={(e) => setEditForm((p) => ({ ...p, brand: e.target.value }))} className="admin-modal-input" />
          </div>
        </div>
      </AdminModal>

      {/* Delete Modal */}
      <AdminModal
        open={!!deleteTarget}
        title="Konfirmasi Hapus"
        onClose={() => setDeleteTarget(null)}
        footer={
          <>
            <button onClick={() => setDeleteTarget(null)} className="admin-btn-cancel">Batal</button>
            <button onClick={submitDelete} className="admin-btn-danger">Hapus</button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Yakin ingin menghapus data <span className="font-semibold text-slate-800">{String(deleteTarget?.name ?? "-")}</span>?
        </p>
      </AdminModal>
    </section>
  )
}
