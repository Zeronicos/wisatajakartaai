import type { Metadata } from 'next'
import { Inter, Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'

const _inter = Inter({ subsets: ['latin'], variable: '--font-sans' })
const _plusJakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-heading' })

export const metadata: Metadata = {
  title: 'Wisata Jakarta AI - Sistem Rekomendasi Perjalanan',
  description:
    'Sistem Rekomendasi Perjalanan Wisata DKI Jakarta menggunakan Vector Similarity Search dan Intelligent K-Means',
  keywords: ['wisata', 'jakarta', 'rekomendasi', 'AI', 'tourism'],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body suppressHydrationWarning className="font-sans antialiased bg-background text-foreground">
        {children}
      </body>
    </html>
  )
}
