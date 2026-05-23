'use client'

import { ArrowRight, Bus, MapPin, UtensilsCrossed, ShoppingBag } from 'lucide-react'
import type { EnrichedPOI } from '@/lib/types'
import { getCategoryIcon } from '@/lib/getCategoryIcon'

export type DestinationDistanceMode = 'route_leg' | 'from_hotel'

export interface DestinationItineraryCardProps {
  poi: EnrichedPOI
  /** Warna aksen (strip atas, badge urutan). */
  accentColor: string
  /** Nomor urutan tampilan (rute / urutan di cluster). */
  orderBadge: number
  /** Jarak dalam km (leg rute atau perkiraan dari hotel). */
  primaryDistanceKm: number
  distanceMode: DestinationDistanceMode
  className?: string
}

export default function DestinationItineraryCard({
  poi,
  accentColor,
  orderBadge,
  primaryDistanceKm,
  distanceMode,
  className = '',
}: DestinationItineraryCardProps) {
  const sub = poi.subcategory ?? ''
  const DistIcon = distanceMode === 'route_leg' ? ArrowRight : MapPin
  const distanceLabel =
    distanceMode === 'route_leg' ? '' : ' dari hotel'

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm ${className}`.trim()}
      style={{ borderColor: accentColor + '30' }}
    >
      <div className="h-1.5 w-full shrink-0" style={{ backgroundColor: accentColor }} />

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start gap-2">
          <div
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: accentColor }}
          >
            {orderBadge}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-left text-xs font-bold leading-tight text-foreground">{poi.name}</p>
              <span
                className="whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-bold tabular-nums"
                style={{
                  backgroundColor: `${accentColor}2a`,
                  color: accentColor,
                }}
                title={`Skor preferensi ${(poi.semantic_score * 100).toFixed(1)}%`}
              >
                {(poi.semantic_score * 100).toFixed(1)}%
              </span>
            </div>
            <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
              <span>{getCategoryIcon(sub)}</span>
              <span>{sub || 'destinasi'}</span>
            </p>
          </div>
        </div>

        {poi.description ? (
          <p className="line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{poi.description}</p>
        ) : null}

        <div className="mt-auto border-t border-border pt-2">
          <div className="grid grid-cols-2 gap-1.5">
            <div className="flex items-center gap-1">
              <DistIcon className="h-2.5 w-2.5 shrink-0" style={{ color: accentColor }} />
              <span className="text-[10px] text-muted-foreground">
                {primaryDistanceKm.toFixed(2)} km{distanceLabel}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Bus className="h-2.5 w-2.5 shrink-0 text-blue-500" />
              <span className="text-[10px] text-muted-foreground">
                {Math.round(poi.dist_to_stop_m)}m ke halte
              </span>
            </div>
            <div className="flex items-center gap-1">
              <UtensilsCrossed className="h-2.5 w-2.5 shrink-0 text-orange-400" />
              <span className="text-[10px] text-muted-foreground">{poi.resto_count} restoran</span>
            </div>
            <div className="flex items-center gap-1">
              <ShoppingBag className="h-2.5 w-2.5 shrink-0 text-green-500" />
              <span className="text-[10px] text-muted-foreground">{poi.minimarket_count} minimarket</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
