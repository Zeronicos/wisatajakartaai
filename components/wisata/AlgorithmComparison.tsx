'use client'

import type { ClusterEvaluation } from '@/lib/types'

interface AlgorithmComparisonProps {
  intelligent: ClusterEvaluation
  baseline: ClusterEvaluation
}

interface MetricItem {
  key: keyof ClusterEvaluation
  label: string
  higherIsBetter: boolean
  color: string
}

const METRICS: MetricItem[] = [
  { key: 'silhouette_score', label: 'Silhouette Score', higherIsBetter: true, color: '#16A34A' },
  { key: 'davies_bouldin_index', label: 'Davies-Bouldin Index', higherIsBetter: false, color: '#2563EB' },
  { key: 'wcss', label: 'WCSS', higherIsBetter: false, color: '#DC2626' },
  { key: 'iterations', label: 'Iterasi', higherIsBetter: false, color: '#D97706' },
]

function formatMetric(key: keyof ClusterEvaluation, value: number): string {
  if (key === 'iterations' || key === 'k_optimal') return String(Math.round(value))
  return value.toFixed(4)
}

export default function AlgorithmComparison({ intelligent, baseline }: AlgorithmComparisonProps) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-foreground">Perbandingan Intelligent K-Means vs K-Means Biasa</h3>
          <p className="text-xs text-muted-foreground">
            Bar menunjukkan perbandingan relatif pada setiap metrik (per metrik, bukan antar metrik).
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {METRICS.map((metric) => {
          const iVal = Number(intelligent[metric.key])
          const bVal = Number(baseline[metric.key])
          const maxVal = Math.max(iVal, bVal, 1e-9)
          const iWidth = (iVal / maxVal) * 100
          const bWidth = (bVal / maxVal) * 100
          const better =
            metric.higherIsBetter
              ? iVal > bVal
                ? 'intelligent'
                : iVal < bVal
                ? 'baseline'
                : 'equal'
              : iVal < bVal
              ? 'intelligent'
              : iVal > bVal
              ? 'baseline'
              : 'equal'

          return (
            <div key={metric.key} className="rounded-xl border border-border/70 bg-muted/20 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">{metric.label}</p>
                <p className="text-[11px] text-muted-foreground">
                  {metric.higherIsBetter ? 'lebih tinggi lebih baik' : 'lebih rendah lebih baik'}
                </p>
              </div>

              <div className="space-y-2">
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="font-medium text-foreground">Intelligent K-Means</span>
                    <span className="font-mono text-foreground">{formatMetric(metric.key, iVal)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{ width: `${iWidth}%`, backgroundColor: metric.color }}
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="font-medium text-foreground">K-Means Biasa</span>
                    <span className="font-mono text-foreground">{formatMetric(metric.key, bVal)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{ width: `${bWidth}%`, backgroundColor: '#6B7280' }}
                    />
                  </div>
                </div>
              </div>

              <p
                className={`mt-2 text-[11px] font-semibold ${
                  better === 'intelligent'
                    ? 'text-green-600'
                    : better === 'baseline'
                    ? 'text-amber-600'
                    : 'text-muted-foreground'
                }`}
              >
                {better === 'intelligent'
                  ? 'Intelligent K-Means lebih baik pada metrik ini'
                  : better === 'baseline'
                  ? 'K-Means biasa lebih baik pada metrik ini'
                  : 'Keduanya setara pada metrik ini'}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
