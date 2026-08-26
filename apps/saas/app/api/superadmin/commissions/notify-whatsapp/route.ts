import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { sendWhatsApp } from '@/lib/whatsapp'
import { auth } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'superadmin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    await connectDB()

    const body = await request.json()
    const { tenantId } = body

    let query: any = { 'commissionBalance.transfer': { $gt: 0 } }
    if (tenantId) {
      query._id = tenantId
    }

    const tenants = await Tenant.find(query).lean()

    if (tenants.length === 0) {
      return NextResponse.json({ message: 'No hay tenants con comisiones pendientes', sent: 0 })
    }

    const results: Array<{ tenant: string; sent: boolean; error?: string }> = []

    for (const tenant of tenants) {
      const phone = (tenant as any).notifications?.whatsappPhone
      if (!phone) {
        results.push({ tenant: tenant.name, sent: false, error: 'Sin teléfono configurado' })
        continue
      }

      const balance = (tenant as any).commissionBalance?.transfer || 0
      const balanceDisplay = (balance / 100).toFixed(2)

      const now = new Date()
      const billingDate = new Date(now)
      billingDate.setDate(billingDate.getDate() + 7)

      const message = `Hola ${tenant.name} 👋

Tenés comisiones pendientes por pago por transferencia.

💰 *Saldo acumulado:* $${balanceDisplay} USD
📅 *Fecha de facturación:* ${billingDate.toLocaleDateString('es-AR')}

💳 *Métodos de pago:*
• *MercadoPago:* takeasygo (Titular: Gonzalo Palomo)
• *Transferencia bancaria:* Contactá al superadmin para datos de cuenta

Ingresá al panel de comisiones para gestionar el pago.

Si ya pagaste, podés confirmar desde el panel.

— TakeasyGO`

      try {
        await sendWhatsApp(phone, message)
        results.push({ tenant: tenant.name, sent: true })
      } catch (err) {
        results.push({ tenant: tenant.name, sent: false, error: String(err) })
      }
    }

    return NextResponse.json({
      message: `Notificaciones enviadas a ${results.filter(r => r.sent).length} de ${results.length} tenants`,
      results,
    })
  } catch (error) {
    console.error('[superadmin/commissions/notify-whatsapp]', error)
    return NextResponse.json({ error: 'Error al enviar notificaciones' }, { status: 500 })
  }
}
