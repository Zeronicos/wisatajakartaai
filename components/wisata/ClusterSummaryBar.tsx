'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { ClusterResponse } from "@/lib/types"

interface ClusterSummaryBarProps {
  clusters: ClusterResponse["clusters"]
}

export default function ClusterSummaryBar({ clusters }: ClusterSummaryBarProps) {
  const data = Object.entries(clusters).map(([cid, cluster]) => ({
    cluster: `C${parseInt(cid, 10) + 1}`,
    semantic: cluster.summary.avg_semantic_score,
    stop_m: cluster.summary.avg_dist_to_stop_m,
    resto: cluster.summary.avg_resto_count,
    member: cluster.summary.member_count,
    cid,
  }))

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <p className="mb-2 text-xs font-semibold text-foreground">Avg Semantic Score</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="cluster" />
            <YAxis domain={[0, 1]} />
            <Tooltip />
            <Bar dataKey="semantic" fill="#16a34a" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <p className="mb-2 text-xs font-semibold text-foreground">Avg Distance to Stop (m)</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="cluster" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="stop_m" fill="#2563eb" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <p className="mb-2 text-xs font-semibold text-foreground">Avg Restaurant Count</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="cluster" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="resto" fill="#f59e0b" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
