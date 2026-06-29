'use client'

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, KeyRound } from "lucide-react"
import AuthErrorAlert from "@/components/auth/AuthErrorAlert"
import PasswordField from "@/components/auth/PasswordField"
import { resetPassword } from "@/lib/api"
import { formatAuthError } from "@/lib/authErrors"
import type { UserRole } from "@/lib/types"

interface ResetPasswordFormProps {
  role: UserRole
  loginPath?: string
  title?: string
}

export default function ResetPasswordForm({
  role,
  loginPath = "..",
  title,
}: ResetPasswordFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = useMemo(() => (searchParams.get("token") || "").trim(), [searchParams])
  const roleLabel = role === "admin" ? "Admin" : "User"

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setMessage("")

    if (!token) {
      setError("Tautan reset tidak valid.")
      return
    }
    if (password.length < 6) {
      setError("Password minimal 6 karakter.")
      return
    }
    if (password !== confirmPassword) {
      setError("Konfirmasi password tidak sama.")
      return
    }

    setLoading(true)
    try {
      const response = await resetPassword({
        token,
        new_password: password,
        role,
      })
      setMessage(response.message)
      setTimeout(() => router.push(loginPath), 1800)
    } catch (err) {
      setError(formatAuthError(err, "Reset password gagal. Coba lagi."))
      setLoading(false)
    }
  }

  return (
    <div className="surface-card w-full max-w-md p-6">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <KeyRound className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold text-foreground">{title ?? `Reset Password ${roleLabel}`}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Buat password baru untuk akun Anda.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <PasswordField
          label="Password baru"
          value={password}
          onChange={(value) => {
            setPassword(value)
            if (error) setError("")
          }}
          autoComplete="new-password"
          minLength={6}
        />

        <PasswordField
          label="Konfirmasi password"
          value={confirmPassword}
          onChange={(value) => {
            setConfirmPassword(value)
            if (error) setError("")
          }}
          autoComplete="new-password"
          minLength={6}
        />

        {message ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">
            {message}
          </div>
        ) : null}

        <AuthErrorAlert message={error} />

        <button
          type="submit"
          disabled={loading || !token}
          className="w-full rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
        >
          {loading ? "Menyimpan..." : "Simpan Password Baru"}
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
