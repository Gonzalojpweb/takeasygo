import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { superadminCreateTenantSchema } from '@/lib/schemas'
import { NEW_TENANT_WHATSAPP_ORDER_LINK } from '@/lib/whatsapp-order-link'
import { tenantSlugError } from '@/lib/reserved-slugs'

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

    // Multi-marca PR 5: misma lista de slugs reservados que el alta pública.
    const slugError = tenantSlugError(parsed.data.slug)
    if (slugError) {
      return NextResponse.json({ error: slugError }, { status: 400 })
    }

    await connectDB()

    const existing = await Tenant.findOne({ slug: parsed.data.slug })
    if (existing) {
      return NextResponse.json({ error: 'El slug ya está en uso' }, { status: 400 })
    }

    // Comercio nuevo: WhatsApp en el seguimiento apagado hasta que el
    // superadmin lo habilite (lib/whatsapp-order-link.ts).
    const data = parsed.data as Record<string, unknown> & { features?: Record<string, unknown> }
    const tenant = await Tenant.create({ ...data, features: { ...(data.features ?? {}), ...NEW_TENANT_WHATSAPP_ORDER_LINK } })
    return NextResponse.json({ tenant }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear el tenant' }, { status: 500 })
  }
}
