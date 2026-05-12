/** Origin FastAPI untuk rewrite (permintaan browser → Next → backend; hindari blokir / CORS ke port 8000). */
const backendInternal =
  process.env.BACKEND_INTERNAL_URL?.replace(/\/+$/, "") || "http://127.0.0.1:8000"

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
