'use client'

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google"
import { LockKeyhole, UserCircle2 } from "lucide-react"
import { setSession } from "@/lib/auth"
import { loginAccount, loginWithGoogle, registerAccount } from "@/lib/api"
import type { UserRole } from "@/lib/types"

interface AuthFormCardProps {
  role: UserRole
  title: string
  description: string
  redirectPath: string
  alternatePath?: string
  alternateLabel?: string
  /** Admin: tanpa tab daftar. User: masuk + daftar. */
  loginOnly?: boolean
  enableGoogleLogin?: boolean
  /** Tampil saat mode login; link di bawah field password. */
  forgotPasswordPath?: string
}

function AuthFormCardInner({
  role,
  title,
  description,
  redirectPath,
  alternatePath,
  alternateLabel,
  loginOnly = role === "admin",
  enableGoogleLogin = true,
  forgotPasswordPath,
}: AuthFormCardProps) {
  const router = useRouter()
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || ""
  const showGoogle = enableGoogleLogin && Boolean(googleClientId)
  const [mode, setMode] = useState<"login" | "register">("login")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  const isLoginMode = loginOnly || mode === "login"
  const showForgotLink = isLoginMode && Boolean(forgotPasswordPath)

  const finishLogin = (user: Parameters<typeof setSession>[0]) => {
    setSession(user)
    router.push(redirectPath)
    router.refresh()
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setLoading(true)

    try {
      const response = isLoginMode
        ? await loginAccount({ email, password, role })
        : await registerAccount({ name: name.trim(), email, password, role })

      finishLogin(response.user)
    } catch (err) {
      setError((err as Error).message || "Proses gagal.")
      setLoading(false)
    }
  }

  const handleGoogleSuccess = async (credentialResponse: { credential?: string }) => {
    const credential = credentialResponse.credential?.trim()
    if (!credential) {
      setError("Token Google tidak valid.")
      return
    }

    setError("")
    setGoogleLoading(true)
    try {
      const response = await loginWithGoogle({ credential, role })
      finishLogin(response.user)
    } catch (err) {
      setError((err as Error).message || "Login Google gagal.")
      setGoogleLoading(false)
    }
  }

  const busy = loading || googleLoading

  return (
    <div className="surface-card w-full max-w-md p-6">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          {role === "admin" ? <LockKeyhole className="h-6 w-6" /> : <UserCircle2 className="h-6 w-6" />}
        </div>
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      {enableGoogleLogin && !showGoogle ? (
        <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          Login Google belum aktif. Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (frontend) dan `GOOGLE_OAUTH_CLIENT_ID`
          (backend).
        </p>
      ) : null}

      {showGoogle ? (
        <div className="mb-4">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => setError("Login Google dibatalkan atau gagal.")}
            text="signin_with"
            shape="rectangular"
            theme="outline"
            size="large"
            width="100%"
          />
          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">atau email</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        </div>
      ) : null}

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
            autoComplete="email"
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
            autoComplete={isLoginMode ? "current-password" : "new-password"}
          />
          {showForgotLink ? (
            <div className="mt-2 text-right">
              <Link href={forgotPasswordPath!} className="text-xs font-medium text-primary hover:underline">
                Lupa password?
              </Link>
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
        >
          {loading ? "Memproses..." : isLoginMode ? "Masuk" : "Daftar"}
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

export default function AuthFormCard(props: AuthFormCardProps) {
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || ""
  const needsGoogle = props.enableGoogleLogin !== false && Boolean(googleClientId)

  if (!needsGoogle) {
    return <AuthFormCardInner {...props} />
  }

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <AuthFormCardInner {...props} />
    </GoogleOAuthProvider>
  )
}
