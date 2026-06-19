import type { Metadata } from 'next'
import ExploreClient from '@/components/explore/ExploreClient'
import DeliveryRedirectHandler from '@/components/delivery/DeliveryRedirectHandler'

export const metadata: Metadata = {
  title: 'Explorar · TGO',
  description: 'Descubrí restaurantes takeaway cerca de vos — basado en disponibilidad real.',
}

export default function ExplorePage() {
  return (
    <DeliveryRedirectHandler>
      <div className="h-screen w-screen overflow-hidden">
        <ExploreClient />
      </div>
    </DeliveryRedirectHandler>
  )
}
