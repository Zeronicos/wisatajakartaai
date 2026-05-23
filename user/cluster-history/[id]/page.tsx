'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import Navbar from '@/components/wisata/Navbar'
import ClusterHistoryDetailTables from '@/components/cluster-history/ClusterHistoryDetailTables'
import { fetchUserClusterHistoryItem } from '@/lib/api'
import { getClientSession } from '@/lib/auth'
import type { ClusterHistoryItem } from '@/lib/types'

export default function UserClusterHistoryDetailPage() {
  const params = useParams()
  const historyId = Number(params.id)
  const session = useMemo(() => getClientSession(), [])
  const email = session?.email ?? ''
  const [item, setItem] = useState<ClusterHistoryItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!email) {
      setLoading(false)
      return
    }
    if (!Number.isFinite(historyId) || historyId < 1) {
      setError('ID riwayat tidak valid.')
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')

    void fetchUserClusterHistoryItem({ historyId, userEmail: email })
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
  }, [email, historyId])

  if (!email) {
    return (
      <>
        <Navbar />
        <main className="min-h-screen bg-background px-4 py-10">
          <div className="mx-auto max-w-3xl surface-card p-5 text-sm text-muted-foreground">
            Silakan login sebagai user untuk melihat riwayat cluster.
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pb-10">
        <section className="page-hero">
          <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
            <Link
              href="/user/cluster-history"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-foreground/80 hover:text-primary-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Kembali ke riwayat cluster
            </Link>
            <h1 className="mt-3 text-2xl font-bold text-primary-foreground sm:text-3xl">
              Detail Riwayat Cluster #{Number.isFinite(historyId) ? historyId : '-'}
            </h1>
            {item ? (
              <p className="mt-2 text-sm text-primary-foreground/80">
                {item.query_text} · {new Date(item.created_at).toLocaleString('id-ID')}
              </p>
            ) : null}
          </div>
        </section>

        <section className="landing-section pt-0">
          {loading ? (
            <div className="surface-card flex items-center gap-2 p-5 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
              Memuat detail riwayat…
            </div>
          ) : error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
          ) : item ? (
            <article className="surface-card p-4 sm:p-5">
              <ClusterHistoryDetailTables item={item} />
            </article>
          ) : null}
        </section>
      </main>
    </>
  )
}
