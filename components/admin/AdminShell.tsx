'use client'

import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  Building2,
  LayoutDashboard,
  MapPinned,
  Shapes,
  Users,
  ShieldCheck,
  LogOut,
  BusFront,
  Store,
  ChevronDown,
} from "lucide-react"
import { clearSession, getClientSession } from "@/lib/auth"

const ADMIN_NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/city-management", label: "Cities", icon: Building2 },
  { href: "/admin/category-management", label: "Categories", icon: Shapes },
  { href: "/admin/destination-management", label: "Destinations", icon: MapPinned },
  { href: "/admin/transjakarta-data", label: "TransJakarta", icon: BusFront },
  { href: "/admin/facilities-data", label: "Facilities", icon: Store },
  { href: "/admin/user-management", label: "Users", icon: Users },
  { href: "/admin/role-management", label: "Roles", icon: ShieldCheck },
]

const TRANSJAKARTA_DATASETS = [
  { label: "Stops", href: "/admin/transjakarta-data?dataset=stops" },
  { label: "Routes", href: "/admin/transjakarta-data?dataset=routes" },
  { label: "Trips", href: "/admin/transjakarta-data?dataset=trips" },
  { label: "Shapes", href: "/admin/transjakarta-data?dataset=shapes" },
  { label: "Stop Times", href: "/admin/transjakarta-data?dataset=stop_times" },
]

const FACILITY_DATASETS = [
  { label: "Restaurants", href: "/admin/facilities-data?facility=restaurants" },
  { label: "Minimarkets", href: "/admin/facilities-data?facility=minimarkets" },
]

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<ReturnType<typeof getClientSession>>(null)
  const [openSubmenus, setOpenSubmenus] = useState<Record<string, boolean>>({
    "/admin/transjakarta-data": true,
    "/admin/facilities-data": true,
  })

  useEffect(() => {
    setCurrentUser(getClientSession())
  }, [])

  const handleLogout = () => {
    clearSession()
    router.push("/")
    router.refresh()
  }

  const toggleSubmenu = (href: string) => {
    setOpenSubmenus((prev) => ({ ...prev, [href]: !prev[href] }))
  }

  const activeQueryKey = `${pathname}?${searchParams.toString()}`

  return (
    <div className="admin-shell">
      <div className="flex w-full">
        <aside className="admin-sidebar hidden min-h-screen w-52 shrink-0 lg:block">
          <div className="sticky top-0 flex h-screen flex-col overflow-y-auto px-3 py-4">
            <div className="mb-4 flex items-center gap-2 px-1">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-[11px] font-bold text-white">
                W
              </div>
              <div className="min-w-0">
                <p className="truncate text-[12px] font-semibold leading-tight text-slate-900">Wisata Jakarta</p>
                <p className="truncate text-[10px] text-slate-400">Admin Console</p>
              </div>
            </div>

            <nav className="flex-1 space-y-0.5">
              {ADMIN_NAV_ITEMS.map((item) => {
                const Icon = item.icon
                const isExactDashboard = item.href === "/admin"
                const active = isExactDashboard
                  ? pathname === "/admin"
                  : pathname === item.href || pathname.startsWith(`${item.href}/`)
                const hasChildren =
                  item.href === "/admin/transjakarta-data" || item.href === "/admin/facilities-data"
                const isOpen = openSubmenus[item.href]

                return (
                  <div key={item.href}>
                    <div className="flex items-center">
                      <Link
                        href={item.href}
                        className={`admin-nav-item flex-1 ${active ? "admin-nav-item-active" : ""}`}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                      {hasChildren && (
                        <button
                          type="button"
                          onClick={() => toggleSubmenu(item.href)}
                          aria-label="Toggle submenu"
                          className="ml-0.5 flex h-6 w-6 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        >
                          <ChevronDown
                            className={`h-3 w-3 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                          />
                        </button>
                      )}
                    </div>

                    {hasChildren && isOpen && (
                      <div className="ml-4 mt-0.5 space-y-0.5 border-l border-slate-200 pl-2">
                        {(item.href === "/admin/transjakarta-data"
                          ? TRANSJAKARTA_DATASETS
                          : FACILITY_DATASETS
                        ).map((sub) => {
                          const subActive = activeQueryKey.startsWith(sub.href)
                          return (
                            <Link
                              key={sub.href}
                              href={sub.href}
                              className={`block rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                                subActive
                                  ? "bg-slate-900 text-white"
                                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                              }`}
                            >
                              {sub.label}
                            </Link>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </nav>

            <div className="mt-3 border-t border-slate-200 pt-2">
              <p className="truncate px-1 text-[10px] text-slate-400">
                {currentUser?.email ?? "admin@wisata.id"}
              </p>
            </div>
          </div>
        </aside>

        <div className="min-h-screen flex-1">
          <header className="admin-topbar px-4 py-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-700">
                {currentUser?.name ?? "Administrator"}
              </p>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
              >
                <LogOut className="h-3 w-3" />
                Logout
              </button>
            </div>
          </header>

          <main className="p-4 lg:p-5">{children}</main>
        </div>
      </div>
    </div>
  )
}
