import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { SESSION_COOKIE_NAME, parseSessionToken } from "@/lib/auth"

/** Rute internal form admin (rewrite dari WJAI_ADMIN_SECRET_PATH). Folder tanpa awalan `_` agar App Router mem-publish rute. */
const INTERNAL_ADMIN_LOGIN = "/wjai-internal-admin-login"

/** Jalur publik rahasia untuk login/register admin; set dengan env `WJAI_ADMIN_SECRET_PATH` (biasanya jalur tidak mudah tebak). */
function normalizeAdminGatePath(raw: string | undefined): string {
  let p = (raw || "").trim()
  if (!p) return "/WJAI_SUPER_SECRET_GATE"
  if (!p.startsWith("/")) p = `/${p}`
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1)
  return p
}

function redirectTo(path: string, request: NextRequest) {
  const url = request.nextUrl.clone()
  url.pathname = path
  url.search = ""
  return NextResponse.redirect(url)
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const adminGatePath = normalizeAdminGatePath(process.env.WJAI_ADMIN_SECRET_PATH)

  if (pathname === INTERNAL_ADMIN_LOGIN || pathname.startsWith(`${INTERNAL_ADMIN_LOGIN}/`)) {
    return redirectTo("/", request)
  }

  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const session = parseSessionToken(sessionToken)
  const role = session?.role

  if (pathname === adminGatePath) {
    if (role === "admin") {
      return redirectTo("/admin", request)
    }
    const url = request.nextUrl.clone()
    url.pathname = INTERNAL_ADMIN_LOGIN
    return NextResponse.rewrite(url)
  }
  const isUserAppPath =
    pathname.startsWith("/planner") ||
    pathname.startsWith("/cluster") ||
    pathname.startsWith("/itinerary") ||
    pathname.startsWith("/eda")

  if (pathname.startsWith("/auth/admin")) {
    return redirectTo("/", request)
  }

  if (isUserAppPath && role !== "user" && role !== "admin") {
    return redirectTo("/auth/user", request)
  }

  if (pathname.startsWith("/admin")) {
    if (role !== "admin") {
      return redirectTo("/", request)
    }
  }

  if (pathname.startsWith("/user")) {
    if (role !== "user") {
      return redirectTo("/auth/user", request)
    }
  }

  if (pathname.startsWith("/auth/user")) {
    if (role === "user") return redirectTo("/user", request)
    if (role === "admin") return redirectTo("/admin", request)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
