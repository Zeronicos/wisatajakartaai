/** Ikon emoji berdasarkan subkategori destinasi (dipakai itinerary & cluster). */
export function getCategoryIcon(subcategory: string) {
  const s = subcategory?.toLowerCase() ?? ''
  if (s.includes('museum')) return '🏛️'
  if (s.includes('monument')) return '🗽'
  if (s.includes('mosque') || s.includes('church')) return '⛪'
  if (s.includes('park') || s.includes('zoo')) return '🌿'
  if (s.includes('harbor')) return '⚓'
  if (s.includes('heritage')) return '🏯'
  if (s.includes('theme_park') || s.includes('aquarium')) return '🎡'
  if (s.includes('planetarium')) return '🔭'
  if (s.includes('market')) return '🛍️'
  return '📍'
}
