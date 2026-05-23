'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ChevronDown, Compass, MapPinned, Route } from 'lucide-react'
import CtaItinerarySection from '@/components/wisata/CtaItinerarySection'
import Navbar from '@/components/wisata/Navbar'
import aboutImage from '@/image/about.png'

const FAQ_ITEMS: Array<{
  q: string
  a?: string
  intro?: string
  steps?: string[]
  outro?: string
}> = [
  {
    q: 'Bagaimana alur program dari input sampai output?',
    intro: 'Program berjalan dalam tiga langkah berurutan:',
    steps: [
      '1. Input Preferensi — isi lokasi hotel, durasi perjalanan, dan preferensi wisata di halaman Planner.',
      '2. Review Cluster — tinjau hasil pengelompokan destinasi, pilih tempat per hari, dan lihat rute di halaman Cluster.',
      '3. Finalisasi Itinerary — atur timeline harian, lihat peta, lalu simpan atau cetak itinerary siap pakai di halaman Itinerary.',
    ],
    outro: 'Setiap langkah harus diselesaikan berurutan agar tahap berikutnya dapat dibuka.',
  },
  {
    q: 'Apakah saya harus paham istilah AI untuk memakai aplikasi ini?',
    a: 'Tidak. Seluruh alur dirancang untuk siapa pun: pilih lokasi hotel, tulis preferensi, lalu sistem menyiapkan rekomendasi dan itinerary.',
  },
  {
    q: 'Kenapa input hotel dijadikan langkah pertama?',
    a: 'Karena titik hotel dipakai sebagai acuan jarak dan penyusunan rute harian, sehingga hasil lebih realistis untuk perjalanan nyata.',
  },
  {
    q: 'Apa beda hasil cluster dengan daftar rekomendasi biasa?',
    a: 'Cluster membantu mengelompokkan destinasi dengan karakter serupa, jadi pemilihan kombinasi tempat per hari jadi lebih cepat dan terarah.',
  },
  {
    q: 'Apakah hasil itinerary bisa disesuaikan jumlah harinya?',
    a: 'Bisa. Jumlah hari dapat diatur, lalu destinasi bisa dipilih per cluster sesuai kebutuhan perjalanan.',
  },
  {
    q: 'Apakah sistem mempertimbangkan akses transportasi umum?',
    a: 'Ya. Informasi kedekatan halte serta konteks lokasi ikut dipakai agar rute lebih realistis di kondisi lapangan.',
  },
  {
    q: 'Untuk apa tampilan analisis grafik pada halaman cluster?',
    a: 'Analisis grafik membantu membaca kualitas pengelompokan destinasi sehingga keputusan pemilihan cluster lebih meyakinkan.',
  },
]

export default function AboutPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background">
        <section className="page-hero">
          <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10 md:py-12">
            <div className="mb-5 text-center md:mb-7">
              <h1 className="text-3xl font-black tracking-tight text-primary-foreground sm:text-4xl md:text-5xl">Tentang Wisata Jakarta AI</h1>
            </div>
            <div className="grid grid-cols-1 mt-5 items-stretch gap-6 md:grid-cols-2 md:gap-8">
              <div className="surface-card wjai-fade-up wjai-delay-1 h-full min-h-[320px] overflow-hidden p-0 md:min-h-[420px]">
                <Image
                  src={aboutImage}
                  alt="Ilustrasi aplikasi Wisata Jakarta AI"
                  width={1200}
                  height={800}
                  className="h-full min-h-[280px] w-full object-cover wjai-image-zoom"
                  priority
                />
              </div>
              <div className="wjai-fade-up flex h-full min-h-[320px] md:min-h-[420px]">
                <article className="flex h-full w-full flex-col rounded-2xl bg-white/14 p-5 backdrop-blur-sm sm:p-6">
                  <div className="w-fit max-w-full self-start">
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-primary/20 px-3 py-1 text-xs font-bold text-white">
                      <MapPinned className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Perencanaan wisata yang lebih terarah
                    </span>
                  </div>
                  <div className="mt-3 space-y-3">
                    <p className="text-base leading-relaxed text-justify text-primary-foreground/90 sm:text-[17px]">
                      Wisata Jakarta AI membantu menyusun rencana perjalanan dari lokasi hotel, preferensi destinasi, hingga itinerary harian yang praktis dan nyaman diikuti.
                    </p>
                    <p className="text-base leading-relaxed text-justify text-primary-foreground/85 sm:text-[17px]">
                      Sistem memadukan Vector Similarity Search dan Intelligent K-Means untuk menghadirkan rekomendasi yang relevan, ringkas, dan mudah dipahami.
                    </p>
                  </div>
                  <div className="mt-auto grid grid-cols-1 gap-2 pt-4 sm:grid-cols-2">
                    <div className="flex items-center justify-center gap-2 rounded-xl bg-white p-3 text-center text-sm font-semibold text-primary shadow-sm sm:text-base">
                      <Route className="h-4 w-4 shrink-0" />
                      <span>Rute lebih kontekstual dari titik awal hotel</span>
                    </div>
                    <div className="flex items-center justify-center gap-2 rounded-xl bg-white p-3 text-center text-sm font-semibold text-primary shadow-sm sm:text-base">
                      <Compass className="h-4 w-4 shrink-0" />
                      <span>Proses pemilihan destinasi lebih cepat dan jelas</span>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section">
          <div className="mb-5 text-center">
            <h2 className="text-2xl font-bold text-primary sm:text-3xl">FAQ</h2>
            <p className="mt-1 text-sm text-muted-foreground">Pertanyaan yang paling sering muncul tentang cara kerja sistem</p>
          </div>
          <div className="space-y-3">
            {FAQ_ITEMS.map((item, idx) => (
              <article
                key={item.q}
                className={`overflow-hidden rounded-2xl p-4 backdrop-blur-sm transition-all sm:p-5 ${
                  openFaq === idx ? 'bg-primary/12 shadow-sm' : 'bg-primary/5'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq((prev) => (prev === idx ? null : idx))}
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-1 text-left transition-all"
                  aria-expanded={openFaq === idx}
                >
                  <span className="text-left text-sm font-semibold text-foreground">{item.q}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ${openFaq === idx ? 'rotate-180' : ''}`}
                  />
                </button>
                <div
                  className="overflow-hidden transition-all duration-300"
                  style={{
                    maxHeight: openFaq === idx ? (item.steps ? '28rem' : '15rem') : '0px',
                    opacity: openFaq === idx ? 1 : 0,
                  }}
                >
                  <div className="pt-2 text-sm leading-relaxed text-muted-foreground">
                    {item.steps ? (
                      <>
                        <p>{item.intro}</p>
                        <ol className="mt-2 list-decimal space-y-2 pl-5 marker:font-semibold marker:text-foreground">
                          {item.steps.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                        {item.outro ? <p className="mt-2">{item.outro}</p> : null}
                      </>
                    ) : (
                      <p>{item.a}</p>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <CtaItinerarySection />
      </main>

      <footer className="border-t border-border bg-card/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-center text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:text-left">
          <p>Wisata Jakarta AI © 2026</p>
          <p>Platform rekomendasi wisata dengan alur yang jelas dan terarah</p>
        </div>
      </footer>
    </>
  )
}
