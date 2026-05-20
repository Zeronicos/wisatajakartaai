'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, Compass, Sparkles, Target } from 'lucide-react'
import Navbar from '@/components/wisata/Navbar'
import heroImage from '@/image/hero.png'
import step1Image from '@/image/step_1.png'
import step2Image from '@/image/step_2.png'
import step3Image from '@/image/step_3.png'

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main className="relative min-h-screen overflow-hidden bg-background">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -left-28 top-10 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute right-0 top-40 h-72 w-72 rounded-full bg-secondary/10 blur-3xl" />
          <div className="absolute bottom-16 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
        </div>

        <section className="page-hero">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-6 px-4 py-8 sm:py-10 md:grid-cols-2 md:gap-8 md:py-12">
            <div className="wjai-fade-up text-left md:ml-auto md:max-w-xl md:text-right">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-primary-foreground">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                <span>Platform itinerary wisata modern untuk Jakarta</span>
              </div>
              <h1 className="text-3xl font-extrabold leading-tight text-primary-foreground sm:text-4xl">
                Rancang perjalanan Jakarta yang terasa premium, praktis, dan tetap mudah untuk pengguna awam
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-primary-foreground/80 sm:text-base">
                Dari titik hotel hingga itinerary harian, Wisata Jakarta AI membantu Anda membuat keputusan perjalanan
                yang lebih cepat, lebih relevan, dan lebih nyaman diikuti.
              </p>
              <div className="mt-5 flex flex-wrap items-left justify-left gap-2 md:justify-end">
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
            <div className="surface-card wjai-fade-up wjai-delay-1 overflow-hidden p-0">
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
          <div className="mb-6 text-center wjai-fade-up">
            <h2 className="text-xl font-bold text-foreground">Tujuan Aplikasi</h2>
            <p className="mt-1 text-sm text-muted-foreground">Sederhana, relevan, dan siap dipakai</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-3">
            <article className="wjai-hover-lift rounded-2xl border border-primary/20 bg-primary/10 p-5 text-center shadow-sm backdrop-blur-md sm:p-6">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Target className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-foreground">Mudah digunakan</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Alur jelas untuk pengguna awam.</p>
            </article>

            <article className="wjai-hover-lift rounded-2xl border border-primary/20 bg-primary/10 p-5 text-center shadow-sm backdrop-blur-md sm:p-6">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Compass className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-foreground">Rekomendasi relevan</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Sesuai preferensi dan konteks lokasi.</p>
            </article>

            <article className="wjai-hover-lift rounded-2xl border border-primary/20 bg-primary/10 p-5 text-center shadow-sm backdrop-blur-md sm:p-6">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-foreground">Siap untuk trip</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Hasil akhir berupa itinerary praktis.</p>
            </article>
          </div>
        </section>

        <section className="landing-section">
          <div className="mb-8 text-center wjai-fade-up">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Compass className="h-3.5 w-3.5" />
              Alur Penggunaan
            </div>
            <h2 className="mt-2 text-2xl font-extrabold text-foreground sm:text-3xl">Step-by-Step Proses</h2>
            <p className="mt-1 text-sm text-muted-foreground">Ikuti langkah terarah dari input preferensi hingga itinerary</p>
          </div>

          <div className="space-y-8 sm:space-y-10">
            {[
              {
                title: 'Step 1 - Tentukan titik awal hotel',
                desc: 'Pengguna memilih lokasi hotel sebagai entry point agar rekomendasi destinasi dan rute harian lebih kontekstual.',
                image: step1Image,
              },
              {
                title: 'Step 2 - AI membentuk cluster destinasi',
                desc: 'Sistem memproses preferensi wisata, menilai relevansi, akses transportasi, dan fasilitas sekitar untuk membentuk cluster.',
                image: step2Image,
              },
              {
                title: 'Step 3 - Susun itinerary siap pakai',
                desc: 'Pengguna memilih destinasi per hari lalu sistem mengoptimalkan urutan perjalanan agar nyaman untuk diikuti.',
                image: step3Image,
              },
            ].map((step, idx) => (
              <article
                key={step.title}
                className="rounded-2xl p-4 sm:p-5 md:p-6"
              >
                <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-2 md:gap-8">
                  <div className={idx === 1 ? 'order-2 md:order-2' : 'order-1 md:order-1'}>
                    <div className="text-center md:text-left">
                      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                        {idx + 1}
                      </div>
                      <h3 className="text-base font-bold text-foreground sm:text-lg">{step.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
                    </div>
                  </div>
                  <div className={idx === 1 ? 'order-1 md:order-1' : 'order-2 md:order-2'}>
                    <div className="relative mx-auto h-[220px] w-full max-w-[520px] overflow-hidden rounded-xl sm:h-[240px] md:h-[260px]">
                      <Image
                        src={step.image}
                        alt={step.title}
                        width={1200}
                        height={800}
                        className="block h-full w-full object-cover"
                      />
                    </div>
                  </div>
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
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>Wisata Jakarta AI © 2026</p>
          <p>Vector Similarity Search · Intelligent K-Means · Route Optimization</p>
        </div>
      </footer>
    </>
  )
}
