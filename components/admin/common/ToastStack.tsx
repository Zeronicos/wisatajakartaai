'use client'

import { CheckCircle2, CircleAlert, X } from "lucide-react"

export interface ToastItem {
  id: string
  type: "success" | "error"
  message: string
}

interface ToastStackProps {
  items: ToastItem[]
  onDismiss: (id: string) => void
}

export default function ToastStack({ items, onDismiss }: ToastStackProps) {
  if (items.length === 0) return null

  return (
    <div className="fixed right-4 top-4 z-[110] flex w-[320px] flex-col gap-2">
      {items.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-start gap-2 rounded-xl border px-3 py-2 shadow-lg ${
            toast.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <p className="flex-1 text-xs leading-relaxed">{toast.message}</p>
          <button
            onClick={() => onDismiss(toast.id)}
            className="inline-flex h-5 w-5 items-center justify-center rounded text-current/70 hover:bg-black/5 hover:text-current"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
