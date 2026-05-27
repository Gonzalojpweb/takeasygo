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

    const companies = await CorporateAccount.find()
      .sort({ createdAt: -1 })
      .lean()

    const tenantIds = [...new Set(companies.map(c => c.tenantId.toString()))]
    const tenants = await Tenant.find({ _id: { $in: tenantIds } }).select('name slug').lean()
    const tenantMap = Object.fromEntries(tenants.map(t => [t._id.toString(), { name: t.name, slug: t.slug }]))

    const enriched = companies.map(c => ({
      ...c,
      _id: c._id.toString(),
      tenantId: c.tenantId.toString(),
      tenantName: tenantMap[c.tenantId.toString()]?.name ?? '(sin tenant)',
      tenantSlug: tenantMap[c.tenantId.toString()]?.slug ?? '',
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
    if (!body.paymentMode) {
      return NextResponse.json({ error: 'El esquema de pago es obligatorio' }, { status: 400 })
    }
    if (!body.tenantId) {
      return NextResponse.json({ error: 'Debe asignar la empresa a un tenant' }, { status: 400 })
    }

    const tenant = await Tenant.findOne({ _id: body.tenantId, isActive: true }).lean()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado o inactivo' }, { status: 404 })
    }

    const adminEmail = body.companyAdminEmail.trim().toLowerCase()

    const existing = await CorporateAccount.findOne({
      tenantId: tenant._id,
      $or: [
        { companyAdminEmail: adminEmail },
        { employeeEmails: adminEmail },
      ],
    })
    if (existing) {
      return NextResponse.json(
        { error: 'Este email ya está registrado en otra empresa de este tenant' },
        { status: 409 }
      )
    }

    const employeeEmails: string[] = (body.employeeEmails || [])
      .map((e: string) => e.trim().toLowerCase())
      .filter((e: string) => e && e !== adminEmail)

    for (const empEmail of employeeEmails) {
      const conflict = await CorporateAccount.findOne({
        tenantId: tenant._id,
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

    const session = await import('@/lib/auth').then(m => m.auth())
    const registeredById = session?.user?.id

    const account = await CorporateAccount.create({
      tenantId: tenant._id,
      companyName: body.companyName.trim(),
      companyTaxId: (body.companyTaxId || '').trim(),
      paymentMode: body.paymentMode,
      paymentTerms: (body.paymentTerms || '').trim(),
      registeredBy: 'superadmin',
      registeredById: registeredById || tenant._id,
      companyAdminEmail: adminEmail,
      employeeEmails,
      notes: (body.notes || '').trim(),
    })

    const enriched = {
      ...account.toObject(),
      _id: account._id.toString(),
      tenantId: account.tenantId.toString(),
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
    }

    return NextResponse.json({ company: enriched }, { status: 201 })
  } catch (error: any) {
    if (error?.code === 11000) {
      return NextResponse.json(
        { error: 'Ya existe una empresa con este email corporativo en este tenant' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
