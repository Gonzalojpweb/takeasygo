import type { Metadata } from 'next'
import { Suspense } from 'react'
import BeneficiosClient from './BeneficiosClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Mis beneficios · TGO',
  description: 'Beneficios de la red TakeasyGO para usar en otros comercios.',
}

export default function BeneficiosPage() {
  return (
    <Suspense fallback={null}>
      <BeneficiosClient />
    </Suspense>
  )
}
