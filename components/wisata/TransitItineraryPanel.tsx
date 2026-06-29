'use client'

import { Bus, Loader2, Route } from 'lucide-react'
import type { DayRoute, TransitItineraryDay } from '@/lib/types'
import TransitLegScreenCard from '@/components/wisata/TransitLegScreenCard'

interface TransitItineraryPanelProps {
  routeData: Record<string, DayRoute>
  activeDay: string
  activeDayNo: number
  activeTransitDay: TransitItineraryDay | undefined
  onDayChange: (dayId: string) => void
}

export default function TransitItineraryPanel({
  routeData,
  activeDay,
  activeDayNo,
  activeTransitDay,
  onDayChange,
}: TransitItineraryPanelProps) {
  const legCount = activeTransitDay?.legs?.length ?? 0
  const directCount =
    activeTransitDay?.legs.filter((leg) => leg.mode === 'direct').length ?? 0

  return (
    <div className="transit-panel surface-card overflow-hidden">
      <div className="transit-panel-head border-b border-primary/15 bg-gradient-to-r from-primary/[0.07] via-primary/[0.03] to-transparent px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Bus className="h-3.5 w-3.5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-foreground">Transportasi Umum</p>
              <p className="text-[10px] text-muted-foreground">TransJakarta + jalan kaki ke halte</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-semibold text-foreground ring-1 ring-border/60">
              <Route className="h-3 w-3 text-primary" aria-hidden />
              {legCount} segmen
            </span>
            {directCount > 0 ? (
              <span className="hidden sm:inline-flex rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-500/20">
                {directCount} langsung
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          {Object.keys(routeData).map((dayId) => {
            const isActive = activeDay === dayId
            return (
              <button
                key={`transit-day-${dayId}`}
                type="button"
                onClick={() => onDayChange(dayId)}
                className={`rounded-md px-2 py-0.5 text-[10px] font-bold transition-all ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-background/70 text-muted-foreground ring-1 ring-border/50 hover:bg-muted/60 hover:text-foreground'
                }`}
              >
                H{parseInt(dayId, 10) + 1}
              </button>
            )
          })}
        </div>
      </div>

      <div className="transit-panel-body px-2.5 py-2.5">
        {!activeTransitDay?.legs?.length ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-[11px] text-muted-foreground">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
            Memuat saran transit Hari {activeDayNo}…
          </div>
        ) : (
          <div className="space-y-2">
            {activeTransitDay.legs.map((leg, legIdx) => (
              <TransitLegScreenCard key={`transit-leg-${activeDay}-${legIdx}`} leg={leg} index={legIdx} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
