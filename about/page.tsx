'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Building2, Brain, ChevronDown, MapPinned } from 'lucide-react'
import Navbar from '@/components/wisata/Navbar'
import aboutImage from '@/image/about.png'

const FAQ_ITEMS = [
  {
    q: 'Apakah saya harus paham istilah AI untuk memakai aplikasi ini?',
    a: 'Tidak. Seluruh alur dirancang untuk pengguna umum: pilih lokasi hotel, tulis preferensi, lalu sistem menyiapkan rekomendasi dan itinerary.',
  },
  {
    q: 'Kenapa input hotel dijadikan langkah pertama?',
    a: 'Karena titik hotel dipakai sebagai acuan jarak dan penyusunan rute harian, sehingga hasil lebih realistis untuk perjalanan nyata.',
  },
  {
    q: 'Apa beda hasil cluster dengan daftar rekomendasi biasa?',
    a: 'Cluster membantu mengelompokkan destinasi dengan karakter serupa, jadi pengguna lebih mudah memilih kombinasi tempat per hari.',
  },
]

export default function AboutPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background">
        <section className="page-hero">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-6 px-4 py-8 sm:py-10 md:grid-cols-2 md:gap-8 md:py-12">
            <div className="surface-card wjai-fade-up wjai-delay-1 overflow-hidden p-0">
              <Image
                src={aboutImage}
                alt="Ilustrasi aplikasi Wisata Jakarta AI"
                width={1200}
                height={800}
                className="h-auto w-full wjai-image-zoom"
                priority
              />
            </div>
            <div className="wjai-fade-up text-left">

              <h1 className="mt-3 text-2xl font-bold text-primary-foreground sm:text-3xl">Tentang Wisata Jakarta AI</h1>
              <div className="mt-5 space-y-3">
                <article className="rounded-xl border border-white/20 bg-white/10 p-3">
                  <div className="flex items-start gap-2.5">
                    <MapPinned className="mt-0.5 h-4 w-4 shrink-0 text-primary-foreground" />
                    <div>
                      <h3 className="text-sm font-semibold text-primary-foreground">Berbasis lokasi nyata</h3>
                      <p className="mt-1 text-xs leading-relaxed text-primary-foreground/85">
                        Titik hotel dipakai sebagai entry point agar rute lebih kontekstual dengan perjalanan pengguna.
                      </p>
                    </div>
                  </div>
                </article>
                <article className="rounded-xl border border-white/20 bg-white/10 p-3">
                  <div className="flex items-start gap-2.5">
                    <Brain className="mt-0.5 h-4 w-4 shrink-0 text-primary-foreground" />
                    <div>
                      <h3 className="text-sm font-semibold text-primary-foreground">Didukung AI</h3>
                      <p className="mt-1 text-xs leading-relaxed text-primary-foreground/85">
                        Menggunakan Vector Similarity Search dan Intelligent K-Means untuk rekomendasi yang bermakna.
                      </p>
                    </div>
                  </div>
                </article>
                <article className="rounded-xl border border-white/20 bg-white/10 p-3">
                  <div className="flex items-start gap-2.5">
                    <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-primary-foreground" />
                    <div>
                      <h3 className="text-sm font-semibold text-primary-foreground">Ramah pengguna umum</h3>
                      <p className="mt-1 text-xs leading-relaxed text-primary-foreground/85">
                        Antarmuka disusun agar proses input, interpretasi, hingga itinerary mudah dipahami.
                      </p>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section">
          <div className="section-title-row section-title-row-mobile-center mb-4">
            <h2 className="text-xl font-bold text-foreground">FAQ Singkat</h2>
          </div>
          <div className="space-y-3">
            {FAQ_ITEMS.map((item, idx) => (
              <article
                key={item.q}
                className={`overflow-hidden rounded-2xl border p-4 backdrop-blur-sm transition-all sm:p-5 ${
                  openFaq === idx ? 'border-primary/45 bg-primary/10 shadow-sm' : 'border-primary/20 bg-primary/5'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq((prev) => (prev === idx ? null : idx))}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-2 py-1 text-left transition-all ${
                    openFaq === idx ? 'outline outline-2 outline-primary/60' : ''
                  }`}
                  aria-expanded={openFaq === idx}
                >
                  <span className="text-sm font-semibold text-foreground">{item.q}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ${openFaq === idx ? 'rotate-180' : ''}`}
                  />
                </button>
                <div
                  className="overflow-hidden transition-all duration-300"
                  style={{ maxHeight: openFaq === idx ? '180px' : '0px', opacity: openFaq === idx ? 1 : 0 }}
                >
                  <p className="pt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-8 sm:py-10 md:py-12">
          <div className="rounded-[2rem] border border-white/35 p-2 sm:p-3">
            <div className="relative overflow-hidden rounded-[1.6rem] bg-primary p-4 sm:p-5 md:p-6">
              <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-white/15 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-20 -left-12 h-48 w-48 rounded-full bg-accent/20 blur-3xl" />
              <div className="relative z-[1] flex flex-col items-center gap-4 rounded-2xl border border-white/30 bg-primary p-5 text-center sm:p-6">
                <div className="max-w-3xl">
                  <h2 className="text-lg font-bold text-white">Siap ubah rencana wisata jadi itinerary yang jelas?</h2>
                  <p className="mt-1 text-sm text-white">
                    Mulai dari lokasi hotel, lalu biarkan sistem membantu Anda menyiapkan rute yang lebih terstruktur.
                  </p>
                </div>
                <Link
                  href="/planner"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/40 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-white/20"
                >
                  Mulai Sekarang
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-card/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-center text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:text-left">
          <p>Wisata Jakarta AI © 2026</p>
          <p>Platform rekomendasi wisata yang ramah pengguna</p>
        </div>
      </footer>
    </>
  )
}
