'use client'

import type { ReactNode } from 'react'
import { Bus, ChevronRight, Footprints, GitBranch, MapPin } from 'lucide-react'
import type { TransitItineraryLeg, TransitLegMode } from '@/lib/types'

const MODE_META: Record<
  TransitLegMode,
  { label: string; className: string }
> = {
  direct: { label: 'Langsung', className: 'bg-emerald-500/15 text-emerald-700 ring-emerald-500/25' },
  transfer_hint: { label: 'Transfer', className: 'bg-amber-500/15 text-amber-800 ring-amber-500/25' },
  walk_only: { label: 'Halte sama', className: 'bg-slate-500/10 text-slate-600 ring-slate-500/20' },
  unavailable: { label: 'N/A', className: 'bg-rose-500/10 text-rose-700 ring-rose-500/20' },
}

const LEG_ACCENT = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4']

function formatWalk(m: number | null | undefined): string {
  if (m == null || m <= 0) return 'dekat'
  return `~${m} m`
}

function BusPills({ routes }: { routes: string[] }) {
  if (!routes.length) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex flex-wrap gap-0.5">
      {routes.slice(0, 6).map((route) => (
        <span
          key={route}
          className="inline-flex min-w-[1.25rem] items-center justify-center rounded px-1 py-px text-[9px] font-bold leading-none text-blue-800 ring-1 ring-blue-200/80 bg-blue-50"
        >
          {route}
        </span>
      ))}
      {routes.length > 6 ? (
        <span className="text-[9px] font-medium text-muted-foreground">+{routes.length - 6}</span>
      ) : null}
    </span>
  )
}

interface StepLineProps {
  icon: 'origin' | 'walk' | 'bus' | 'transfer' | 'dest'
  children: ReactNode
}

function StepLine({ icon, children }: StepLineProps) {
  const iconNode = (() => {
    const cls = 'h-3 w-3 shrink-0'
    switch (icon) {
      case 'origin':
      case 'dest':
        return <MapPin className={cls} aria-hidden />
      case 'walk':
        return <Footprints className={cls} aria-hidden />
      case 'bus':
        return <Bus className={cls} aria-hidden />
      case 'transfer':
        return <GitBranch className={cls} aria-hidden />
    }
  })()

  const tone =
    icon === 'bus'
      ? 'text-blue-700 bg-blue-50 ring-blue-100'
      : icon === 'transfer'
        ? 'text-violet-700 bg-violet-50 ring-violet-100'
        : icon === 'walk'
          ? 'text-slate-600 bg-slate-50 ring-slate-100'
          : 'text-primary bg-primary/8 ring-primary/15'

  return (
    <li className="flex items-start gap-2 text-[11px] leading-snug text-foreground/90">
      <span className={`mt-px inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1 ${tone}`}>
        {iconNode}
      </span>
      <span className="min-w-0 flex-1 pt-0.5">{children}</span>
    </li>
  )
}

export default function TransitLegScreenCard({
  leg,
  index,
}: {
  leg: TransitItineraryLeg
  index: number
}) {
  const accent = LEG_ACCENT[index % LEG_ACCENT.length]
  const mode = MODE_META[leg.mode]

  return (
    <article
      className="group relative overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm transition-shadow hover:shadow-md"
      style={{ borderLeftWidth: 3, borderLeftColor: accent }}
    >
      <div className="flex items-start gap-2 px-2.5 py-2">
        <span
          className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm"
          style={{ backgroundColor: accent }}
        >
          {index + 1}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1 text-[11px] font-semibold text-foreground">
              <span className="truncate max-w-[38%]">{leg.from_label}</span>
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/70" aria-hidden />
              <span className="truncate max-w-[38%]">{leg.to_label}</span>
            </p>
            <span
              className={`shrink-0 rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-wide ring-1 ${mode.className}`}
            >
              {mode.label}
            </span>
          </div>

          {leg.mode === 'unavailable' ? (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Data halte belum tersedia untuk segmen ini.
            </p>
          ) : (
            <ol className="mt-1.5 space-y-1">
              {leg.from_stop_name ? (
                <StepLine icon="walk">
                  Jalan kaki {formatWalk(leg.from_stop_distance_m)} ke{' '}
                  <strong className="font-semibold">{leg.from_stop_name}</strong>
                </StepLine>
              ) : null}

              {leg.mode === 'walk_only' ? (
                <StepLine icon="walk">
                  Jalan dalam area halte · Bus: <BusPills routes={leg.direct_bus_routes} />
                </StepLine>
              ) : null}

              {leg.mode === 'direct' ? (
                <StepLine icon="bus">
                  TransJakarta <BusPills routes={leg.direct_bus_routes} /> →{' '}
                  <strong className="font-semibold">{leg.to_stop_name}</strong>
                </StepLine>
              ) : null}

              {leg.mode === 'transfer_hint' ? (
                <>
                  <StepLine icon="bus">
                    Naik <BusPills routes={leg.origin_bus_routes} /> dari {leg.from_stop_name}
                  </StepLine>
                  <StepLine icon="transfer">
                    Transfer di <strong className="font-semibold">{leg.transfer_stop_name || 'halte transit'}</strong>
                    {leg.destination_bus_routes.length > 0 ? (
                      <>
                        {' '}
                        · lanjut <BusPills routes={leg.destination_bus_routes} />
                      </>
                    ) : null}
                  </StepLine>
                  <StepLine icon="bus">
                    Sampai <strong className="font-semibold">{leg.to_stop_name}</strong>
                  </StepLine>
                </>
              ) : null}

              <StepLine icon="dest">
                Jalan kaki {formatWalk(leg.to_stop_distance_m)} ke{' '}
                <strong className="font-semibold">{leg.to_label}</strong>
              </StepLine>
            </ol>
          )}
        </div>
      </div>
    </article>
  )
}
