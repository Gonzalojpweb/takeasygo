import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import CorporateAccount from '@/models/CorporateAccount'

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
      status: { $nin: ['open', 'cancelled'] },
    }

    if (periodStart || periodEnd) {
      filter.createdAt = {}
      if (periodStart) filter.createdAt.$gte = new Date(periodStart)
      if (periodEnd) filter.createdAt.$lte = new Date(periodEnd)
    }

    const orders = await Order.find(filter).sort({ createdAt: -1 }).lean()

    let totalConsumed = 0
    let totalPending = 0
    const byEmployee: Record<string, { count: number; total: number }> = {}
    const byMode = { individual: { count: 0, total: 0 }, group: { count: 0, total: 0 } }

    for (const order of orders) {
      if (order.status === 'cancelled') continue
      totalConsumed += order.total

      if (order.payment?.status !== 'approved') {
        totalPending += order.total
      }

      const isGroup = !!order.groupSessionToken
      if (isGroup) {
        byMode.group.count++
        byMode.group.total += order.total
      } else {
        byMode.individual.count++
        byMode.individual.total += order.total
      }

      // Aggregate by employee
      for (const item of (order.items as any[]) || []) {
        const empEmail = item.addedByEmail || 'unknown'
        if (!byEmployee[empEmail]) byEmployee[empEmail] = { count: 0, total: 0 }
        byEmployee[empEmail].count += item.quantity || 1
        byEmployee[empEmail].total += item.subtotal || 0
      }
    }

    return NextResponse.json({
      summary: {
        totalConsumed,
        totalOrders: orders.length,
        totalPending,
        byEmployee,
        byMode,
        periodStart: periodStart || null,
        periodEnd: periodEnd || null,
      }
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
