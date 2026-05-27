import { connectDB } from '@/lib/mongoose'
import mongoose from 'mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import CorporateAccount from '@/models/CorporateAccount'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRole } from '@/lib/apiAuth'
import { safeDecrypt } from '@/lib/crypto'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id')
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    const corporateAccountId = request.nextUrl.searchParams.get('corporateAccountId')
    const status = request.nextUrl.searchParams.get('status')
    const search = request.nextUrl.searchParams.get('search')

    const filter: Record<string, any> = {
      tenantId: tenant._id,
      orderMode: 'business',
    }

    if (corporateAccountId && mongoose.Types.ObjectId.isValid(corporateAccountId)) {
      filter.corporateAccountId = new mongoose.Types.ObjectId(corporateAccountId)
    }

    if (status) {
      filter.status = status
    }

    const rawOrders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()

    const orders = rawOrders.map((o: any) => ({
      ...o,
      customer: {
        ...o.customer,
        name: safeDecrypt(o.customer.name),
        phone: safeDecrypt(o.customer.phone),
        email: safeDecrypt(o.customer.email),
      },
    }))

    // Resolve corporate account names
    const accountIds = [...new Set(orders.map((o: any) => o.corporateAccountId?.toString()).filter(Boolean))]
    const accounts = accountIds.length > 0
      ? await CorporateAccount.find({ _id: { $in: accountIds } }).select('companyName').lean()
      : []
    const accountMap = Object.fromEntries(accounts.map(a => [a._id.toString(), (a as any).companyName]))

    const enriched = orders.map((o: any) => ({
      ...o,
      companyName: o.corporateAccountId ? accountMap[o.corporateAccountId.toString()] || '—' : '—',
    }))

    return NextResponse.json({ orders: enriched })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
