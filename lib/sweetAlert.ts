'use client'

const PRIMARY_CONFIRM = '#22c55e'

const BLOCKED_COPY = {
  1: {
    title: 'Langkah 1 belum selesai',
    html: 'Selesaikan <strong>Input Preferensi</strong> (hotel, preferensi, dan generate cluster) terlebih dahulu sebelum melanjutkan.',
    confirmButtonText: 'Ke Input Preferensi',
  },
  2: {
    title: 'Langkah 2 belum selesai',
    html: 'Selesaikan <strong>Review Cluster</strong> dan klik <strong>Buat Itinerary</strong> terlebih dahulu sebelum membuka finalisasi.',
    confirmButtonText: 'Ke Review Cluster',
  },
} as const

export async function showAppFlowBlockedAlert(blockedAt: 1 | 2): Promise<void> {
  const Swal = (await import('sweetalert2')).default
  const copy = BLOCKED_COPY[blockedAt]

  await Swal.fire({
    icon: 'warning',
    title: copy.title,
    html: copy.html,
    confirmButtonText: copy.confirmButtonText,
    confirmButtonColor: PRIMARY_CONFIRM,
    allowOutsideClick: false,
    customClass: {
      popup: 'rounded-2xl',
      title: 'text-lg font-bold',
      htmlContainer: 'text-sm leading-relaxed',
    },
  })
}
