'use client'

import type { ReactNode } from "react"
import { X } from "lucide-react"

interface AdminModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** Footer actions: kanan (default) atau tengah */
  footerAlign?: "end" | "center"
  /** Lebar dialog: md < lg < xl < 2xl (sangat lebar, detail dashboard) */
  size?: "md" | "lg" | "xl" | "2xl"
}

export default function AdminModal({
  open,
  title,
  onClose,
  children,
  footer,
  footerAlign = "end",
  size = "md",
}: AdminModalProps) {
  if (!open) return null

  const maxWidthClass =
    size === "2xl"
      ? "max-w-[min(96vw,90rem)]"
      : size === "xl"
        ? "max-w-6xl"
        : size === "lg"
          ? "max-w-2xl"
          : "max-w-lg"

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 px-4 py-6 backdrop-blur-[2px]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className={`w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ${maxWidthClass}`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <button
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Tutup modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="w-full min-w-0 px-5 py-5">{children}</div>
        {footer && (
          <div
            className={`flex items-center gap-2.5 border-t border-slate-100 bg-slate-50/50 px-5 py-3.5 ${
              footerAlign === "center" ? "justify-center" : "justify-end"
            }`}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
