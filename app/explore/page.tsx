import type { Metadata } from 'next'
import ExploreClient from '@/components/explore/ExploreClient'

export const metadata: Metadata = {
  title: 'Explorar · TakeasyGO',
  description: 'Descubrí restaurantes takeaway cerca de vos — basado en disponibilidad real.',
}

export default function ExplorePage() {
  return (
    // Pantalla completa, sin scroll del body — el scroll es interno al listado
    <div className="h-screen w-screen overflow-hidden">
      <ExploreClient />
    </div>
  )
}
