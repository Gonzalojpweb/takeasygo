import { connectDB } from '@/lib/mongoose'
import mongoose from 'mongoose'
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

    const tenants = await Tenant.find({ _id: { $in: account.tenantIds } }).select('name slug').lean()
    const tenantMap = Object.fromEntries(tenants.map(t => [t._id.toString(), { name: t.name, slug: t.slug }]))

    return NextResponse.json({
      company: {
        ...account,
        _id: account._id.toString(),
        tenantIds: account.tenantIds.map(id => id.toString()),
        tenantSettings: account.tenantSettings.map(ts => ({
          ...ts,
          tenantId: ts.tenantId.toString(),
        })),
        tenantNames: account.tenantIds.map(id => tenantMap[id.toString()]?.name ?? '(sin tenant)'),
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
    if (body.status !== undefined) account.status = body.status
    if (body.notes !== undefined) account.notes = body.notes.trim()

    if (body.accessMode !== undefined) {
      if (!['specific', 'all'].includes(body.accessMode)) {
        return NextResponse.json({ error: 'Modo de acceso inválido' }, { status: 400 })
      }
      account.accessMode = body.accessMode
    }

    // Gestionar tenantIds cuando accessMode es 'specific'
    if (body.tenantIds !== undefined && account.accessMode === 'specific') {
      if (!Array.isArray(body.tenantIds) || body.tenantIds.length === 0) {
        return NextResponse.json(
          { error: 'Debe asignar al menos un tenant cuando el modo es "específico"' },
          { status: 400 }
        )
      }

      const validTenants = await Tenant.find({ _id: { $in: body.tenantIds }, isActive: true }).select('_id').lean()
      const validTenantIds = new Set(validTenants.map(t => t._id.toString()))

      for (const tid of body.tenantIds) {
        if (!validTenantIds.has(tid)) {
          return NextResponse.json(
            { error: `Tenant ${tid} no encontrado o inactivo` },
            { status: 404 }
          )
        }
      }

      // Sincronizar tenantSettings: agregar nuevos, eliminar los que ya no están
      const newTenantIds = body.tenantIds as string[]
      const currentSettingsMap = new Map(
        account.tenantSettings.map(ts => [ts.tenantId.toString(), ts])
      )

      const newSettings = newTenantIds.map(tid => {
        const existing = currentSettingsMap.get(tid)
        return existing || { tenantId: new mongoose.Types.ObjectId(tid), paymentMode: 'cash_mp' as const, paymentTerms: '' }
      })

      account.tenantIds = body.tenantIds.map((id: string) => new mongoose.Types.ObjectId(id))
      account.tenantSettings = newSettings as any
    }

    // Gestionar tenantSettings individualmente
    if (body.tenantSettings && typeof body.tenantSettings === 'object') {
      for (const [tid, settings] of Object.entries(body.tenantSettings)) {
        const s = settings as { paymentMode?: string; paymentTerms?: string }
        const idx = account.tenantSettings.findIndex(
          ts => ts.tenantId.toString() === tid
        )
        if (idx >= 0) {
          if (s.paymentMode !== undefined) account.tenantSettings[idx].paymentMode = s.paymentMode as any
          if (s.paymentTerms !== undefined) account.tenantSettings[idx].paymentTerms = s.paymentTerms
        } else if (account.accessMode === 'all' || account.tenantIds.some(id => id.toString() === tid)) {
          account.tenantSettings.push({
            tenantId: new mongoose.Types.ObjectId(tid),
            paymentMode: (s.paymentMode || 'cash_mp') as any,
            paymentTerms: s.paymentTerms || '',
          } as any)
        }
      }
    }

    if (body.companyAdminEmail !== undefined) {
      const newEmail = body.companyAdminEmail.trim().toLowerCase()
      if (newEmail !== account.companyAdminEmail) {
        const conflict = await CorporateAccount.findOne({
          _id: { $ne: accountId },
          companyAdminEmail: newEmail,
        })
        if (conflict) {
          return NextResponse.json(
            { error: 'Este email ya está registrado en otra empresa' },
            { status: 409 }
          )
        }
        account.companyAdminEmail = newEmail
      }
    }

    if (Array.isArray(body.addEmployeeEmails)) {
      const newEmails = body.addEmployeeEmails
        .map((e: string) => e.trim().toLowerCase())
        .filter((e: string) => e && !account.employeeEmails.includes(e))

      for (const empEmail of newEmails) {
        const conflict = await CorporateAccount.findOne({
          _id: { $ne: accountId },
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

    const tenants = await Tenant.find({ _id: { $in: account.tenantIds } }).select('name slug').lean()
    const tenantMap = Object.fromEntries(tenants.map(t => [t._id.toString(), { name: t.name, slug: t.slug }]))

    const enriched = {
      ...account.toObject(),
      _id: account._id.toString(),
      tenantIds: account.tenantIds.map(id => id.toString()),
      tenantSettings: account.tenantSettings.map(ts => ({
        ...ts,
        tenantId: ts.tenantId.toString(),
      })),
      tenantNames: account.tenantIds.map(id => tenantMap[id.toString()]?.name ?? '(sin tenant)'),
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
    }

    return NextResponse.json({ company: enriched })
  } catch (error: any) {
    if (error?.code === 11000) {
      return NextResponse.json(
        { error: 'Conflicto de email único' },
        { status: 409 }
      )
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
    if (!account) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

    return NextResponse.json({ message: 'Empresa eliminada' })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
