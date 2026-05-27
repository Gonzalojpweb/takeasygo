import { connectDB } from '@/lib/mongoose'
import mongoose from 'mongoose'
import Tenant from '@/models/Tenant'
import CorporateAccount from '@/models/CorporateAccount'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRole } from '@/lib/apiAuth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; accountId: string }> }
) {
  try {
    const { tenant: tenantSlug, accountId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id')
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    if (!mongoose.Types.ObjectId.isValid(accountId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const company = await CorporateAccount.findOne({ _id: accountId, tenantId: tenant._id }).lean()
    if (!company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

    return NextResponse.json({ company })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; accountId: string }> }
) {
  try {
    const { tenant: tenantSlug, accountId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id')
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    if (!mongoose.Types.ObjectId.isValid(accountId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const existing = await CorporateAccount.findOne({ _id: accountId, tenantId: tenant._id })
    if (!existing) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

    const body = await request.json()

    // Solo campos editables por el admin del tenant
    const updates: Record<string, any> = {}

    if (body.companyName !== undefined) updates.companyName = body.companyName.trim()
    if (body.companyTaxId !== undefined) updates.companyTaxId = body.companyTaxId.trim()
    if (body.paymentMode !== undefined) updates.paymentMode = body.paymentMode
    if (body.paymentTerms !== undefined) updates.paymentTerms = body.paymentTerms.trim()
    if (body.status !== undefined) updates.status = body.status
    if (body.notes !== undefined) updates.notes = body.notes.trim()

    // Agregar empleados individuales (nuevos emails)
    if (body.addEmployeeEmails && Array.isArray(body.addEmployeeEmails)) {
      const newEmails = body.addEmployeeEmails
        .map((e: string) => e.trim().toLowerCase())
        .filter((e: string) => e)

      for (const email of newEmails) {
        if (email === existing.companyAdminEmail) continue
        if (existing.employeeEmails.includes(email)) continue

        const conflict = await CorporateAccount.findOne({
          _id: { $ne: accountId },
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
        { _id: accountId },
        { $addToSet: { employeeEmails: { $each: newEmails } } }
      )
    }

    // Eliminar empleados
    if (body.removeEmployeeEmails && Array.isArray(body.removeEmployeeEmails)) {
      const removeEmails = body.removeEmployeeEmails
        .map((e: string) => e.trim().toLowerCase())
        .filter((e: string) => e)

      await CorporateAccount.updateOne(
        { _id: accountId },
        { $pullAll: { employeeEmails: removeEmails } }
      )
    }

    if (Object.keys(updates).length > 0) {
      await CorporateAccount.updateOne(
        { _id: accountId },
        { $set: updates }
      )
    }

    const updated = await CorporateAccount.findById(accountId).lean()

    return NextResponse.json({ company: updated })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; accountId: string }> }
) {
  try {
    const { tenant: tenantSlug, accountId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id')
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    if (!mongoose.Types.ObjectId.isValid(accountId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const deleted = await CorporateAccount.findOneAndDelete({ _id: accountId, tenantId: tenant._id })
    if (!deleted) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
