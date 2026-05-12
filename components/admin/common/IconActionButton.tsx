'use client'

import type { LucideIcon } from "lucide-react"

interface IconActionButtonProps {
  label: string
  icon: LucideIcon
  onClick: () => void
  disabled?: boolean
  variant?: "default" | "danger" | "success"
}

const VARIANT_CLASS: Record<NonNullable<IconActionButtonProps["variant"]>, string> = {
  default: "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
  danger: "text-rose-500 hover:bg-rose-50 hover:text-rose-700",
  success: "text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700",
}

export default function IconActionButton({
  label,
  icon: Icon,
  onClick,
  disabled = false,
  variant = "default",
}: IconActionButtonProps) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${VARIANT_CLASS[variant]}`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  )
}
