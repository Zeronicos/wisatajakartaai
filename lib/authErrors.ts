const AUTH_ERROR_MAP: Record<string, string> = {
  "Email atau password salah.": "Email atau password salah.",
  "Email sudah terdaftar.": "Email sudah terdaftar.",
  "Email tidak valid.": "Format email tidak valid.",
  "Nama wajib diisi.": "Nama wajib diisi.",
  "Password saat ini salah.": "Password saat ini salah.",
  "Password baru minimal 6 karakter.": "Password minimal 6 karakter.",
  "Token reset tidak valid.": "Tautan reset tidak valid.",
  "Token reset tidak valid atau sudah dipakai.": "Tautan reset sudah dipakai.",
  "Token reset sudah kedaluwarsa. Minta tautan baru.": "Tautan reset kedaluwarsa.",
  "Akun admin dengan email Google ini belum terdaftar. Hubungi super admin.":
    "Akun admin belum terdaftar.",
  "Email Google tidak cocok dengan akun terdaftar.": "Akun Google tidak cocok.",
  "GOOGLE_OAUTH_CLIENT_ID belum dikonfigurasi di backend.": "Login Google belum tersedia.",
  "Login Google dibatalkan atau gagal.": "Login Google gagal.",
  "Token Google tidak valid.": "Login Google gagal.",
}

function extractMessage(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ""

  try {
    const json = JSON.parse(trimmed) as {
      detail?: string | { message?: string }
      message?: string
    }
    if (typeof json.detail === "string") return json.detail
    if (json.detail && typeof json.detail === "object" && json.detail.message) {
      return json.detail.message
    }
    if (json.message) return json.message
  } catch {
    /* plain text */
  }

  return trimmed
}

export function formatAuthError(raw: unknown, fallback = "Proses gagal. Coba lagi."): string {
  const message = extractMessage(typeof raw === "string" ? raw : (raw as Error)?.message || "")
  if (!message) return fallback

  if (AUTH_ERROR_MAP[message]) return AUTH_ERROR_MAP[message]

  if (/Request gagal|fetch failed|Failed to fetch|ECONNREFUSED|network/i.test(message)) {
    return "Tidak dapat terhubung ke server."
  }

  if (message.length <= 100) return message
  return fallback
}
