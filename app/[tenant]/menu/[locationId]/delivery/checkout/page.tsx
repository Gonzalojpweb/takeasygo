import CheckoutForm from '@/components/menu/CheckoutForm'

interface Props {
  params: Promise<{ tenant: string; locationId: string }>
}

export default async function DeliveryCheckoutPage({ params }: Props) {
  const { tenant: tenantSlug, locationId } = await params

  return (
    <CheckoutForm
      tenantSlug={tenantSlug}
      locationId={locationId}
      mode="delivery"
    />
  )
}
