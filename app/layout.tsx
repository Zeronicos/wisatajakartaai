import type { Metadata } from "next"
import { Inter } from "next/font/google"
import type { ReactNode } from "react"
import "../globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

export const metadata: Metadata = {
  title: "Wisata Jakarta AI - Sistem Rekomendasi Perjalanan",
  description:
    "Sistem Rekomendasi Perjalanan Wisata DKI Jakarta menggunakan Vector Similarity Search dan Intelligent K-Means",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning className={inter.variable}>
      <body suppressHydrationWarning className="font-sans antialiased bg-background text-foreground">
        {children}
      </body>
    </html>
  )
}
