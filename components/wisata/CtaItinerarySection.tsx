import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import aboutImage from '@/image/about.png'

export default function CtaItinerarySection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:py-10 md:py-12">
      <div className="relative overflow-hidden rounded-[1.6rem] border border-primary p-4 sm:p-5 md:p-6">
        <Image
          src={aboutImage}
          alt="Latar perencanaan itinerary wisata Jakarta"
          fill
          className="object-cover"
          sizes="(max-width: 1024px) 100vw, 1200px"
        />
        <div className="absolute inset-0 bg-black/65" />
        <div className="relative z-[1] flex flex-col items-center gap-4 p-4 text-center sm:p-5">
          <div className="max-w-3xl">
            <h2 className="text-lg font-bold text-white">Siap ubah rencana wisata jadi itinerary yang jelas?</h2>
            <p className="mt-1 text-sm text-white/95">
              Mulai dari lokasi hotel, lanjut preferensi, lalu dapatkan susunan destinasi harian yang lebih terarah.
            </p>
          </div>
          <Link
            href="/planner"
            className="inline-flex items-center gap-2 rounded-xl border border-white/40 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20"
          >
            Mulai Sekarang
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}
