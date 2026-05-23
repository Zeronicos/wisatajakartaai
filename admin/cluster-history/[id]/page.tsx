'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { fetchAdminClusterHistoryItem } from '@/lib/api'
import type { ClusterHistoryItem } from '@/lib/types'
import ClusterHistoryDetailTables from '@/components/cluster-history/ClusterHistoryDetailTables'

export default function AdminClusterHistoryDetailPage() {
  const params = useParams()
  const historyId = Number(params.id)
  const [item, setItem] = useState<ClusterHistoryItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!Number.isFinite(historyId) || historyId < 1) {
      setError('ID riwayat tidak valid.')
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')

    void fetchAdminClusterHistoryItem(historyId)
      .then((res) => {
        if (cancelled) return
        setItem(res.item)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Gagal memuat detail riwayat.')
        setItem(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [historyId])

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Kembali ke dashboard
          </Link>
          <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-900">
            Detail Riwayat Cluster #{Number.isFinite(historyId) ? historyId : '-'}
          </h2>
          {item ? (
            <p className="mt-1 text-[11px] text-slate-500">
              {item.user_name} · {item.user_email} · {new Date(item.created_at).toLocaleString('id-ID')}
            </p>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="admin-panel flex items-center gap-2 p-6 text-sm text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
          Memuat detail riwayat…
        </div>
      ) : error ? (
        <div className="admin-alert-error text-xs">{error}</div>
      ) : item ? (
        <div className="admin-panel p-4">
          <ClusterHistoryDetailTables item={item} compact />
        </div>
      ) : null}
    </section>
  )
}
