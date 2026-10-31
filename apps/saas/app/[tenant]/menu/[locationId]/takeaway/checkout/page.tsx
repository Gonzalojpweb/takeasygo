import CheckoutLayout from '@/components/checkout/CheckoutLayout'
import { resolveMenuLocation } from '@/lib/menu/resolve-location'

interface Props {
  params: Promise<{ tenant: string; locationId: string }>
}

export default async function CheckoutPage({ params }: Props) {
  const { tenant: tenantSlug, locationId: locationRef } = await params
  const { locationId, locationPath } = await resolveMenuLocation(tenantSlug, locationRef)

  return (
    <CheckoutLayout
      tenantSlug={tenantSlug}
      locationId={locationId}
      locationPath={locationPath}
      mode="takeaway"
    />
  )
}
