import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TGO — Takeaway cerca de vos',
    short_name: 'TGO',
    description: 'Descubrí restaurantes takeaway cerca de vos en tiempo real.',
    start_url: '/app',
    display: 'standalone',
    background_color: '#0d0b0a',
    theme_color: '#0d0b0a',
    orientation: 'portrait',
    icons: [
      {
        src: '/tgoicon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/tgoicon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
    screenshots: [
      {
        src: '/tgoicon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
    ],
  }
}
