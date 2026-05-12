'use client'

import { useEffect, useState } from "react"
import { Inbox, Users } from "lucide-react"
import TableCard from "@/components/admin/common/TableCard"
import { fetchAdminUsers } from "@/lib/api"
import type { AdminUserItem } from "@/lib/types"

export default function UserManagementPage() {
  const [users, setUsers] = useState<AdminUserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let mounted = true
    fetchAdminUsers()
      .then((response) => {
        if (!mounted) return
        setUsers(response.items)
      })
      .catch((err) => {
        if (!mounted) return
        setError((err as Error).message)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">Pengguna</h2>
        <p className="text-[11px] text-slate-500">Kelola daftar akun pengguna sistem.</p>
      </div>

      <TableCard title="Daftar pengguna" icon={Users} description={`${users.length.toLocaleString("id-ID")} akun`}>
        {error && <div className="admin-alert-error mb-3 text-xs">{error}</div>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="admin-table-head">
                <th className="px-4 py-2.5 text-left text-[11px]">ID</th>
                <th className="px-4 py-2.5 text-left text-[11px]">Nama</th>
                <th className="px-4 py-2.5 text-left text-[11px]">Email</th>
                <th className="px-4 py-2.5 text-left text-[11px]">Role</th>
                <th className="px-4 py-2.5 text-left text-[11px]">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="p-0 align-middle">
                    <div className="admin-empty-state">
                      <Users className="h-10 w-10 shrink-0 animate-pulse text-slate-300" aria-hidden />
                      <p className="text-sm font-medium text-slate-500">Memuat…</p>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && users.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-0 align-middle">
                    <div className="admin-empty-state">
                      <Inbox className="h-10 w-10 shrink-0 text-slate-300" aria-hidden />
                      <p className="text-sm font-medium text-slate-500">Tidak ada data</p>
                    </div>
                  </td>
                </tr>
              )}
              {!loading &&
                users.map((user) => (
                <tr key={user.id} className="admin-table-row">
                  <td className="px-4 py-2.5 font-mono text-[11px] font-medium text-slate-400">{user.id}</td>
                  <td className="px-4 py-2.5 font-semibold text-slate-800">{user.name}</td>
                  <td className="px-4 py-2.5 text-slate-600">{user.email}</td>
                  <td className="px-4 py-2.5">
                    <span className={user.role === "admin" ? "admin-badge-purple" : "admin-badge-info"}>{user.role}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="admin-badge-success">Active</span>
                  </td>
                </tr>
                ))}
            </tbody>
          </table>
        </div>
      </TableCard>
    </section>
  )
}
