'use client'

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { KAnalysis } from "@/lib/types"

interface ElbowChartProps {
  kAnalysis: KAnalysis
  optimalK: number
}

export default function ElbowChart({ kAnalysis, optimalK }: ElbowChartProps) {
  const data = kAnalysis.k_range.map((k, idx) => ({
    k,
    wcss: kAnalysis.wcss_values[idx],
    silhouette: kAnalysis.silhouette_values[idx],
    optimal: k === optimalK,
  }))

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <p className="mb-2 text-xs font-semibold text-foreground">Elbow (WCSS)</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="k" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="wcss" stroke="#ef4444" strokeWidth={2.5} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <p className="mb-2 text-xs font-semibold text-foreground">Silhouette</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="k" />
            <YAxis domain={[0, 1]} />
            <Tooltip />
            <Line type="monotone" dataKey="silhouette" stroke="#2563eb" strokeWidth={2.5} />
          </LineChart>
        </ResponsiveContainer>
        <p className="mt-2 text-xs text-muted-foreground">
          K optimal terpilih: <span className="font-bold text-primary">{optimalK}</span>
        </p>
      </div>
    </div>
  )
}
