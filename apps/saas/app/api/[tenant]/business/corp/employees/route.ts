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
    const rawEmails = body?.newEmployeeEmails

    if (!corporateAccountId || !adminEmail || !rawEmails || !Array.isArray(rawEmails) || rawEmails.length === 0) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
    }

    const normalizedEmails = rawEmails
      .map((e: string) => e.trim().toLowerCase())
      .filter((e: string) => e)

    if (normalizedEmails.length === 0) {
      return NextResponse.json({ error: 'No hay emails válidos' }, { status: 400 })
    }

    // Validate email format
    for (const email of normalizedEmails) {
      if (!isValidEmail(email)) {
        return NextResponse.json({ error: `Email inválido: ${email}` }, { status: 400 })
      }
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

    // Validate all emails before inserting
    for (const email of normalizedEmails) {
      // Can't add the company admin email itself
      if (email === corpAccount.companyAdminEmail.toLowerCase()) {
        return NextResponse.json(
          { error: `El email del administrador no puede agregarse como empleado: ${email}` },
          { status: 400 }
        )
      }

      // Check if already in the list
      if (corpAccount.employeeEmails.some(e => e.toLowerCase() === email)) {
        return NextResponse.json(
          { error: `El email ya está registrado como empleado: ${email}` },
          { status: 409 }
        )
      }

      // Check for conflict with other companies in the same tenant
      const conflict = await CorporateAccount.findOne({
        _id: { $ne: corporateAccountId },
        tenantId: tenant._id,
        $or: [
          { companyAdminEmail: email },
          { employeeEmails: email },
        ],
      })
      if (conflict) {
        return NextResponse.json(
          { error: `El email ${email} ya está registrado en otra empresa` },
          { status: 409 }
        )
      }
    }

    await CorporateAccount.updateOne(
      { _id: corporateAccountId },
      { $addToSet: { employeeEmails: { $each: normalizedEmails } } }
    )

    const updated = await CorporateAccount.findById(corporateAccountId).lean()

    const addedCount = normalizedEmails.length
    return NextResponse.json({
      message: addedCount === 1 ? 'Empleado agregado' : `${addedCount} empleados agregados`,
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
