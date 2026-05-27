import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import CorporateAccount from '@/models/CorporateAccount'

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { tenant: tenantSlug } = await params
    const { email } = await request.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email requerido' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    if (!tenant.business?.enabled) {
      return NextResponse.json({ error: 'Business no habilitado en este tenant' }, { status: 403 })
    }

    const account = await CorporateAccount.findOne({
      tenantId: tenant._id,
      status: 'active',
      $or: [
        { companyAdminEmail: normalizedEmail },
        { employeeEmails: normalizedEmail },
      ],
    }).lean()

    if (!account) {
      return NextResponse.json({ error: 'Email no registrado en ninguna empresa' }, { status: 404 })
    }

    const isCompanyAdmin = account.companyAdminEmail === normalizedEmail

    return NextResponse.json({
      verified: true,
      role: isCompanyAdmin ? 'company_admin' : 'employee',
      corporateAccountId: account._id.toString(),
      corporateAccountEmail: account.companyAdminEmail,
      companyName: account.companyName,
      paymentMode: account.paymentMode,
      isCompanyAdmin,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Error al verificar email' }, { status: 500 })
  }
}
