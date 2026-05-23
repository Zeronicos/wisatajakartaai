'use client'

import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import type { ClusterResponse } from '@/lib/types'
import { showAppFlowBlockedAlert } from '@/lib/sweetAlert'

function parseClusterData(raw: string | null): ClusterResponse | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ClusterResponse
    if (!parsed?.clusters || typeof parsed.clusters !== 'object' || !parsed.evaluation) return null
    return parsed
  } catch {
    return null
  }
}

function parseRouteData(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    if (Object.keys(parsed as Record<string, unknown>).length === 0) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

export function isStep1Complete(): boolean {
  if (typeof window === 'undefined') return false
  const cluster = parseClusterData(sessionStorage.getItem('clusterData'))
  const hotel = sessionStorage.getItem('hotelLocation')
  return Boolean(cluster && hotel)
}

export function isStep2Complete(): boolean {
  if (typeof window === 'undefined') return false
  return parseRouteData(sessionStorage.getItem('routeData')) !== null
}

export function canAccessStep(step: 1 | 2 | 3): boolean {
  if (step === 1) return true
  if (step === 2) return isStep1Complete()
  return isStep1Complete() && isStep2Complete()
}

/** Tampilkan SweetAlert dan arahkan ke langkah yang harus diselesaikan. */
export async function guardAppFlowStep(
  targetStep: 2 | 3,
  router: AppRouterInstance,
): Promise<boolean> {
  if (targetStep === 2) {
    if (isStep1Complete()) return true
    await showAppFlowBlockedAlert(1)
    router.push('/planner')
    return false
  }

  if (!isStep1Complete()) {
    await showAppFlowBlockedAlert(1)
    router.push('/planner')
    return false
  }

  if (!isStep2Complete()) {
    await showAppFlowBlockedAlert(2)
    router.push('/cluster')
    return false
  }

  return true
}

/** Guard saat halaman dimuat langsung (URL). */
export async function enforcePageAccess(
  pageStep: 2 | 3,
  router: AppRouterInstance,
): Promise<boolean> {
  if (pageStep === 2) {
    if (isStep1Complete()) return true
    await showAppFlowBlockedAlert(1)
    router.replace('/planner')
    return false
  }

  if (!isStep1Complete()) {
    await showAppFlowBlockedAlert(1)
    router.replace('/planner')
    return false
  }

  if (!isStep2Complete()) {
    await showAppFlowBlockedAlert(2)
    router.replace('/cluster')
    return false
  }

  return true
}

export function readStep1Session(): {
  clusterData: ClusterResponse
  hotelRaw: string
  numDaysRaw: string | null
} | null {
  if (typeof window === 'undefined') return null
  const clusterData = parseClusterData(sessionStorage.getItem('clusterData'))
  const hotelRaw = sessionStorage.getItem('hotelLocation')
  if (!clusterData || !hotelRaw) return null
  return {
    clusterData,
    hotelRaw,
    numDaysRaw: sessionStorage.getItem('numDays'),
  }
}

export function readStep2RouteRaw(): string | null {
  if (typeof window === 'undefined') return null
  const raw = sessionStorage.getItem('routeData')
  return parseRouteData(raw) ? raw : null
}
