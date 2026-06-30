import CheckoutLayout from '@/components/checkout/CheckoutLayout'

interface Props {
  params: Promise<{ tenant: string; locationId: string }>
}

export default async function DeliveryCheckoutPage({ params }: Props) {
  const { tenant: tenantSlug, locationId } = await params

  return (
    <CheckoutLayout
      tenantSlug={tenantSlug}
      locationId={locationId}
      mode="delivery"
    />
  )
}
