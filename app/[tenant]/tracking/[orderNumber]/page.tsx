import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import { notFound } from 'next/navigation'

interface Props {
  params: Promise<{ tenant: string; orderNumber: string }>
}

const STATUS_STEPS = ['pending', 'confirmed', 'preparing', 'ready', 'delivered']

const STATUS_INFO: Record<string, { label: string; description: string; emoji: string }> = {
  pending:   { label: 'Recibido',     description: 'Tu pedido fue recibido y está esperando confirmación', emoji: '📋' },
  confirmed: { label: 'Confirmado',   description: 'El restaurante confirmó tu pedido', emoji: '✅' },
  preparing: { label: 'Preparando',   description: 'Tu pedido está siendo preparado', emoji: '👨‍🍳' },
  ready:     { label: 'Listo',        description: 'Tu pedido está listo para retirar', emoji: '🎉' },
  delivered: { label: 'Entregado',    description: 'Pedido entregado. ¡Buen provecho!', emoji: '🍽️' },
  cancelled: { label: 'Cancelado',    description: 'El pedido fue cancelado', emoji: '❌' },
}

export default async function TrackingPage({ params }: Props) {
  const { tenant: tenantSlug, orderNumber } = await params

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
  if (!tenant) notFound()

  const order = await Order.findOne({ orderNumber, tenantId: tenant._id }).lean() as any
  if (!order) notFound()

  const branding = tenant.branding
  const currentStatus = STATUS_INFO[order.status]
  const currentStep = STATUS_STEPS.indexOf(order.status)

  return (
    <div className="min-h-screen" style={{ backgroundColor: branding.backgroundColor, color: branding.textColor }}>

      {/* Header */}
      <header className="border-b px-4 py-4"
        style={{ borderColor: branding.primaryColor + '20' }}>
        <div className="max-w-md mx-auto flex items-center justify-between">
          {branding.logoUrl
            ? <img src={branding.logoUrl} alt={tenant.name} className="h-8 object-contain" />
            : <span className="font-bold" style={{ color: branding.primaryColor }}>{tenant.name}</span>
          }
          <span className="text-xs opacity-40">#{order.orderNumber}</span>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-8">

        {/* Status principal */}
        <div className="text-center mb-10">
          <div className="text-6xl mb-4">{currentStatus.emoji}</div>
          <h1 className="text-2xl font-black mb-2">{currentStatus.label}</h1>
          <p className="text-sm opacity-60">{currentStatus.description}</p>
        </div>

        {/* Progress bar */}
        {order.status !== 'cancelled' && (
          <div className="mb-10">
            <div className="flex items-center justify-between mb-2">
              {STATUS_STEPS.map((step, index) => (
                <div key={step} className="flex flex-col items-center gap-1">
                  <div
                    className="w-3 h-3 rounded-full transition-all"
                    style={{
                      backgroundColor: index <= currentStep
                        ? branding.primaryColor
                        : branding.primaryColor + '30'
                    }}
                  />
                  <span className="text-xs opacity-50 hidden sm:block">
                    {STATUS_INFO[step].label}
                  </span>
                </div>
              ))}
            </div>
            <div className="h-1 rounded-full w-full" style={{ backgroundColor: branding.primaryColor + '20' }}>
              <div
                className="h-1 rounded-full transition-all duration-500"
                style={{
                  backgroundColor: branding.primaryColor,
                  width: `${(currentStep / (STATUS_STEPS.length - 1)) * 100}%`
                }}
              />
            </div>
          </div>
        )}

        {/* Resumen del pedido */}
        <div className="rounded-2xl p-4 mb-6"
          style={{ backgroundColor: branding.primaryColor + '08', border: `1px solid ${branding.primaryColor}20` }}>
          <h2 className="font-semibold text-sm opacity-50 uppercase tracking-wide mb-3">Tu pedido</h2>
          <div className="space-y-2">
            {order.items.map((item: any) => (
              <div key={item._id} className="flex justify-between text-sm">
                <span className="opacity-80">{item.quantity}x {item.name}</span>
                <span className="font-medium">${item.subtotal.toLocaleString('es-AR')}</span>
              </div>
            ))}
          </div>
          <div className="border-t mt-3 pt-3 flex justify-between font-bold"
            style={{ borderColor: branding.primaryColor + '20' }}>
            <span>Total</span>
            <span style={{ color: branding.primaryColor }}>${order.total.toLocaleString('es-AR')}</span>
          </div>
        </div>

        {/* Cliente */}
        <p className="text-center text-sm opacity-40">
          Pedido para {order.customer.name}
        </p>

      </main>
    </div>
  )
}