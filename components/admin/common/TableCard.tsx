import { Plus, Search } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

interface TableCardProps {
  title: string
  icon: LucideIcon
  description?: string
  actions?: ReactNode
  searchValue?: string
  searchPlaceholder?: string
  onSearchChange?: (value: string) => void
  onSearchSubmit?: () => void
  toolbarExtras?: ReactNode
  onCreate?: () => void
  createLabel?: string
  children: ReactNode
}

export default function TableCard({
  title,
  icon: Icon,
  description,
  actions,
  searchValue,
  searchPlaceholder = "Cari…",
  onSearchChange,
  onSearchSubmit,
  toolbarExtras,
  onCreate,
  createLabel = "Tambah",
  children,
}: TableCardProps) {
  return (
    <section className="admin-panel overflow-hidden">
      <div className="grid grid-cols-1 items-center gap-y-2 border-b border-slate-200 bg-slate-50/60 px-3 py-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-3 sm:gap-y-0">
        <div className="flex min-w-0 items-center gap-2 justify-self-start">
          <Icon className="h-4 w-4 shrink-0 text-slate-500" />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-slate-900">{title}</h3>
            {description && <p className="truncate text-[10px] text-slate-500">{description}</p>}
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center justify-center gap-x-2 gap-y-2 justify-self-center sm:min-w-0">
          {toolbarExtras}
        </div>

        <div className="flex w-full flex-wrap items-center justify-end gap-x-2 gap-y-2 justify-self-end">
          {onSearchChange && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={searchValue ?? ""}
                onChange={(event) => onSearchChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onSearchSubmit?.()
                }}
                placeholder={searchPlaceholder}
                className="h-8 w-44 rounded-md border border-slate-300 bg-white pl-7 pr-2 text-[11px] text-slate-700 shadow-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/20"
              />
            </div>
          )}
          {actions}
          {onCreate && (
            <button
              type="button"
              onClick={onCreate}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-emerald-700 bg-emerald-600 px-2.5 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              {createLabel}
            </button>
          )}
        </div>
      </div>

      {children}
    </section>
  )
}
