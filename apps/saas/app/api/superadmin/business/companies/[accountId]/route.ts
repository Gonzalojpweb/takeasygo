import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import CorporateAccount from '@/models/CorporateAccount'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { accountId } = await params
    await connectDB()

    const account = await CorporateAccount.findById(accountId).lean()
    if (!account) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
    }

    const tenant = await Tenant.findById(account.tenantId).select('name slug').lean()

    return NextResponse.json({
      company: {
        ...account,
        _id: account._id.toString(),
        tenantId: account.tenantId.toString(),
        tenantName: tenant?.name ?? '',
        tenantSlug: tenant?.slug ?? '',
        createdAt: account.createdAt?.toISOString?.() ?? account.createdAt,
        updatedAt: account.updatedAt?.toISOString?.() ?? account.updatedAt,
      }
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { accountId } = await params
    await connectDB()

    const account = await CorporateAccount.findById(accountId)
    if (!account) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
    }

    const body = await request.json()

    if (body.companyName !== undefined) account.companyName = body.companyName.trim()
    if (body.companyTaxId !== undefined) account.companyTaxId = body.companyTaxId.trim()
    if (body.paymentMode !== undefined) account.paymentMode = body.paymentMode
    if (body.paymentTerms !== undefined) account.paymentTerms = body.paymentTerms.trim()
    if (body.status !== undefined) account.status = body.status
    if (body.notes !== undefined) account.notes = body.notes.trim()

    if (body.tenantId !== undefined) {
      const tenant = await Tenant.findOne({ _id: body.tenantId, isActive: true }).lean()
      if (!tenant) {
        return NextResponse.json({ error: 'Tenant no encontrado o inactivo' }, { status: 404 })
      }
      account.tenantId = body.tenantId
    }

    if (Array.isArray(body.addEmployeeEmails)) {
      const newEmails = body.addEmployeeEmails
        .map((e: string) => e.trim().toLowerCase())
        .filter((e: string) => e && !account.employeeEmails.includes(e))
      for (const empEmail of newEmails) {
        const conflict = await CorporateAccount.findOne({
          _id: { $ne: accountId },
          tenantId: account.tenantId,
          $or: [
            { companyAdminEmail: empEmail },
            { employeeEmails: empEmail },
          ],
        })
        if (conflict) {
          return NextResponse.json(
            { error: `El email ${empEmail} ya está registrado en otra empresa` },
            { status: 409 }
          )
        }
      }
      account.employeeEmails = [...account.employeeEmails, ...newEmails]
    }

    if (Array.isArray(body.removeEmployeeEmails)) {
      const toRemove = body.removeEmployeeEmails.map((e: string) => e.trim().toLowerCase())
      account.employeeEmails = account.employeeEmails.filter((e: string) => !toRemove.includes(e))
    }

    await account.save()

    const tenant = await Tenant.findById(account.tenantId).select('name slug').lean()

    const enriched = {
      ...account.toObject(),
      _id: account._id.toString(),
      tenantId: account.tenantId.toString(),
      tenantName: tenant?.name ?? '',
      tenantSlug: tenant?.slug ?? '',
      createdAt: account.createdAt?.toISOString?.() ?? account.createdAt,
      updatedAt: account.updatedAt?.toISOString?.() ?? account.updatedAt,
    }

    return NextResponse.json({ company: enriched })
  } catch (error: any) {
    if (error?.code === 11000) {
      return NextResponse.json({ error: 'Conflicto de email único' }, { status: 409 })
    }
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { accountId } = await params
    await connectDB()

    const account = await CorporateAccount.findByIdAndDelete(accountId)
    if (!account) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
    }

    return NextResponse.json({ message: 'Empresa eliminada' })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
