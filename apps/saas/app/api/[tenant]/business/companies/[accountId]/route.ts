import { connectDB } from '@/lib/mongoose'
import mongoose from 'mongoose'
import Tenant from '@/models/Tenant'
import CorporateAccount from '@/models/CorporateAccount'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRole } from '@/lib/apiAuth'
import { corporateHasAccess } from '@/lib/corporateAccess'

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

    const company = await CorporateAccount.findOne({ _id: accountId }).lean()
    if (!company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

    if (!corporateHasAccess(company, tenant._id)) {
      return NextResponse.json({ error: 'Empresa no encontrada en este tenant' }, { status: 404 })
    }

    return NextResponse.json({
      company: {
        ...company,
        _id: company._id.toString(),
        tenantIds: company.tenantIds.map(id => id.toString()),
        tenantSettings: company.tenantSettings.map(ts => ({
          ...ts,
          tenantId: ts.tenantId.toString(),
        })),
      }
    })
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

    const account = await CorporateAccount.findOne({ _id: accountId })
    if (!account) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

    if (!corporateHasAccess(account, tenant._id)) {
      return NextResponse.json({ error: 'Empresa no encontrada en este tenant' }, { status: 404 })
    }

    const body = await request.json()

    const updates: Record<string, any> = {}
    if (body.companyName !== undefined) updates.companyName = body.companyName.trim()
    if (body.companyTaxId !== undefined) updates.companyTaxId = body.companyTaxId.trim()
    if (body.status !== undefined) updates.status = body.status
    if (body.notes !== undefined) updates.notes = body.notes.trim()

    // El admin del tenant solo puede editar paymentMode/paymentTerms de SU tenant
    if (body.paymentMode !== undefined || body.paymentTerms !== undefined) {
      const tenantIdx = account.tenantSettings.findIndex(
        ts => ts.tenantId.toString() === tenant._id.toString()
      )
      if (tenantIdx >= 0) {
        if (body.paymentMode !== undefined) account.tenantSettings[tenantIdx].paymentMode = body.paymentMode
        if (body.paymentTerms !== undefined) account.tenantSettings[tenantIdx].paymentTerms = body.paymentTerms.trim()
      } else {
        // Lazy init: accessMode 'all' sin config local → crear entrada default
        account.tenantSettings.push({
          tenantId: tenant._id,
          paymentMode: body.paymentMode || 'cash_mp',
          paymentTerms: body.paymentTerms?.trim() || '',
        } as any)
      }
    }

    if (body.addEmployeeEmails && Array.isArray(body.addEmployeeEmails)) {
      const newEmails = body.addEmployeeEmails
        .map((e: string) => e.trim().toLowerCase())
        .filter((e: string) => e)

      for (const email of newEmails) {
        if (email === account.companyAdminEmail) continue
        if (account.employeeEmails.includes(email)) continue

        const conflict = await CorporateAccount.findOne({
          _id: { $ne: accountId },
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
      await CorporateAccount.updateOne({ _id: accountId }, { $set: updates })
    }

    await account.save()

    const updated = await CorporateAccount.findById(accountId).lean()

    return NextResponse.json({
      company: {
        ...updated,
        _id: updated!._id.toString(),
        tenantIds: updated!.tenantIds.map(id => id.toString()),
        tenantSettings: updated!.tenantSettings.map(ts => ({
          ...ts,
          tenantId: ts.tenantId.toString(),
        })),
      }
    })
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

    const deleted = await CorporateAccount.findOneAndDelete({ _id: accountId })
    if (!deleted) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
