import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TakeasyGO — Takeaway cerca de vos',
    short_name: 'TakeasyGO',
    description: 'Descubrí restaurantes takeaway cerca de vos en tiempo real.',
    start_url: '/explore',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#10b981',
    orientation: 'portrait',
    icons: [
      {
        src: '/tgo192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/real512.jpg',
        sizes: '512x512',
        type: 'image/jpeg',
        purpose: 'any',
      },
    ],
    screenshots: [
      {
        src: '/tgo192.png',
        sizes: '192x192',
        type: 'image/png',
      },
    ],
  }
}
