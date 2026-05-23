'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, Compass, Route, Sparkles, Target } from 'lucide-react'
import CtaItinerarySection from '@/components/wisata/CtaItinerarySection'
import Navbar from '@/components/wisata/Navbar'
import heroImage from '@/image/hero.png'
import step1Image from '@/image/step-1.png'
import step2Image from '@/image/step-2.png'
import step3Image from '@/image/step-3.png'
import step4Image from '@/image/step-4.png'
import step5Image from '@/image/step-5.png'

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main className="landing-page relative min-h-screen overflow-hidden bg-background">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -left-28 top-10 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute right-0 top-40 h-72 w-72 rounded-full bg-secondary/10 blur-3xl" />
          <div className="absolute bottom-16 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
        </div>

        <section className="page-hero">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-6 px-4 py-8 sm:py-10 md:grid-cols-2 md:gap-8 md:py-12">
            <div className="landing-hero-copy wjai-fade-up text-left md:ml-auto md:max-w-xl md:text-right">
              <div className="landing-hero-badge mb-3 w-fit max-w-full mx-auto md:ml-auto md:mr-0">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-primary/20 px-3 py-1 text-xs font-bold text-primary-foreground">
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                  Platform itinerary wisata modern untuk Jakarta
                </span>
              </div>
              <h1 className="text-3xl font-extrabold leading-tight text-primary-foreground sm:text-4xl">
                Rancang perjalanan Jakarta yang terasa premium, praktis, dan tetap mudah untuk semua kalangan
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-primary-foreground/80 sm:text-base">
                Dari titik hotel hingga itinerary harian, Wisata Jakarta AI membantu Anda membuat keputusan perjalanan
                yang lebih cepat, lebih relevan, dan lebih nyaman diikuti.
              </p>
              <div className="landing-hero-actions mt-5 flex flex-wrap items-left justify-left gap-2 md:justify-end">
                <Link
                  href="/planner"
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-primary transition-all hover:-translate-y-0.5 hover:bg-white/90"
                >
                  Buat Itinerary
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/about"
                  className="rounded-xl border border-white/35 px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-white/10"
                >
                  Tentang Aplikasi
                </Link>
              </div>
              {/* <p className="mt-2 text-xs text-primary-foreground/70">Tidak perlu setup rumit. Cocok untuk first-time traveler.</p> */}
            </div>
            <div className="landing-hero-media surface-card wjai-fade-up wjai-delay-1 overflow-hidden p-0">
              <Image
                src={heroImage}
                alt="Ilustrasi proses rekomendasi wisata Jakarta AI"
                width={1200}
                height={800}
                className="h-auto w-full wjai-image-zoom"
                priority
              />
            </div>
          </div>
        </section>

        <section className="landing-section">
          <div className="mb-5 text-center">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Compass className="h-3.5 w-3.5" />
              Nilai yang Anda Dapatkan
            </p>
            <h2 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">Tiga nilai utama untuk perjalanan yang lebih efektif</h2>
            <p className="landing-section-subdesc mx-auto mt-1 max-w-2xl text-sm text-muted-foreground">
              Fokus pada kemudahan alur, relevansi rekomendasi, dan hasil itinerary yang siap dipakai.
            </p>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              {
                title: 'Mudah digunakan',
                desc: 'Alur jelas untuk semua kalangan dari input preferensi hingga itinerary.',
                icon: Target,
              },
              {
                title: 'Rekomendasi relevan',
                desc: 'Preferensi, lokasi, akses transportasi, dan fasilitas ikut dipertimbangkan.',
                icon: CheckCircle2,
              },
              {
                title: 'Siap untuk trip',
                desc: 'Hasil akhir berupa itinerary praktis yang siap dipakai di lapangan.',
                icon: Route,
              },
            ].map((item) => {
              const Icon = item.icon
              return (
                <article
                  key={item.title}
                  className="group rounded-2xl border-2 border-primary bg-card p-5 shadow-sm outline outline-1 outline-primary/30 transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md sm:p-6"
                >
                  <div className="flex flex-col items-center text-center">
                    <div className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                      <Icon className="h-7 w-7" />
                    </div>
                    <div className="mt-3">
                      <h3 className="text-base font-bold text-primary">{item.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-primary/85">{item.desc}</p>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <section className="landing-section">
          <div className="mb-7 text-center">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              How it Works
            </p>
            <h2 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">Alur langkah yang jelas dari awal sampai itinerary</h2>
            <p className="landing-section-subdesc mx-auto mt-1 max-w-2xl text-sm text-muted-foreground">
              Setiap tahap dirancang agar proses perencanaan lebih mudah diikuti dan hasil akhirnya siap dipakai.
            </p>
          </div>

          <div className="landing-steps mt-8 space-y-7 md:space-y-9">
            {[
              {
                title: 'Tentukan titik awal hotel',
                desc: 'Lokasi hotel dipilih sebagai entry point agar rekomendasi destinasi dan rute harian lebih kontekstual.',
                image: step1Image,
                imageAlt: 'Peta Jakarta dengan pin hotel sebagai titik awal perjalanan',
              },
              {
                title: 'AI membentuk cluster destinasi',
                desc: 'Sistem memproses preferensi wisata, menilai relevansi, akses transportasi, dan fasilitas sekitar untuk membentuk cluster.',
                image: step2Image,
              },
              {
                title: 'Susun itinerary siap pakai',
                desc: 'Destinasi dipilih per hari lalu sistem mengoptimalkan urutan perjalanan agar nyaman untuk diikuti.',
                image: step3Image,
              },
              {
                title: 'Rute lebih jelas dan terarah',
                desc: 'Perjalanan harian menjadi lebih praktis karena urutan destinasi dan konteks transportasi sudah dipertimbangkan.',
                image: step4Image,
              },
              {
                title: 'Mudah dipahami semua kalangan',
                desc: 'Flow dari preferensi hingga itinerary dirancang ringkas agar tetap nyaman dipakai untuk first-time traveler.',
                image: step5Image,
              },
            ].map((item, idx) => (
              <article
                key={item.title}
                className={`grid grid-cols-1 items-center gap-4 rounded-3xl bg-transparent p-4 sm:p-5 md:grid-cols-2 md:gap-7${idx === 0 ? ' landing-step-first' : ''}`}
              >
                <div className={`landing-step-media ${idx % 2 === 0 ? 'order-1' : 'order-2 md:order-1'}`}>
                  <Image
                    src={item.image}
                    alt={item.imageAlt ?? item.title}
                    width={1400}
                    height={800}
                    className="h-[220px] w-full object-contain sm:h-[260px] md:h-[280px]"
                  />
                </div>
                <div className={`landing-step-content ${idx % 2 === 0 ? 'order-2' : 'order-1 md:order-2'}`}>
                  <p className="inline-flex items-center gap-2 rounded-full bg-primary/12 px-3 py-1.5 text-sm font-bold text-primary sm:text-base">
                    <Sparkles className="h-3.5 w-3.5" />
                    Step {idx + 1}
                  </p>
                  <h3 className="mt-2 text-2xl font-bold leading-tight text-foreground sm:text-[28px]">{item.title}</h3>
                  <p className="mt-2 text-base leading-relaxed text-muted-foreground">{item.desc}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <CtaItinerarySection />
      </main>

      <footer className="border-t border-border bg-card/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>Wisata Jakarta AI © 2026</p>
          <p>Vector Similarity Search · Intelligent K-Means · Route Optimization</p>
        </div>
      </footer>
    </>
  )
}
