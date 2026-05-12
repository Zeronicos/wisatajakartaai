'use client'

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import {
  LayoutDashboard,
  LogIn,
  MapPinned,
  Home,
  BarChart2,
  Layers,
  LogOut,
  Map,
  SquarePen,
  UserRound,
} from "lucide-react"
import type { SessionUser } from "@/lib/types"
import { getClientSession, clearSession } from "@/lib/auth"

const NAV_ITEMS = [
  { href: "/", label: "Beranda", icon: Home },
  { href: "/eda", label: "Data EDA", icon: BarChart2 },
  { href: "/cluster", label: "Cluster", icon: Layers },
  { href: "/itinerary", label: "Itinerary", icon: Map },
]

export default function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const [session, setSession] = useState<SessionUser | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const syncSession = () => setSession(getClientSession())

  useEffect(() => {
    syncSession()
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
      if (!wrapRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [menuOpen])

  const handleLogout = (role: SessionUser["role"]) => {
    clearSession()
    setMenuOpen(false)
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
            <Link
              href="/user/edit"
              onClick={() => setMenuOpen(false)}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <SquarePen className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Edit profil
            </Link>
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
      <div className="relative mx-auto flex max-w-6xl items-center px-4 py-2.5">
        {/* Kiri: merek */}
        <div className="relative z-[1] flex min-w-0 flex-1 items-center justify-start">
          <Link
            href="/"
            className="flex max-w-[min(100%,12rem)] items-center gap-2 truncate text-sm font-bold sm:max-w-none sm:text-base"
          >
            <MapPinned className="h-4 w-4 shrink-0" />
            <span className="truncate">Wisata Jakarta AI</span>
          </Link>
        </div>

        {/* Tengah: menu utama */}
        <nav
          className="pointer-events-none absolute left-1/2 top-1/2 z-[2] flex max-w-[min(100vw-8rem,28rem)] -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-0.5 overflow-x-auto px-1 sm:max-w-[min(100vw-10rem,32rem)] sm:gap-1"
          aria-label="Menu utama"
        >
          <div className="pointer-events-auto flex items-center gap-0.5 sm:gap-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-1.5 text-[11px] font-semibold transition-colors sm:px-3 sm:text-xs ${
                    active
                      ? "bg-white text-primary"
                      : "text-white/80 hover:bg-white/15 hover:text-white"
                  }`}
                >
                  <Icon className="h-3 w-3 shrink-0" />
                  {item.label}
                </Link>
              )
            })}
          </div>
        </nav>

        {/* Kanan: login / akun */}
        <div className="relative z-[1] flex min-w-0 flex-1 items-center justify-end">
          {!session ? (
            <Link
              href="/auth/user"
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/40 bg-white px-3 py-1.5 text-xs font-bold text-primary shadow-sm transition-colors hover:bg-white/95"
            >
              <LogIn className="h-3 w-3 shrink-0" aria-hidden />
              Masuk
            </Link>
          ) : (
            <div
              ref={wrapRef}
              className="relative shrink-0"
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
                className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/35 bg-white/15 text-white outline-none ring-offset-primary transition-colors hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white/90"
              >
                <UserRound className="h-[18px] w-[18px]" aria-hidden />
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
    </header>
  )
}
