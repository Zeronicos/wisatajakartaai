'use client'

import { ArrowDownUp, ArrowDown, ArrowUp } from "lucide-react"

interface SortableHeaderProps {
  label: string
  active: boolean
  direction: "asc" | "desc"
  align?: "left" | "right" | "center"
  onToggle: () => void
}

export default function SortableHeader({
  label,
  active,
  direction,
  align = "left",
  onToggle,
}: SortableHeaderProps) {
  const thClass =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
  const button = (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center gap-1 rounded px-0.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
        active ? "text-slate-800" : "text-slate-500 hover:text-slate-700"
      }`}
    >
      <span>{label}</span>
      {active ? (
        direction === "asc" ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : (
        <ArrowDownUp className="h-3 w-3 opacity-50" />
      )}
    </button>
  )

  return (
    <th className={`px-4 py-2.5 ${thClass}`}>
      {align === "center" ? <div className="flex justify-center">{button}</div> : align === "right" ? <div className="flex justify-end">{button}</div> : button}
    </th>
  )
}
