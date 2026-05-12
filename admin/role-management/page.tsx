import { Check } from "lucide-react"

const ROLE_PERMISSIONS = [
  {
    role: "admin",
    description: "Akses penuh untuk mengelola user, role, dan konfigurasi panel.",
    permissions: [
      "Akses dashboard admin",
      "Kelola user management",
      "Kelola role management",
      "Lihat seluruh data sistem",
    ],
  },
  {
    role: "user",
    description: "Akses terbatas untuk halaman pengguna dan fitur personal.",
    permissions: [
      "Akses dashboard user",
      "Lihat data personal",
      "Tidak bisa mengelola user/role",
    ],
  },
]

export default function RoleManagementPage() {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">Role &amp; izin</h2>
        <p className="text-[11px] text-slate-500">Definisi hak akses berdasarkan role pengguna.</p>
      </div>

      <div className="grid gap-2.5 lg:grid-cols-2">
        {ROLE_PERMISSIONS.map((item) => (
          <article key={item.role} className="admin-panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-3 py-2">
              <h3 className="text-sm font-semibold tracking-tight text-slate-900">{item.role.toUpperCase()}</h3>
              <span className={item.role === "admin" ? "admin-badge-purple" : "admin-badge-info"}>role</span>
            </div>
            <div className="px-3 py-3">
              <p className="mb-3 text-[12px] leading-relaxed text-slate-500">{item.description}</p>
              <ul className="space-y-1.5">
                {item.permissions.map((permission) => (
                  <li
                    key={permission}
                    className="flex items-start gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-[12px] text-slate-700 shadow-sm"
                  >
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    {permission}
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
