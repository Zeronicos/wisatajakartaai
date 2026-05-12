'use client'

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { LockKeyhole, UserCircle2 } from "lucide-react"
import { setSession } from "@/lib/auth"
import { loginAccount, registerAccount } from "@/lib/api"
import type { UserRole } from "@/lib/types"

interface AuthFormCardProps {
  role: UserRole
  title: string
  description: string
  redirectPath: string
  alternatePath?: string
  alternateLabel?: string
}

export default function AuthFormCard({
  role,
  title,
  description,
  redirectPath,
  alternatePath,
  alternateLabel,
}: AuthFormCardProps) {
  const router = useRouter()
  const loginOnly = role === "admin"
  const [mode, setMode] = useState<"login" | "register">("login")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setLoading(true)

    try {
      const response =
        loginOnly || mode === "login"
          ? await loginAccount({ email, password, role })
          : await registerAccount({ name: name.trim(), email, password, role })

      setSession(response.user)
      router.push(redirectPath)
      router.refresh()
    } catch (err) {
      setError((err as Error).message || "Proses gagal.")
      setLoading(false)
    }
  }

  return (
    <div className="surface-card w-full max-w-md p-6">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          {role === "admin" ? <LockKeyhole className="h-6 w-6" /> : <UserCircle2 className="h-6 w-6" />}
        </div>
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {!loginOnly ? (
          <div className="grid grid-cols-2 rounded-xl border border-border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                mode === "login" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                mode === "register" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              Daftar
            </button>
          </div>
        ) : null}

        {!loginOnly && mode === "register" && (
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Nama</label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              required={mode === "register"}
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">Email</label>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">Password</label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            required
          />
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
        >
          {loading ? "Memproses..." : loginOnly || mode === "login" ? "Masuk" : "Daftar"}
        </button>
      </form>

      {alternatePath && alternateLabel ? (
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Butuh login lain?{" "}
          <Link href={alternatePath} className="font-medium text-primary hover:underline">
            {alternateLabel}
          </Link>
        </p>
      ) : null}
    </div>
  )
}
