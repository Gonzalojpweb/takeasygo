import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import CorporateAccount from '@/models/CorporateAccount'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRole } from '@/lib/apiAuth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id')
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    const companies = await CorporateAccount.find({ tenantId: tenant._id })
      .sort({ createdAt: -1 })
      .lean()

    return NextResponse.json({ companies })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id')
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

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

    const account = await CorporateAccount.create({
      tenantId: tenant._id,
      companyName: body.companyName.trim(),
      companyTaxId: (body.companyTaxId || '').trim(),
      paymentMode: body.paymentMode,
      paymentTerms: (body.paymentTerms || '').trim(),
      registeredBy: 'tenant',
      registeredById: tenant._id,
      companyAdminEmail: adminEmail,
      employeeEmails,
      notes: (body.notes || '').trim(),
    })

    return NextResponse.json({ company: account }, { status: 201 })
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
