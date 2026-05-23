export const QUERY_UNDETECTED_MESSAGE = 'Sistem tidak dapat mendeteksi permintaan.'

const NON_TOURISM_PHRASES = [
  'beli pulsa',
  'top up',
  'transfer bank',
  'crypto',
  'bitcoin',
  'asdfgh',
  'qwerty',
]

/**
 * Validasi struktural di browser saja.
 * Relevansi preferensi wisata (ID/EN) diverifikasi backend via keyword + embedding.
 */
export function validatePreferenceInput(
  raw: string,
  minChars: number,
  minAlphaRatio: number,
): string | null {
  const cleaned = raw.trim().replace(/\s+/g, ' ')
  if (cleaned.length < minChars) {
    return QUERY_UNDETECTED_MESSAGE
  }

  const lowered = cleaned.toLowerCase()
  if (NON_TOURISM_PHRASES.some((phrase) => lowered.includes(phrase))) {
    return QUERY_UNDETECTED_MESSAGE
  }

  const alphaNum = cleaned.replace(/[^a-zA-Z0-9]/g, '')
  if (alphaNum.length === 0) {
    return QUERY_UNDETECTED_MESSAGE
  }

  const alphaOnly = cleaned.replace(/[^a-zA-Z]/g, '')
  if (alphaOnly.length / Math.max(1, alphaNum.length) < minAlphaRatio) {
    return QUERY_UNDETECTED_MESSAGE
  }

  if (alphaOnly.length > 0) {
    const freq = new Map<string, number>()
    for (const ch of alphaOnly.toLowerCase()) {
      freq.set(ch, (freq.get(ch) ?? 0) + 1)
    }
    const maxCount = Math.max(...freq.values())
    if (maxCount / alphaOnly.length > 0.7) {
      return QUERY_UNDETECTED_MESSAGE
    }
  }

  return null
}
