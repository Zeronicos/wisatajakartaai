'use client'

import type { ClusterEvaluation } from "@/lib/types"

interface MetricsCardProps {
  evaluation: ClusterEvaluation
}

const cards = [
  { key: "silhouette_score", label: "Silhouette Score", hint: "mendekati 1 lebih baik", color: "text-green-600" },
  {
    key: "davies_bouldin_index",
    label: "Davies-Bouldin Index",
    hint: "mendekati 0 lebih baik",
    color: "text-blue-600",
  },
  { key: "k_optimal", label: "Cluster Optimal (K)", hint: "jumlah cluster terpilih", color: "text-purple-600" },
  { key: "iterations", label: "Iterasi", hint: "hingga konvergen", color: "text-orange-600" },
] as const

export default function MetricsCard({ evaluation }: MetricsCardProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => {
        const rawValue = evaluation[card.key]
        const value = typeof rawValue === "number" && card.key !== "iterations" && card.key !== "k_optimal"
          ? rawValue.toFixed(4)
          : String(rawValue)
        return (
          <div key={card.key} className="rounded-2xl border border-border bg-card p-4 text-center shadow-sm">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className={`mt-1 text-xl font-bold ${card.color}`}>{value}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{card.hint}</p>
          </div>
        )
      })}
    </div>
  )
}
