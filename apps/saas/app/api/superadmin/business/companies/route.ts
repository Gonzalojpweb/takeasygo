import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import CorporateAccount from '@/models/CorporateAccount'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'

export async function GET(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    await connectDB()

    const url = new URL(request.url)
    const filterTenantId = url.searchParams.get('tenantId')

    const query: Record<string, any> = {}
    if (filterTenantId) {
      query.$or = [
        { accessMode: 'all' },
        { tenantIds: filterTenantId },
      ]
    }

    const companies = await CorporateAccount.find(query)
      .sort({ createdAt: -1 })
      .lean()

    const allTenantIds = [...new Set(
      companies.flatMap(c => c.tenantIds.map(id => id.toString()))
    )]
    const tenants = await Tenant.find({ _id: { $in: allTenantIds } }).select('name slug').lean()
    const tenantMap = Object.fromEntries(tenants.map(t => [t._id.toString(), { name: t.name, slug: t.slug }]))

    const enriched = companies.map(c => ({
      ...c,
      _id: c._id.toString(),
      tenantIds: c.tenantIds.map(id => id.toString()),
      tenantSettings: c.tenantSettings.map(ts => ({
        ...ts,
        tenantId: ts.tenantId.toString(),
      })),
      tenantNames: c.tenantIds.map(id => tenantMap[id.toString()]?.name ?? '(sin tenant)'),
      createdAt: c.createdAt?.toISOString?.() ?? c.createdAt,
      updatedAt: c.updatedAt?.toISOString?.() ?? c.updatedAt,
    }))

    return NextResponse.json({ companies: enriched })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    await connectDB()

    const body = await request.json()

    if (!body.companyName?.trim()) {
      return NextResponse.json({ error: 'El nombre de la empresa es obligatorio' }, { status: 400 })
    }
    if (!body.companyAdminEmail?.trim()) {
      return NextResponse.json({ error: 'El email de la empresa es obligatorio' }, { status: 400 })
    }
    if (!body.accessMode || !['specific', 'all'].includes(body.accessMode)) {
      return NextResponse.json({ error: 'Modo de acceso inválido' }, { status: 400 })
    }

    const accessMode = body.accessMode as 'specific' | 'all'

    if (accessMode === 'specific') {
      if (!Array.isArray(body.tenantIds) || body.tenantIds.length === 0) {
        return NextResponse.json(
          { error: 'Debe asignar al menos un tenant cuando el modo es "específico"' },
          { status: 400 }
        )
      }
    }

    const adminEmail = body.companyAdminEmail.trim().toLowerCase()

    // Unicidad global del email
    const existing = await CorporateAccount.findOne({
      $or: [
        { companyAdminEmail: adminEmail },
        { employeeEmails: adminEmail },
      ],
    })
    if (existing) {
      return NextResponse.json(
        { error: 'Este email ya está registrado en otra empresa' },
        { status: 409 }
      )
    }

    const employeeEmails: string[] = (body.employeeEmails || [])
      .map((e: string) => e.trim().toLowerCase())
      .filter((e: string) => e && e !== adminEmail)

    // Validar employee emails contra todas las empresas
    for (const empEmail of employeeEmails) {
      const conflict = await CorporateAccount.findOne({
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

    // Validar y construir tenantSettings
    const tenantSettings: Array<{ tenantId: any; paymentMode: string; paymentTerms: string }> = []

    if (accessMode === 'specific') {
      const tenantIds = body.tenantIds as string[]
      const validTenants = await Tenant.find({ _id: { $in: tenantIds }, isActive: true }).select('_id').lean()
      const validTenantIds = new Set(validTenants.map(t => t._id.toString()))

      for (const tid of tenantIds) {
        if (!validTenantIds.has(tid)) {
          return NextResponse.json(
            { error: `Tenant ${tid} no encontrado o inactivo` },
            { status: 404 }
          )
        }

        const settings = body.tenantSettings?.[tid] || {}
        tenantSettings.push({
          tenantId: tid,
          paymentMode: settings.paymentMode || 'cash_mp',
          paymentTerms: settings.paymentTerms || '',
        })
      }
    }

    const session = await import('@/lib/auth').then(m => m.auth())
    const registeredById = session?.user?.id

    const account = await CorporateAccount.create({
      accessMode,
      tenantIds: accessMode === 'specific' ? body.tenantIds : [],
      tenantSettings,
      companyName: body.companyName.trim(),
      companyTaxId: (body.companyTaxId || '').trim(),
      status: 'active',
      registeredBy: 'superadmin',
      registeredById: registeredById || '000000000000000000000000',
      companyAdminEmail: adminEmail,
      employeeEmails,
      notes: (body.notes || '').trim(),
    })

    const allTenantIds = account.tenantIds.map(id => id.toString())
    const tenants = await Tenant.find({ _id: { $in: allTenantIds } }).select('name slug').lean()
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

    return NextResponse.json({ company: enriched }, { status: 201 })
  } catch (error: any) {
    if (error?.code === 11000) {
      return NextResponse.json(
        { error: 'Ya existe una empresa con este email corporativo' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
