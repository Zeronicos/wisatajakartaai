/** Origin FastAPI untuk rewrite (browser → Next/Vercel → backend; hindari CORS cross-origin). */
function resolveBackendInternalUrl() {
  const explicit = process.env.BACKEND_INTERNAL_URL?.trim().replace(/\/+$/, "")
  if (explicit) return explicit

  const publicApi = process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, "") || ""
  if (publicApi) {
    const lower = publicApi.toLowerCase()
    if (lower.endsWith("/api")) return publicApi.slice(0, -4)
    return publicApi
  }

  return "http://127.0.0.1:8000"
}

const backendInternal = resolveBackendInternalUrl()

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/__wisata_api/:path*",
        destination: `${backendInternal}/api/:path*`,
      },
    ]
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          "**/.next/**",
          "**/node_modules/**",
          "**/.git/**",
          "**/backend/**",
          "**/*.py",
          "**/routers/**",
          "**/services/**",
          "**/data_preprocessing/**",
        ],
      }
    }

    return config
  },
}

export default nextConfig
