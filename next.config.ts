import type { NextConfig } from "next";

const securityHeaders = [
  // Previene que la página sea embebida en iframes (clickjacking)
  { key: 'X-Frame-Options', value: 'DENY' },
  // Evita MIME-type sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Limita la información del Referer
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Deshabilita APIs de hardware no usadas
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  // XSS protection para navegadores legacy
  { key: 'X-XSS-Protection', value: '1; mode=block' },
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig;
