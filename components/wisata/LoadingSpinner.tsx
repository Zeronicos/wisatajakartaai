'use client'

interface LoadingSpinnerProps {
  message?: string
  subMessage?: string
}

export default function LoadingSpinner({ message, subMessage }: LoadingSpinnerProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-xl">
        <div className="mx-auto mb-4 h-14 w-14 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
        <p className="text-sm font-semibold text-foreground">{message ?? "Memproses data..."}</p>
        {subMessage && <p className="mt-1 text-xs text-muted-foreground">{subMessage}</p>}
      </div>
    </div>
  )
}
