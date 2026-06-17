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
    const employeeEmail = searchParams.get('employeeEmail')
    const paymentStatus = searchParams.get('paymentStatus')
    const mode = searchParams.get('mode')

    if (!corporateAccountId || !email) {
      return NextResponse.json({ error: 'Faltan parámetros de autenticación' }, { status: 400 })
    }

    // Server-side validation: email must be companyAdminEmail of an active account
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

    if (employeeEmail) {
      filter['items.addedByEmail'] = employeeEmail.toLowerCase().trim()
    }

    if (paymentStatus) {
      filter['payment.status'] = paymentStatus
    }

    if (mode === 'individual') {
      filter.groupSessionToken = null
    } else if (mode === 'group') {
      filter.groupSessionToken = { $ne: null }
    }

    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(100).lean()

    const sanitized = orders.map(o => ({
      _id: o._id.toString(),
      orderNumber: o.orderNumber,
      status: o.status,
      createdAt: o.createdAt?.toISOString?.() ?? o.createdAt,
      total: o.total,
      subtotal: o.subtotal,
      paymentModeSnapshot: o.paymentModeSnapshot,
      paymentStatus: o.payment?.status,
      groupSessionToken: o.groupSessionToken,
      items: (o.items as any[])?.map(i => ({
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        subtotal: i.subtotal,
        addedByEmail: i.addedByEmail,
        selectedVariant: i.selectedVariant ? { name: i.selectedVariant.name } : null,
      })) ?? [],
      customer: {
        name: safeDecrypt((o.customer as any).name),
        email: safeDecrypt((o.customer as any).email),
      },
    }))

    return NextResponse.json({ orders: sanitized, totalOrders: sanitized.length })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
