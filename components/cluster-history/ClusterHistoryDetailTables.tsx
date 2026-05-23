import type { ClusterHistoryItem } from '@/lib/types'

function fmtNum(value: number | undefined | null, digits = 3): string {
  if (value == null || !Number.isFinite(value)) return '-'
  return value.toFixed(digits)
}

function pct(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return '-'
  return `${(value * 100).toFixed(1)}%`
}

function totalRouteKm(item: ClusterHistoryItem): number {
  const routes = item.routes ?? {}
  return Object.values(routes).reduce((sum, route) => sum + (route.total_distance_km ?? 0), 0)
}

type Props = {
  item: ClusterHistoryItem
  compact?: boolean
}

export default function ClusterHistoryDetailTables({ item, compact = false }: Props) {
  const zscoreRows = item.analysis?.zscore_rows ?? []
  const zscoreDetails = item.analysis?.zscore_details ?? {}
  const tableClass = compact
    ? 'w-full text-[11px] border-collapse'
    : 'w-full text-xs border-collapse'
  const thClass = compact
    ? 'border border-border bg-muted/50 px-2 py-1.5 text-left font-semibold text-muted-foreground'
    : 'border border-border bg-muted/50 px-3 py-2 text-left text-xs font-semibold text-muted-foreground'
  const tdClass = compact
    ? 'border border-border px-2 py-1.5 align-top'
    : 'border border-border px-3 py-2 align-top'

  return (
    <div className="space-y-5">
      <section>
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-foreground">Ringkasan input</h4>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className={tableClass}>
            <tbody>
              <tr>
                <th className={thClass}>Preferensi</th>
                <td className={tdClass}>{item.query_text}</td>
                <th className={thClass}>Hotel</th>
                <td className={tdClass}>{item.hotel_name ?? 'Tidak diketahui'}</td>
              </tr>
              <tr>
                <th className={thClass}>Hari</th>
                <td className={tdClass}>{item.num_days}</td>
                <th className={thClass}>Top-K</th>
                <td className={tdClass}>{item.top_k ?? '-'}</td>
              </tr>
              <tr>
                <th className={thClass}>Mode</th>
                <td className={tdClass}>{item.generation_mode ?? '-'}</td>
                <th className={thClass}>Destinasi/hari</th>
                <td className={tdClass}>{item.daily_destination_limit ?? '-'}</td>
              </tr>
              <tr>
                <th className={thClass}>POI terfilter</th>
                <td className={tdClass}>{item.filtered_destinations?.length ?? item.total_pois}</td>
                <th className={thClass}>Total jarak rute</th>
                <td className={tdClass}>{totalRouteKm(item).toFixed(2)} km</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-foreground">Metrik evaluasi cluster</h4>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>K optimal</th>
                <th className={thClass}>Silhouette</th>
                <th className={thClass}>Davies-Bouldin</th>
                <th className={thClass}>WCSS</th>
                <th className={thClass}>Precision</th>
                <th className={thClass}>Recall</th>
                <th className={thClass}>F1</th>
                <th className={thClass}>Iterasi</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={tdClass}>{item.k_optimal}</td>
                <td className={tdClass}>{item.silhouette_score.toFixed(4)}</td>
                <td className={tdClass}>{item.davies_bouldin_index.toFixed(4)}</td>
                <td className={tdClass}>{item.wcss.toFixed(4)}</td>
                <td className={tdClass}>{pct(item.precision_score)}</td>
                <td className={tdClass}>{pct(item.recall_score)}</td>
                <td className={tdClass}>{pct(item.f1_score)}</td>
                <td className={tdClass}>{item.analysis?.metrics?.iterations ?? '-'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-foreground">Analisis grafik (per K)</h4>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>K</th>
                <th className={thClass}>WCSS</th>
                <th className={thClass}>Silhouette</th>
                <th className={thClass}>Davies-Bouldin</th>
                <th className={thClass}>Iterasi</th>
              </tr>
            </thead>
            <tbody>
              {(item.analysis?.k_metrics ?? []).length > 0 ? (
                item.analysis?.k_metrics?.map((row) => (
                  <tr key={`k-${item.id}-${row.k}`}>
                    <td className={tdClass}>{row.k}</td>
                    <td className={tdClass}>{row.wcss.toFixed(4)}</td>
                    <td className={tdClass}>{row.silhouette.toFixed(4)}</td>
                    <td className={tdClass}>{row.dbi.toFixed(4)}</td>
                    <td className={tdClass}>{row.iterations}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className={tdClass} colSpan={5}>
                    Tidak ada data analisis grafik tersimpan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-foreground">Z-Score per cluster (rata-rata)</h4>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Cluster</th>
                <th className={`${thClass} text-right`}>Lat Z</th>
                <th className={`${thClass} text-right`}>Lon Z</th>
                <th className={`${thClass} text-right`}>Semantic Z</th>
                <th className={`${thClass} text-right`}>Hotel Z</th>
                <th className={`${thClass} text-right`}>Halte Z</th>
                <th className={`${thClass} text-right`}>Resto Z</th>
                <th className={`${thClass} text-right`}>Minimarket Z</th>
              </tr>
            </thead>
            <tbody>
              {zscoreRows.length > 0 ? (
                zscoreRows.map((row, idx) => (
                  <tr key={`z-${item.id}-${idx}`}>
                    <td className={tdClass}>{row.cluster}</td>
                    <td className={`${tdClass} text-right font-mono`}>{fmtNum(row.latitude)}</td>
                    <td className={`${tdClass} text-right font-mono`}>{fmtNum(row.longitude)}</td>
                    <td className={`${tdClass} text-right font-mono`}>{fmtNum(row.semantic_score)}</td>
                    <td className={`${tdClass} text-right font-mono`}>{fmtNum(row.dist_to_hotel_m)}</td>
                    <td className={`${tdClass} text-right font-mono`}>{fmtNum(row.dist_to_stop_m)}</td>
                    <td className={`${tdClass} text-right font-mono`}>{fmtNum(row.resto_count)}</td>
                    <td className={`${tdClass} text-right font-mono`}>{fmtNum(row.minimarket_count)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className={tdClass} colSpan={8}>
                    Tidak ada data z-score tersimpan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {Object.keys(zscoreDetails).length > 0 && (
        <section>
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-foreground">Z-Score detail destinasi</h4>
          <div className="space-y-3">
            {Object.entries(zscoreDetails).map(([clusterId, rows]) => (
              <div key={`z-detail-${item.id}-${clusterId}`} className="overflow-x-auto rounded-lg border border-border">
                <p className="border-b border-border bg-muted/30 px-3 py-2 text-[11px] font-semibold text-foreground">
                  Cluster {Number(clusterId) + 1}
                </p>
                <table className={tableClass}>
                  <thead>
                    <tr>
                      <th className={thClass}>Destinasi</th>
                      <th className={thClass}>Kategori</th>
                      <th className={`${thClass} text-right`}>Lat Z</th>
                      <th className={`${thClass} text-right`}>Lon Z</th>
                      <th className={`${thClass} text-right`}>Semantic Z</th>
                      <th className={`${thClass} text-right`}>Hotel Z</th>
                      <th className={`${thClass} text-right`}>Halte Z</th>
                      <th className={`${thClass} text-right`}>Resto Z</th>
                      <th className={`${thClass} text-right`}>Minimarket Z</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((detail) => (
                      <tr key={`z-poi-${item.id}-${detail.poi_id}`}>
                        <td className={tdClass}>{detail.name}</td>
                        <td className={tdClass}>
                          {detail.category}
                          {detail.subcategory ? ` / ${detail.subcategory}` : ''}
                        </td>
                        <td className={`${tdClass} text-right font-mono`}>{fmtNum(detail.latitude)}</td>
                        <td className={`${tdClass} text-right font-mono`}>{fmtNum(detail.longitude)}</td>
                        <td className={`${tdClass} text-right font-mono`}>{fmtNum(detail.semantic_score)}</td>
                        <td className={`${tdClass} text-right font-mono`}>{fmtNum(detail.dist_to_hotel_m)}</td>
                        <td className={`${tdClass} text-right font-mono`}>{fmtNum(detail.dist_to_stop_m)}</td>
                        <td className={`${tdClass} text-right font-mono`}>{fmtNum(detail.resto_count)}</td>
                        <td className={`${tdClass} text-right font-mono`}>{fmtNum(detail.minimarket_count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-foreground">
          Destinasi terfilter ({item.filtered_destinations?.length ?? item.total_pois})
        </h4>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Fitur spasial &amp; semantik sebelum normalisasi (z-score).
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>No</th>
                <th className={thClass}>Nama</th>
                <th className={thClass}>Kategori</th>
                <th className={thClass}>Cluster</th>
                <th className={`${thClass} text-right`}>Latitude</th>
                <th className={`${thClass} text-right`}>Longitude</th>
                <th className={`${thClass} text-right`}>Skor semantik</th>
                <th className={`${thClass} text-right`}>Jarak hotel (m)</th>
                <th className={`${thClass} text-right`}>Jarak halte (m)</th>
                <th className={`${thClass} text-right`}>Resto</th>
                <th className={`${thClass} text-right`}>Minimarket</th>
              </tr>
            </thead>
            <tbody>
              {(item.filtered_destinations ?? []).length > 0 ? (
                item.filtered_destinations?.map((poi, idx) => (
                  <tr key={`filtered-${item.id}-${poi.poi_id}`}>
                    <td className={tdClass}>{idx + 1}</td>
                    <td className={tdClass}>{poi.name}</td>
                    <td className={tdClass}>{poi.category ?? '-'}</td>
                    <td className={tdClass}>{poi.cluster_id ? `Cluster ${Number(poi.cluster_id) + 1}` : '-'}</td>
                    <td className={`${tdClass} text-right font-mono`}>{fmtNum(poi.latitude, 5)}</td>
                    <td className={`${tdClass} text-right font-mono`}>{fmtNum(poi.longitude, 5)}</td>
                    <td className={`${tdClass} text-right font-mono`}>{fmtNum(poi.semantic_score, 4)}</td>
                    <td className={`${tdClass} text-right font-mono`}>{fmtNum(poi.dist_to_hotel_m, 0)}</td>
                    <td className={`${tdClass} text-right font-mono`}>{fmtNum(poi.dist_to_stop_m, 0)}</td>
                    <td className={`${tdClass} text-right font-mono`}>{fmtNum(poi.resto_count, 0)}</td>
                    <td className={`${tdClass} text-right font-mono`}>{fmtNum(poi.minimarket_count, 0)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className={tdClass} colSpan={11}>
                    Tidak ada data destinasi terfilter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-foreground">Pilihan destinasi per hari</h4>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Hari</th>
                <th className={thClass}>Destinasi dipilih</th>
                <th className={`${thClass} text-right`}>Jumlah</th>
                <th className={`${thClass} text-right`}>Jarak rute (km)</th>
              </tr>
            </thead>
            <tbody>
              {(item.selection?.by_day ?? []).length > 0 ? (
                item.selection?.by_day?.map((day) => {
                  const route = item.routes?.[String(day.day - 1)]
                  return (
                    <tr key={`sel-${item.id}-${day.day}`}>
                      <td className={tdClass}>Hari {day.day}</td>
                      <td className={tdClass}>{day.poi_names.join(' • ') || '-'}</td>
                      <td className={`${tdClass} text-right`}>{day.poi_names.length}</td>
                      <td className={`${tdClass} text-right font-mono`}>
                        {route ? route.total_distance_km.toFixed(2) : '-'}
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td className={tdClass} colSpan={4}>
                    Tidak ada pilihan destinasi tersimpan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-foreground">Jarak rute per segmen</h4>
        <div className="space-y-3">
          {Object.keys(item.routes ?? {}).length > 0 ? (
            Object.entries(item.routes ?? {})
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([dayKey, route]) => (
                <div key={`route-${item.id}-${dayKey}`} className="overflow-x-auto rounded-lg border border-border">
                  <p className="border-b border-border bg-muted/30 px-3 py-2 text-[11px] font-semibold text-foreground">
                    Hari {Number(dayKey) + 1} · total {route.total_distance_km.toFixed(2)} km
                  </p>
                  <table className={tableClass}>
                    <thead>
                      <tr>
                        <th className={thClass}>Urutan</th>
                        <th className={thClass}>Destinasi</th>
                        <th className={`${thClass} text-right`}>Jarak dari sebelumnya (km)</th>
                        <th className={`${thClass} text-right`}>Jarak dari sebelumnya (m)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {route.ordered_route.map((stop) => (
                        <tr key={`stop-${item.id}-${dayKey}-${stop.poi_id}-${stop.order}`}>
                          <td className={tdClass}>{stop.order}</td>
                          <td className={tdClass}>{stop.name}</td>
                          <td className={`${tdClass} text-right font-mono`}>{stop.distance_from_prev_km.toFixed(2)}</td>
                          <td className={`${tdClass} text-right font-mono`}>{stop.distance_from_prev_m}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
          ) : (
            <div className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
              Tidak ada data jarak rute tersimpan.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
