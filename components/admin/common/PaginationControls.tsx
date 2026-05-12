import { ChevronLeft, ChevronRight } from "lucide-react"

interface PaginationControlsProps {
  page: number
  totalPages: number
  total?: number
  onPrev: () => void
  onNext: () => void
}

export default function PaginationControls({
  page,
  totalPages,
  total,
  onPrev,
  onNext,
}: PaginationControlsProps) {
  const maxPage = Math.max(totalPages, 1)

  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2">
      <p className="text-[11px] text-slate-500">
        <span className="font-semibold text-slate-700">{page}</span>
        <span className="text-slate-400"> / </span>
        <span className="font-semibold text-slate-700">{maxPage}</span>
        {total != null && (
          <span className="ml-1.5 text-slate-400">· {total.toLocaleString("id-ID")}</span>
        )}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={onPrev}
          disabled={page <= 1}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border-2 border-slate-300 bg-white text-slate-600 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Halaman sebelumnya"
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
        <button
          onClick={onNext}
          disabled={page >= maxPage}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border-2 border-slate-300 bg-white text-slate-600 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Halaman berikutnya"
        >
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
