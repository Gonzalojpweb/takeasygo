import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // geolocation=(self) permite que nuestras propias páginas (/explore) pidan GPS al usuario
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=()' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sdk.mercadopago.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://res.cloudinary.com https://api.dicebear.com https://images.unsplash.com https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com",
      "media-src 'self' https://res.cloudinary.com",
      "font-src 'self'",
      "connect-src 'self' https://api.mercadopago.com https://api.cloudinary.com https://res.cloudinary.com https://api.mymemory.translated.net https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com",
      "worker-src 'self'",
      "frame-src https://www.mercadopago.com https://www.mercadopago.com.ar",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/app',
        destination: '/explore',
        permanent: true,
      },
    ]
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      // CORS: las rutas de API admin sólo aceptan requests del mismo origen
      {
        source: '/api/:tenant/settings/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,PATCH,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
      {
        source: '/api/:tenant/users/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,PATCH,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
      {
        source: '/api/:tenant/analytics/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ]
  },
}

export default nextConfig
