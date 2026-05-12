'use client'

import { useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import Navbar from "@/components/wisata/Navbar"
import { clearSession, getClientSession } from "@/lib/auth"

export default function UserMainPage() {
  const router = useRouter()
  const user = useMemo(() => getClientSession(), [])

  const handleLogout = () => {
    clearSession()
    router.push("/auth/user")
    router.refresh()
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="surface-card p-5">
          <h1 className="text-2xl font-bold text-foreground">User Page</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Selamat datang, <span className="font-semibold text-foreground">{user?.name ?? "Pengguna"}</span>.
            Halaman ini khusus role user.
          </p>
        </div>

        <div className="surface-card p-5">
          <h2 className="text-lg font-semibold text-foreground">Informasi Akun</h2>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Email:</span> {user?.email ?? "-"}
            </p>
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Role:</span> {user?.role ?? "-"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/user/edit"
            className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted"
          >
            Edit profil
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Kembali ke Beranda
          </Link>
          <button
            onClick={handleLogout}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Logout
          </button>
        </div>
      </div>
    </main>
    </>
  )
}
