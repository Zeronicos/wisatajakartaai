'use client'

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, Mail } from "lucide-react"
import { requestPasswordReset } from "@/lib/api"
import type { UserRole } from "@/lib/types"

interface ForgotPasswordFormProps {
  role: UserRole
  loginPath?: string
  title?: string
  description?: string
}

export default function ForgotPasswordForm({
  role,
  loginPath = "..",
  title,
  description,
}: ForgotPasswordFormProps) {
  const roleLabel = role === "admin" ? "Admin" : "User"
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [debugUrl, setDebugUrl] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setMessage("")
    setDebugUrl("")
    setLoading(true)

    try {
      const response = await requestPasswordReset({ email, role })
      setMessage(response.message)
      if (response.debug_reset_url) {
        setDebugUrl(response.debug_reset_url)
      }
    } catch (err) {
      setError((err as Error).message || "Permintaan gagal.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="surface-card w-full max-w-md p-6">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Mail className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold text-foreground">{title ?? `Lupa Password ${roleLabel}`}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {description ?? `Masukkan email ${roleLabel.toLowerCase()}. Kami akan mengirim tautan reset jika terdaftar.`}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">Email</label>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            required
            autoComplete="email"
          />
        </div>

        {message ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">
            {message}
          </div>
        ) : null}

        {debugUrl ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
            <p className="mb-1 font-semibold">Mode debug (SMTP belum aktif):</p>
            <a href={debugUrl} className="break-all underline">
              {debugUrl}
            </a>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
        >
          {loading ? "Mengirim..." : "Kirim Tautan Reset"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        <Link href={loginPath} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Kembali ke login
        </Link>
      </p>
    </div>
  )
}
