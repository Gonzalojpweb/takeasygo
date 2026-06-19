import DeliveryInterface from '@/components/delivery/DeliveryInterface'

interface Props {
  params: Promise<{ tenant: string; token: string }>
}

export default function DeliveryPage({ params }: Props) {
  return <DeliveryInterface />
}
