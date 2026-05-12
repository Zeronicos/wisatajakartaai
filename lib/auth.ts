import type { SessionUser, UserRole } from "@/lib/types"

export const SESSION_COOKIE_NAME = "wjai_session"
export const SESSION_USER_STORAGE_KEY = "wjai_session_user"

function buildSessionToken(user: SessionUser): string {
  return `${user.role}:${encodeURIComponent(user.email)}`
}

export function getDemoUsers(): SessionUser[] {
  return []
}

export function parseSessionToken(token: string | undefined): { role: UserRole; email: string } | null {
  if (!token) return null
  const [rolePart, ...rest] = token.split(":")
  if ((rolePart !== "admin" && rolePart !== "user") || rest.length === 0) return null
  return { role: rolePart, email: decodeURIComponent(rest.join(":")) }
}

export function setSession(user: SessionUser) {
  if (typeof document === "undefined" || typeof window === "undefined") return
  const token = buildSessionToken(user)
  document.cookie = `${SESSION_COOKIE_NAME}=${token}; Path=/; Max-Age=86400; SameSite=Lax`
  window.localStorage.setItem(SESSION_USER_STORAGE_KEY, JSON.stringify(user))
  window.dispatchEvent(new Event("wjai-session-change"))
}

export function clearSession() {
  if (typeof document === "undefined" || typeof window === "undefined") return
  document.cookie = `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`
  window.localStorage.removeItem(SESSION_USER_STORAGE_KEY)
  window.dispatchEvent(new Event("wjai-session-change"))
}

export function getClientSession(): SessionUser | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem(SESSION_USER_STORAGE_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as SessionUser
    if (!parsed || (parsed.role !== "admin" && parsed.role !== "user")) return null
    return parsed
  } catch {
    return null
  }
}
