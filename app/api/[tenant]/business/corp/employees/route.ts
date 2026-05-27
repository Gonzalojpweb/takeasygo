import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
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

    return NextResponse.json({
      employees: corpAccount.employeeEmails,
      companyAdminEmail: corpAccount.companyAdminEmail,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
