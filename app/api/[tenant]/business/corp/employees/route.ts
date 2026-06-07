import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import CorporateAccount from '@/models/CorporateAccount'

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export async function POST(
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

    const body = await request.json()
    const corporateAccountId = body?.corporateAccountId
    const adminEmail = body?.email
    const newEmployeeEmail = body?.newEmployeeEmail

    if (!corporateAccountId || !adminEmail || !newEmployeeEmail) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
    }

    const normalizedEmail = newEmployeeEmail.trim().toLowerCase()
    if (!isValidEmail(normalizedEmail)) {
      return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
    }

    // Only the company admin can add employees
    const corpAccount = await CorporateAccount.findOne({
      _id: corporateAccountId,
      tenantId: tenant._id,
      status: 'active',
      companyAdminEmail: adminEmail.toLowerCase().trim(),
    })
    if (!corpAccount) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    // Can't add the company admin email itself
    if (normalizedEmail === corpAccount.companyAdminEmail.toLowerCase()) {
      return NextResponse.json({ error: 'El email del administrador no puede agregarse como empleado' }, { status: 400 })
    }

    // Check if already in the list
    if (corpAccount.employeeEmails.some(e => e.toLowerCase() === normalizedEmail)) {
      return NextResponse.json({ error: 'El email ya está registrado como empleado' }, { status: 409 })
    }

    // Check for conflict with other companies in the same tenant
    const conflict = await CorporateAccount.findOne({
      _id: { $ne: corporateAccountId },
      tenantId: tenant._id,
      $or: [
        { companyAdminEmail: normalizedEmail },
        { employeeEmails: normalizedEmail },
      ],
    })
    if (conflict) {
      return NextResponse.json(
        { error: `El email ${normalizedEmail} ya está registrado en otra empresa` },
        { status: 409 }
      )
    }

    await CorporateAccount.updateOne(
      { _id: corporateAccountId },
      { $addToSet: { employeeEmails: normalizedEmail } }
    )

    const updated = await CorporateAccount.findById(corporateAccountId).lean()

    return NextResponse.json({
      message: 'Empleado agregado',
      employees: updated?.employeeEmails || [],
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

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
