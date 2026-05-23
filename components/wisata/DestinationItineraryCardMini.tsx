'use client'

import { Bus, MapPin, UtensilsCrossed, ShoppingBag } from 'lucide-react'
import type { EnrichedPOI } from '@/lib/types'
import { getCategoryIcon } from '@/lib/getCategoryIcon'

export interface DestinationItineraryCardMiniProps {
  poi: EnrichedPOI
  accentColor: string
  selected?: boolean
  assignedDay?: number
  className?: string
}

export default function DestinationItineraryCardMini({
  poi,
  accentColor,
  selected = false,
  assignedDay,
  className = '',
}: DestinationItineraryCardMiniProps) {
  const sub = poi.subcategory ?? ''
  const km = poi.dist_to_hotel_m / 1000

  return (
    <div
      className={`w-[min(220px,70vw)] overflow-hidden rounded-lg border bg-card text-left shadow-lg ${className}`.trim()}
      style={{ borderColor: `${accentColor}55` }}
    >
      <div className="h-1 w-full shrink-0" style={{ backgroundColor: accentColor }} />
      <div className="space-y-1.5 p-2">
        <div className="flex items-start gap-1.5">
          <div
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
            style={{ backgroundColor: accentColor }}
          >
            •
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold leading-tight text-foreground line-clamp-2">{poi.name}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[9px] text-muted-foreground">
              <span>{getCategoryIcon(sub)}</span>
              <span className="truncate">{sub || 'destinasi'}</span>
            </p>
          </div>
          <span
            className="shrink-0 rounded px-1 py-0.5 text-[8px] font-bold tabular-nums"
            style={{ backgroundColor: `${accentColor}2a`, color: accentColor }}
          >
            {(poi.semantic_score * 100).toFixed(0)}%
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1 border-t border-border pt-1.5 text-[8px] text-muted-foreground">
          <span className="inline-flex items-center gap-0.5">
            <MapPin className="h-2 w-2 shrink-0" style={{ color: accentColor }} />
            {km.toFixed(1)} km
          </span>
          <span className="inline-flex items-center gap-0.5">
            <Bus className="h-2 w-2 shrink-0 text-blue-500" />
            {Math.round(poi.dist_to_stop_m)}m
          </span>
          <span className="inline-flex items-center gap-0.5">
            <UtensilsCrossed className="h-2 w-2 shrink-0 text-orange-400" />
            {poi.resto_count}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <ShoppingBag className="h-2 w-2 shrink-0 text-green-600" />
            {poi.minimarket_count}
          </span>
        </div>
        {selected && assignedDay ? (
          <p className="rounded-md bg-primary/10 px-1.5 py-0.5 text-center text-[8px] font-semibold text-primary">
            Hari {assignedDay}
          </p>
        ) : (
          <p className="text-center text-[8px] text-muted-foreground">Klik untuk detail</p>
        )}
      </div>
    </div>
  )
}
