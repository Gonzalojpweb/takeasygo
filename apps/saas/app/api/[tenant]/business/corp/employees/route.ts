import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import CorporateAccount from '@/models/CorporateAccount'
import { requireCorpAccess } from '@/lib/corpAuth'

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

    const authz = await requireCorpAccess(request, tenantSlug, { requireRole: 'admin' })
    if (!authz.ok) return authz.response
    const corpAccount = authz.access.account

    const body = await request.json()
    const rawEmails = body?.newEmployeeEmails

    if (!rawEmails || !Array.isArray(rawEmails) || rawEmails.length === 0) {
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

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
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
        _id: { $ne: corpAccount._id },
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
      { _id: corpAccount._id },
      { $addToSet: { employeeEmails: { $each: normalizedEmails } } }
    )

    const updated = await CorporateAccount.findById(corpAccount._id).lean()

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

    const authz = await requireCorpAccess(request, tenantSlug, { requireRole: 'admin' })
    if (!authz.ok) return authz.response

    return NextResponse.json({
      employees: authz.access.account.employeeEmails,
      companyAdminEmail: authz.access.account.companyAdminEmail,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
