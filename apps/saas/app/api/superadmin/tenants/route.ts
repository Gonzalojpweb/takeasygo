import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { superadminCreateTenantSchema } from '@/lib/schemas'

export async function GET() {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    await connectDB()
    const tenants = await Tenant.find()
    return NextResponse.json({ tenants })
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener tenants' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const parsed = superadminCreateTenantSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    await connectDB()

    const existing = await Tenant.findOne({ slug: parsed.data.slug })
    if (existing) {
      return NextResponse.json({ error: 'El slug ya está en uso' }, { status: 400 })
    }

    const tenant = await Tenant.create(parsed.data)
    return NextResponse.json({ tenant }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear el tenant' }, { status: 500 })
  }
}
