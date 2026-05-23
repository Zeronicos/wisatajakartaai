'use client'

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import {
  LayoutDashboard,
  LogIn,
  Menu,
  MapPinned,
  Home,
  Info,
  BarChart2,
  LogOut,
  Map,
  SquarePen,
  UserRound,
  X,
} from "lucide-react"
import type { SessionUser } from "@/lib/types"
import { getClientSession, clearSession } from "@/lib/auth"

const NAV_ITEMS = [
  { href: "/", label: "Beranda", icon: Home },
  { href: "/eda", label: "Data EDA", icon: BarChart2 },
  { href: "/planner", label: "Itinerary", icon: Map },
  { href: "/about", label: "About", icon: Info },
]

export default function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const [session, setSession] = useState<SessionUser | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const syncSession = () => setSession(getClientSession())

  useEffect(() => {
    syncSession()
    setMenuOpen(false)
    setMobileSidebarOpen(false)
  }, [pathname])

  useEffect(() => {
    window.addEventListener("wjai-session-change", syncSession)
    window.addEventListener("storage", syncSession)
    return () => {
      window.removeEventListener("wjai-session-change", syncSession)
      window.removeEventListener("storage", syncSession)
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (event: MouseEvent) => {
      if (menuOpen && !wrapRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [menuOpen])

  const handleLogout = (role: SessionUser["role"]) => {
    clearSession()
    setMenuOpen(false)
    setMobileSidebarOpen(false)
    router.push(role === "admin" ? "/" : "/auth/user")
    router.refresh()
  }

  const accountPanel =
    session == null ? null : (
      <div className="rounded-xl border border-border bg-background p-4 text-sm text-foreground shadow-lg ring-1 ring-black/5">
        <div className="border-b border-border pb-3">
          <p className="text-xs font-medium text-muted-foreground">Akun Anda</p>
          <p className="mt-1 font-semibold leading-tight text-foreground">{session.name}</p>
          <p className="truncate text-xs text-muted-foreground" title={session.email}>
            {session.email}
          </p>
          <p className="mt-2 inline-flex rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {session.role === "admin" ? "Administrator" : "Pengguna"}
          </p>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {session.role === "user" ? (
            <>
              <Link
                href="/user/edit"
                onClick={() => setMenuOpen(false)}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
              >
                <SquarePen className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Edit profil
              </Link>
              <Link
                href="/user/itinerary-history"
                onClick={() => setMenuOpen(false)}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
              >
                <Map className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Riwayat itinerary
              </Link>
              <Link
                href="/user/cluster-history"
                onClick={() => setMenuOpen(false)}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
              >
                <BarChart2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Riwayat cluster
              </Link>
            </>
          ) : (
            <Link
              href="/admin"
              onClick={() => setMenuOpen(false)}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <LayoutDashboard className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Panel admin
            </Link>
          )}
          <button
            type="button"
            onClick={() => handleLogout(session.role)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/15"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Log out
          </button>
        </div>
      </div>
    )

  return (
    <header className="z-50 bg-primary text-primary-foreground">
      <div className="relative mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <div className="relative z-[1] flex min-w-0 flex-1 items-center justify-start">
          <Link
            href="/"
            className="flex max-w-[min(100%,13rem)] items-center gap-2.5 truncate text-base font-bold sm:max-w-none sm:text-[17px]"
          >
            <MapPinned className="h-[18px] w-[18px] shrink-0" />
            <span className="truncate">Wisata Jakarta AI</span>
          </Link>
        </div>

        <nav className="hidden items-center justify-center gap-1 sm:flex">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href
            const Icon = item.icon
            return (
              <Link
                key={`desktop-nav-${item.href}`}
                href={item.href}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active ? "bg-white text-primary" : "text-white/90 hover:bg-white/15 hover:text-white"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="relative z-[1] flex min-w-0 flex-1 items-center justify-end gap-2">
          <button
            type="button"
            aria-expanded={mobileSidebarOpen}
            aria-haspopup="dialog"
            onClick={() => setMobileSidebarOpen((o) => !o)}
            className="relative z-10 inline-flex h-10 w-10 shrink-0 items-center justify-center text-white/90 outline-none ring-offset-primary transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-white/90 sm:hidden"
          >
            {mobileSidebarOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
            <span className="sr-only">Buka menu navigasi</span>
          </button>

          {!session ? (
            <Link
              href="/auth/user"
              className="hidden shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-white/40 bg-white px-3.5 py-2 text-sm font-bold text-primary shadow-sm transition-colors hover:bg-white/95 sm:inline-flex"
            >
              <LogIn className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Masuk
            </Link>
          ) : (
            <div
              ref={wrapRef}
              className="relative hidden shrink-0 sm:block"
              onMouseEnter={() => {
                if (
                  typeof window !== "undefined" &&
                  window.matchMedia("(hover: hover)").matches &&
                  window.matchMedia("(pointer: fine)").matches
                ) {
                  setMenuOpen(true)
                }
              }}
              onMouseLeave={() => {
                if (
                  typeof window !== "undefined" &&
                  window.matchMedia("(hover: hover)").matches &&
                  window.matchMedia("(pointer: fine)").matches
                ) {
                  setMenuOpen(false)
                }
              }}
            >
              <button
                type="button"
                aria-expanded={menuOpen}
                aria-haspopup="dialog"
                onClick={() => setMenuOpen((o) => !o)}
                className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center text-white/90 outline-none ring-offset-primary transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-white/90"
              >
                <UserRound className="h-5 w-5" aria-hidden />
                <span className="sr-only">Informasi pengguna dan edit profil</span>
              </button>

              <div
                className={`absolute right-0 top-full z-[100] -mt-1 pt-2 min-w-[16rem] max-w-[min(calc(100vw-2rem),22rem)] origin-top-right transition-[opacity,transform] duration-150 ${
                  menuOpen
                    ? "pointer-events-auto scale-100 opacity-100 visible"
                    : "pointer-events-none invisible scale-95 opacity-0"
                }`}
              >
                {accountPanel}
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        className={`fixed inset-0 z-[120] transition-opacity duration-200 sm:hidden ${
          mobileSidebarOpen ? "pointer-events-auto visible opacity-100" : "pointer-events-none invisible opacity-0"
        }`}
        aria-hidden={!mobileSidebarOpen}
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/45"
          onClick={() => setMobileSidebarOpen(false)}
          aria-label="Tutup menu"
        />
        <aside
          className={`absolute right-0 top-0 flex h-full w-[min(88vw,22rem)] flex-col border-l border-border bg-background p-4 text-foreground shadow-2xl transition-transform duration-200 ${
            mobileSidebarOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
            <p className="text-sm font-semibold">Navigasi</p>
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted/40"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div className="space-y-1.5">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href
              const Icon = item.icon
              return (
                <Link
                  key={`mobile-nav-${item.href}`}
                  href={item.href}
                  onClick={() => setMobileSidebarOpen(false)}
                  className={`inline-flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                    active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  {item.label}
                </Link>
              )
            })}
          </div>

          <div className="mt-5 border-t border-border pt-4">
            {!session ? (
              <Link
                href="/auth/user"
                onClick={() => setMobileSidebarOpen(false)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <LogIn className="h-4 w-4 shrink-0" aria-hidden />
                Masuk
              </Link>
            ) : (
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">Akun Anda</p>
                <p className="mt-1 text-sm font-semibold leading-tight">{session.name}</p>
                <p className="truncate text-xs text-muted-foreground" title={session.email}>
                  {session.email}
                </p>
                <p className="mt-2 inline-flex rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {session.role === "admin" ? "Administrator" : "Pengguna"}
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  {session.role === "user" ? (
                    <>
                      <Link
                        href="/user/edit"
                        onClick={() => setMobileSidebarOpen(false)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                      >
                        <SquarePen className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        Edit profil
                      </Link>
                      <Link
                        href="/user/itinerary-history"
                        onClick={() => setMobileSidebarOpen(false)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                      >
                        <Map className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        Riwayat itinerary
                      </Link>
                      <Link
                        href="/user/cluster-history"
                        onClick={() => setMobileSidebarOpen(false)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                      >
                        <BarChart2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        Riwayat cluster
                      </Link>
                    </>
                  ) : (
                    <Link
                      href="/admin"
                      onClick={() => setMobileSidebarOpen(false)}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                    >
                      <LayoutDashboard className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Panel admin
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => handleLogout(session.role)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/15"
                  >
                    <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Log out
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </header>
  )
}
