'use client'

import { useEffect, useMemo, useState } from "react"
import { Eye, Inbox, MapPinned, SquarePen, ToggleLeft, ToggleRight, Trash2, BookOpenText } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  deleteAdminDestination,
  fetchAdminDestinations,
  fetchAdminMasterData,
  updateAdminDestinationStatus,
  updateAdminDestinationDescription,
  fetchAdminDestinationWikipediaDescription,
  backfillAdminWikipediaDescriptions,
} from "@/lib/api"
import type { AdminCategory, AdminCity, AdminDestination, PaginationMeta } from "@/lib/types"
import AdminModal from "@/components/admin/common/AdminModal"
import IconActionButton from "@/components/admin/common/IconActionButton"
import PaginationControls from "@/components/admin/common/PaginationControls"
import SortableHeader from "@/components/admin/common/SortableHeader"
import TableCard from "@/components/admin/common/TableCard"
import ToastStack from "@/components/admin/common/ToastStack"
import { useToast } from "@/components/admin/common/useToast"

const DEFAULT_META: PaginationMeta = { page: 1, page_size: 10, total: 0, total_pages: 1 }

const STATUS_OPTIONS: { value: "all" | "active" | "inactive"; label: string }[] = [
  { value: "all", label: "Semua status" },
  { value: "active", label: "Aktif" },
  { value: "inactive", label: "Nonaktif" },
]

