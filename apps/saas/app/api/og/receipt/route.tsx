import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import { verifyRatingToken } from '@/lib/rating-token'
import { safeDecrypt } from '@/lib/crypto'
import { NextRequest, NextResponse } from 'next/server'
import { ImageResponse } from 'next/og'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get('orderId')
    const token = searchParams.get('token')
    const tenantSlug = searchParams.get('tenantSlug')

    if (!orderId || !token || !tenantSlug) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
    }

    if (!verifyRatingToken(orderId, token)) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 403 })
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id }).lean() as any
    if (!order) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
    }

    const customerName = safeDecrypt(order.customer?.name) || 'Cliente'
    const items = (order.items || []).map((i: any) => ({
      name: i.name,
      quantity: i.quantity,
      subtotal: i.subtotal,
    }))
    const total = order.total || 0
    const tenantName = tenant.name || ''

    return new ImageResponse(
      (
        <div
          style={{
            width: 600,
            height: 800,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#0f172a',
            color: '#f8fafc',
            fontFamily: 'system-ui, sans-serif',
            padding: '48px 40px',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 36 }}>🔥</span>
          </div>
          <p style={{ fontSize: 28, fontWeight: 800, textAlign: 'center', margin: '0 0 4px 0', color: '#facc15' }}>
            {customerName} bancó a
          </p>
          <p style={{ fontSize: 32, fontWeight: 900, textAlign: 'center', margin: '0 0 24px 0', color: '#ffffff' }}>
            {tenantName} hoy
          </p>

          {/* Divider */}
          <div style={{ width: '100%', height: 2, backgroundColor: '#334155', marginBottom: 24 }} />

          {/* Items */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map((item: any, i: number) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 18,
                  borderBottom: '1px solid #1e293b',
                  paddingBottom: 8,
                }}
              >
                <span style={{ color: '#94a3b8' }}>
                  {item.quantity}x {item.name}
                </span>
                <span style={{ fontWeight: 600 }}>
                  ${item.subtotal.toLocaleString('es-AR')}
                </span>
              </div>
            ))}
          </div>

          {/* Total */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 24,
              fontWeight: 900,
              marginTop: 16,
              paddingTop: 16,
              borderTop: '2px solid #facc15',
              color: '#facc15',
            }}
          >
            <span>Total</span>
            <span>${total.toLocaleString('es-AR')}</span>
          </div>

          {/* Footer */}
          <div style={{ marginTop: 32, textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
              Pedido vía TakeasyGo · {tenantName}
            </p>
          </div>
        </div>
      ),
      { width: 600, height: 800 }
    )
  } catch (error) {
    console.error('OG receipt error:', error)
    return NextResponse.json({ error: 'Error generando imagen' }, { status: 500 })
  }
}
