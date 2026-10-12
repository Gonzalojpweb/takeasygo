import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import { requireCorpAccess } from '@/lib/corpAuth'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; email: string }> }
) {
  try {
    const { tenant: tenantSlug, email: employeeEmailToRemove } = await params
    await connectDB()

    const authz = await requireCorpAccess(request, tenantSlug, { requireRole: 'admin' })
    if (!authz.ok) return authz.response
    const corpAccount = authz.access.account

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
