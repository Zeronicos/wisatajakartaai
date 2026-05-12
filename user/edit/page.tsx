'use client'

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import Navbar from "@/components/wisata/Navbar"
import { clearSession, getClientSession, setSession } from "@/lib/auth"
import { updateOwnProfile } from "@/lib/api"
import type { SessionUser } from "@/lib/types"

function extractError(err: unknown): string {
  if (!(err instanceof Error)) return "Gagal menyimpan."
  try {
    const j = JSON.parse(err.message) as { detail?: { message?: string } }
    const m = j?.detail?.message
    if (typeof m === "string") return m
  } catch {
    /* noop */
  }
  return err.message || "Proses gagal."
}

export default function UserEditProfilePage() {
  const router = useRouter()
  const [session, setLocalSession] = useState<SessionUser | null>(null)
  const [name, setName] = useState("")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const s = getClientSession()
    if (!s) {
      router.replace("/auth/user")
      return
    }
    if (s.role !== "user") {
      router.replace("/")
      return
    }
    setLocalSession(s)
    setName(s.name)
  }, [router])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError("")
    setSuccess("")

    const s = getClientSession()
    if (!s?.email || s.role !== "user") {
      router.replace("/auth/user")
      return
    }

    if (newPassword && newPassword !== confirmPassword) {
      setError("Konfirmasi password baru tidak sama.")
      return
    }

    setLoading(true)
    try {
      const res = await updateOwnProfile({
        email: s.email,
        current_password: currentPassword,
        name,
        new_password: newPassword.trim() || null,
      })
      setSession(res.user)
      setLocalSession(res.user)
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setSuccess("Profil berhasil diperbarui.")
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }

  if (!session) {
    return (
      <>
        <Navbar />
        <main className="min-h-screen bg-background px-4 py-8">
          <p className="text-center text-sm text-muted-foreground">Memuat…</p>
        </main>
      </>
    )
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto max-w-lg space-y-4">
          <div className="surface-card space-y-1 p-5">
            <h1 className="text-xl font-bold text-foreground">Edit profil</h1>
            <p className="text-sm text-muted-foreground">Perbarui nama atau password Anda.</p>
            <p className="text-xs text-muted-foreground">Email: {session.email}</p>
          </div>

          <form onSubmit={handleSubmit} className="surface-card space-y-4 p-5">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Nama</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
                maxLength={200}
                autoComplete="name"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Password saat ini</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
                autoComplete="current-password"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Password baru (opsional)</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                autoComplete="new-password"
                placeholder="Kosongkan jika tidak diganti"
              />
            </div>

            {newPassword ? (
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Ulangi password baru</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  autoComplete="new-password"
                />
              </div>
            ) : null}

            {error ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            ) : null}
            {success ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">
                {success}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
            >
              {loading ? "Menyimpan…" : "Simpan"}
            </button>
          </form>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/user"
              className="inline-flex rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
            >
              Ke halaman user
            </Link>
            <Link
              href="/"
              className="inline-flex rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Beranda
            </Link>
            <button
              type="button"
              className="ml-auto rounded-lg px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10"
              onClick={() => {
                clearSession()
                router.push("/auth/user")
                router.refresh()
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </main>
    </>
  )
}
