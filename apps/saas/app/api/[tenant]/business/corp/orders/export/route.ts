import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import CorporateAccount from '@/models/CorporateAccount'
import { safeDecrypt } from '@/lib/crypto'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const corporateAccountId = searchParams.get('corporateAccountId')
    const email = searchParams.get('email')
    const periodStart = searchParams.get('periodStart')
    const periodEnd = searchParams.get('periodEnd')

    if (!corporateAccountId || !email) {
      return NextResponse.json({ error: 'Faltan parámetros de autenticación' }, { status: 400 })
    }

    const corpAccount = await CorporateAccount.findOne({
      _id: corporateAccountId,
      tenantId: tenant._id,
      status: 'active',
      companyAdminEmail: email.toLowerCase().trim(),
    }).lean()
    if (!corpAccount) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const filter: Record<string, any> = {
      tenantId: tenant._id,
      deletedAt: null,
      corporateAccountId: corpAccount._id,
      orderMode: 'business',
      status: { $ne: 'open' },
    }

    if (periodStart || periodEnd) {
      filter.createdAt = {}
      if (periodStart) filter.createdAt.$gte = new Date(periodStart)
      if (periodEnd) filter.createdAt.$lte = new Date(periodEnd)
    }

    const orders = await Order.find(filter).sort({ createdAt: -1 }).lean()

    // Build CSV rows (one row per item for detailed reconciliation)
    const header = 'Nro Pedido,Fecha,Hora,Modo,Item,Cantidad,Precio Unitario,Subtotal,Empleado,Total Orden,Estado Pago,Estado Pedido\n'
    const rows = orders.flatMap(o => {
      const date = o.createdAt ? new Date(o.createdAt).toISOString().split('T')[0] : ''
      const time = o.createdAt ? new Date(o.createdAt).toTimeString().slice(0, 5) : ''
      const mode = o.groupSessionToken ? 'Grupal' : 'Individual'
      const paymentStatus = o.payment?.status === 'approved' ? 'Pagado' : o.payment?.status === 'pending' ? 'Pendiente' : o.payment?.status || ''
      const orderStatus = o.status
      const customerName = safeDecrypt((o.customer as any)?.name || '')

      return (o.items as any[])?.map(item => {
        const empEmail = item.addedByEmail || customerName || ''
        return [
          o.orderNumber,
          date,
          time,
          mode,
          `"${item.name}"`,
          item.quantity,
          item.price,
          item.subtotal,
          empEmail,
          o.total,
          paymentStatus,
          orderStatus,
        ].join(',')
      }) ?? []
    }).join('\n')

    const csv = header + rows
    const safeName = corpAccount.companyName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50)
    const filename = `conciliacion-${safeName}-${new Date().toISOString().split('T')[0]}.csv`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
