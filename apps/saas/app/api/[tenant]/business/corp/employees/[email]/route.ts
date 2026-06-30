import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import CorporateAccount from '@/models/CorporateAccount'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; email: string }> }
) {
  try {
    const { tenant: tenantSlug, email: employeeEmailToRemove } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const body = await request.json()
    const corporateAccountId = body?.corporateAccountId
    const adminEmail = body?.email

    if (!corporateAccountId || !adminEmail) {
      return NextResponse.json({ error: 'Faltan parámetros de autenticación' }, { status: 400 })
    }

    // Server-side validation: only companyAdmin can remove employees
    const corpAccount = await CorporateAccount.findOne({
      _id: corporateAccountId,
      tenantId: tenant._id,
      status: 'active',
      companyAdminEmail: adminEmail.toLowerCase().trim(),
    })
    if (!corpAccount) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const normalizedEmail = decodeURIComponent(employeeEmailToRemove).toLowerCase().trim()

    // Can't remove the company admin email itself
    if (normalizedEmail === corpAccount.companyAdminEmail.toLowerCase()) {
      return NextResponse.json({ error: 'No podés eliminar el email corporativo' }, { status: 400 })
    }

    // Check if email exists in employee list
    const emailExists = corpAccount.employeeEmails.some(e => e.toLowerCase() === normalizedEmail)
    if (!emailExists) {
      return NextResponse.json({ error: 'Email no encontrado en la lista de empleados' }, { status: 404 })
    }

    corpAccount.employeeEmails = corpAccount.employeeEmails.filter(e => e.toLowerCase() !== normalizedEmail)
    await corpAccount.save()

    return NextResponse.json({
      message: 'Empleado eliminado',
      employees: corpAccount.employeeEmails,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