export default function DestinationManagementPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [cityOptions, setCityOptions] = useState<AdminCity[]>([])
  const [categoryOptions, setCategoryOptions] = useState<AdminCategory[]>([])
  const [rows, setRows] = useState<AdminDestination[]>([])
  const [meta, setMeta] = useState<PaginationMeta>(DEFAULT_META)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all")
  const [cityFilter, setCityFilter] = useState<number | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null)
  const [error, setError] = useState("")
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [sortBy, setSortBy] = useState<"id" | "name" | "city" | "category" | "status">("id")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [deleteTarget, setDeleteTarget] = useState<AdminDestination | null>(null)
  const [descriptionTarget, setDescriptionTarget] = useState<AdminDestination | null>(null)
  const [descriptionDraft, setDescriptionDraft] = useState("")
  const [savingDescription, setSavingDescription] = useState(false)
  const [loadingWikipedia, setLoadingWikipedia] = useState(false)
  const [wikipediaSourceUrl, setWikipediaSourceUrl] = useState("")
  const [backfillingWikipedia, setBackfillingWikipedia] = useState(false)
  const toast = useToast()

  useEffect(() => {
    const incoming = searchParams.get("status")
    if (incoming === "active" || incoming === "inactive" || incoming === "all") {
      setStatus(incoming)
    }
  }, [searchParams])

  const setStatusFilter = (next: "all" | "active" | "inactive") => {
    setStatus(next)
    router.replace(`/admin/destination-management?status=${next}`, { scroll: false })
  }

  const loadOptions = async () => {
    try {
      const response = await fetchAdminMasterData()
      setCityOptions(response.cities)
      setCategoryOptions(response.categories)
    } catch (err) {
      const message = (err as Error).message
      setError(message)
      toast.showError(message)
    }
  }

  const loadData = async (page = 1) => {
    try {
      const response = await fetchAdminDestinations({
        q: query,
        cityId: cityFilter,
        categoryId: categoryFilter,
        status,
        page,
        pageSize: 10,
      })
      setRows(response.items)
      setMeta(response.meta)
    } catch (err) {
      const message = (err as Error).message
      setError(message)
      toast.showError(message)
    }
  }

  useEffect(() => {
    loadOptions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadData(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, cityFilter, categoryFilter])

  const filterSummary = useMemo(() => {
    const chunks: string[] = []
    if (cityFilter != null) {
      chunks.push(`Kota: ${cityOptions.find((c) => c.id === cityFilter)?.name ?? "—"}`)
    }
    if (categoryFilter != null) {
      chunks.push(`Kategori: ${categoryOptions.find((c) => c.id === categoryFilter)?.name ?? "—"}`)
    }
    if (status !== "all") {
      chunks.push(status === "active" ? "Status: aktif" : "Status: nonaktif")
    }
    return chunks.length ? chunks.join(" · ") : "Tanpa filter lanjutan"
  }, [cityFilter, categoryFilter, status, cityOptions, categoryOptions])

  const submitDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteAdminDestination(deleteTarget.id)
      await loadData(1)
      toast.showSuccess("Destinasi berhasil dihapus.")
      setDeleteTarget(null)
    } catch (err) {
      const message = (err as Error).message
      setError(message)
      toast.showError(message)
    }
  }

  const handleToggleStatus = async (item: AdminDestination) => {
    if (item.is_active && item.is_osm_pdf) {
      toast.showError(`"${item.name}" wajib tetap aktif.`)
      return
    }
    if (!item.is_active && item.is_osm_only) {
      toast.showError(`"${item.name}" wajib tetap inactive.`)
      return
    }
    try {
      setUpdatingId(item.id)
      await updateAdminDestinationStatus(item.id, !item.is_active)
      setRows((previous) =>
        previous.map((row) => (row.id === item.id ? { ...row, is_active: !row.is_active } : row)),
      )
      toast.showSuccess(`Status "${item.name}" diperbarui.`)
    } catch (err) {
      const message = (err as Error).message
      setError(message)
      toast.showError(message)
    } finally {
      setUpdatingId(null)
    }
  }

  const handleSaveDescription = async () => {
    if (!descriptionTarget) return
    try {
      setSavingDescription(true)
      await updateAdminDestinationDescription(descriptionTarget.id, descriptionDraft)
      setRows((previous) =>
        previous.map((row) =>
          row.id === descriptionTarget.id ? { ...row, poi_description: descriptionDraft } : row,
        ),
      )
      toast.showSuccess(`Deskripsi "${descriptionTarget.name}" diperbarui.`)
      setDescriptionTarget(null)
      setDescriptionDraft("")
      setWikipediaSourceUrl("")
    } catch (err) {
      const message = (err as Error).message
      setError(message)
      toast.showError(message)
    } finally {
      setSavingDescription(false)
    }
  }

  const handleFetchWikipediaDescription = async (save = false) => {
    if (!descriptionTarget) return
    try {
      setLoadingWikipedia(true)
      const hasExisting = Boolean((descriptionTarget.poi_description || descriptionDraft).trim())
      const response = await fetchAdminDestinationWikipediaDescription(descriptionTarget.id, {
        save,
        overwrite: save ? hasExisting : false,
      })
      setDescriptionDraft(response.description)
      setWikipediaSourceUrl(response.wikipedia_url)
      if (save) {
        setRows((previous) =>
          previous.map((row) =>
            row.id === descriptionTarget.id ? { ...row, poi_description: response.description } : row,
          ),
        )
        toast.showSuccess(`Deskripsi Wikipedia "${descriptionTarget.name}" disimpan.`)
      } else {
        toast.showSuccess(`Pratinjau Wikipedia dimuat untuk "${descriptionTarget.name}".`)
      }
    } catch (err) {
      const message = (err as Error).message
      setError(message)
      toast.showError(message)
    } finally {
      setLoadingWikipedia(false)
    }
  }

  const handleBackfillWikipedia = async () => {
    try {
      setBackfillingWikipedia(true)
      const response = await backfillAdminWikipediaDescriptions({ limit: 50, overwrite: false })
      await loadData(meta.page)
      toast.showSuccess(
        `Backfill Wikipedia selesai: ${response.updated} diperbarui, ${response.not_found} tidak ditemukan.`,
      )
    } catch (err) {
      const message = (err as Error).message
      setError(message)
      toast.showError(message)
    } finally {
      setBackfillingWikipedia(false)
    }
  }

  const sortedRows = useMemo(() => {
    const clone = [...rows]
    clone.sort((a, b) => {
      const getValue = (item: AdminDestination) => {
        switch (sortBy) {
          case "id":
            return item.id
          case "name":
            return item.name.toLowerCase()
          case "city":
            return item.city_name.toLowerCase()
          case "category":
            return item.category_name.toLowerCase()
          case "status":
            return item.is_active ? 1 : 0
          default:
            return item.id
        }
      }
      const left = getValue(a)
      const right = getValue(b)
      if (left < right) return sortDir === "asc" ? -1 : 1
      if (left > right) return sortDir === "asc" ? 1 : -1
      return 0
    })
    return clone
  }, [rows, sortBy, sortDir])

  const toggleSort = (column: "id" | "name" | "city" | "category" | "status") => {
    if (sortBy === column) {
      setSortDir((previous) => (previous === "asc" ? "desc" : "asc"))
      return
    }
    setSortBy(column)
    setSortDir("asc")
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">Destinasi wisata</h2>
          <p className="text-[11px] text-slate-500">
            Kelola destinasi, filter data, dan kontrol status aktif — selaras tampilan dashboard.
          </p>
        </div>
      </div>

      {error && <div className="admin-alert-error text-xs">{error}</div>}
      <ToastStack items={toast.items} onDismiss={toast.dismiss} />

      <TableCard
        title="Daftar destinasi"
        icon={MapPinned}
        description={`${meta.total.toLocaleString("id-ID")} baris · ${filterSummary}`}
        searchValue={query}
        searchPlaceholder="Cari nama destinasi…"
        onSearchChange={setQuery}
        onSearchSubmit={() => loadData(1)}
        toolbarExtras={
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter destinasi">
            <select
              value={status}
              onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "inactive")}
              className="h-8 min-w-[7.25rem] shrink-0 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-medium text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/20"
              aria-label="Filter status"
            >
              {STATUS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <select
              value={cityFilter ?? ""}
              onChange={(event) => setCityFilter(event.target.value ? Number(event.target.value) : null)}
              className="h-8 min-w-[7rem] shrink-0 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-medium text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/20"
              aria-label="Filter kota"
            >
              <option value="">Semua kota</option>
              {cityOptions.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </select>
            <select
              value={categoryFilter ?? ""}
              onChange={(event) => setCategoryFilter(event.target.value ? Number(event.target.value) : null)}
              className="h-8 min-w-[7.25rem] shrink-0 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-medium text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/20"
              aria-label="Filter kategori"
            >
              <option value="">Semua kategori</option>
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleBackfillWikipedia}
              disabled={backfillingWikipedia}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <BookOpenText className="h-3.5 w-3.5" aria-hidden />
              {backfillingWikipedia ? "Mengambil Wikipedia…" : "Backfill Wikipedia (50)"}
            </button>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="admin-table-head">
                <SortableHeader label="ID" active={sortBy === "id"} direction={sortDir} onToggle={() => toggleSort("id")} />
                <SortableHeader
                  label="Destinasi"
                  active={sortBy === "name"}
                  direction={sortDir}
                  onToggle={() => toggleSort("name")}
                />
                <SortableHeader
                  label="Kategori"
                  active={sortBy === "category"}
                  direction={sortDir}
                  onToggle={() => toggleSort("category")}
                />
                <SortableHeader label="Kota" active={sortBy === "city"} direction={sortDir} onToggle={() => toggleSort("city")} />
                <SortableHeader
                  label="Status"
                  active={sortBy === "status"}
                  direction={sortDir}
                  align="center"
                  onToggle={() => toggleSort("status")}
                />
                <th className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-0 align-middle">
                    <div className="admin-empty-state">
                      <Inbox className="h-10 w-10 shrink-0 text-slate-300" aria-hidden />
                      <p className="text-sm font-medium text-slate-500">Tidak ada data</p>
                    </div>
                  </td>
                </tr>
              )}
              {sortedRows.map((destination) => (
                <tr key={destination.id} className="admin-table-row">
                  <td className="px-4 py-2.5 font-mono text-[11px] font-medium text-slate-400">{destination.id}</td>
                  <td className="px-4 py-2.5 font-semibold text-slate-800">{destination.name}</td>
                  <td className="px-4 py-2.5 text-slate-600">{destination.category_name}</td>
                  <td className="px-4 py-2.5 text-slate-600">{destination.city_name}</td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <IconActionButton
                        label={
                          destination.is_osm_pdf && destination.is_active
                            ? "Status terkunci"
                            : destination.is_osm_only && !destination.is_active
                              ? "Status terkunci"
                              : destination.is_active
                                ? "Set inactive"
                                : "Set active"
                        }
                        icon={destination.is_active ? ToggleRight : ToggleLeft}
                        variant={destination.is_active ? "success" : "default"}
                        disabled={
                          updatingId === destination.id ||
                          (destination.is_osm_pdf && destination.is_active) ||
                          (destination.is_osm_only && !destination.is_active)
                        }
                        onClick={() => handleToggleStatus(destination)}
                      />
                      <span className={destination.is_active ? "admin-badge-success" : "admin-badge-danger"}>
                        {destination.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <IconActionButton
                        label="Lihat deskripsi destinasi"
                        icon={Eye}
                        onClick={() => {
                          setDescriptionTarget(destination)
                          setDescriptionDraft((destination.poi_description || "").trim())
                          setWikipediaSourceUrl("")
                        }}
                      />
                      <IconActionButton
                        label="Edit deskripsi destinasi"
                        icon={SquarePen}
                        onClick={() => {
                          setDescriptionTarget(destination)
                          setDescriptionDraft((destination.poi_description || "").trim())
                          setWikipediaSourceUrl("")
                        }}
                      />
                      <IconActionButton label="Hapus destinasi" icon={Trash2} variant="danger" onClick={() => setDeleteTarget(destination)} />
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
        open={!!descriptionTarget}
        title="Deskripsi destinasi"
        onClose={() => {
          if (savingDescription || loadingWikipedia) return
          setDescriptionTarget(null)
          setDescriptionDraft("")
          setWikipediaSourceUrl("")
        }}
        size="lg"
        footerAlign="center"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setDescriptionTarget(null)
                setDescriptionDraft("")
                setWikipediaSourceUrl("")
              }}
              className="admin-btn-cancel"
              disabled={savingDescription || loadingWikipedia}
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => handleFetchWikipediaDescription(false)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={savingDescription || loadingWikipedia}
            >
              {loadingWikipedia ? "Mengambil…" : "Pratinjau Wikipedia"}
            </button>
            <button
              type="button"
              onClick={() => handleFetchWikipediaDescription(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={savingDescription || loadingWikipedia}
            >
              Simpan dari Wikipedia
            </button>
            <button
              type="button"
              onClick={handleSaveDescription}
              className="rounded-md bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={savingDescription || loadingWikipedia}
            >
              {savingDescription ? "Menyimpan..." : "Simpan deskripsi"}
            </button>
          </>
        }
      >
        {descriptionTarget ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Destinasi</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">{descriptionTarget.name}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Deskripsi</p>
              <textarea
                value={descriptionDraft}
                onChange={(event) => setDescriptionDraft(event.target.value)}
                placeholder="Tulis deskripsi destinasi yang jelas dan informatif..."
                rows={7}
                className="w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed text-slate-700 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-400/20"
              />
              <p className="mt-2 text-[11px] text-slate-500">
                Deskripsi ini dipakai di data destinasi agar informasi ke user lebih jelas.
              </p>
              {wikipediaSourceUrl ? (
                <p className="mt-2 text-[11px] text-slate-500">
                  Sumber Wikipedia:{" "}
                  <a
                    href={wikipediaSourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-slate-700 underline underline-offset-2"
                  >
                    {wikipediaSourceUrl}
                  </a>
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </AdminModal>

      <AdminModal
        open={!!deleteTarget}
        title="Hapus destinasi"
        onClose={() => setDeleteTarget(null)}
        footerAlign="center"
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
        <p className="text-[13px] leading-relaxed text-slate-600">
          Yakin ingin menghapus <span className="font-semibold text-slate-900">{deleteTarget?.name}</span>? Tindakan ini tidak bisa dibatalkan.
        </p>
      </AdminModal>
    </section>
  )
}
