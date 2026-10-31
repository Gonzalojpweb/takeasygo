import CheckoutForm from '@/components/menu/CheckoutForm'
import { resolveMenuLocation } from '@/lib/menu/resolve-location'

interface Props {
  params: Promise<{ tenant: string; locationId: string }>
}

export default async function BusinessCheckoutPage({ params }: Props) {
  const { tenant: tenantSlug, locationId: locationRef } = await params
  const { locationId } = await resolveMenuLocation(tenantSlug, locationRef)

  return (
    <CheckoutForm
      tenantSlug={tenantSlug}
      locationId={locationId}
      mode="business"
    />
  )
}
