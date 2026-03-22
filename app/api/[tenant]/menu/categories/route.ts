import { connectDB } from '@/lib/mongoose'
import Menu from '@/models/Menu'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { translateToEnglish } from '@/lib/translate'
import { logAudit } from '@/lib/audit'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const { locationId, name, description, imageUrl } = await request.json()

    const menu = await Menu.findOne({ tenantId: tenant._id, locationId })
    if (!menu) return NextResponse.json({ error: 'Menú no encontrado' }, { status: 404 })

    const [nameEn, descEn] = await Promise.all([
      translateToEnglish(name),
      description ? translateToEnglish(description) : Promise.resolve(''),
    ])

    menu.categories.push({
      name,
      description: description || '',
      imageUrl: imageUrl || '',
      isAvailable: true,
      sortOrder: menu.categories.length,
      items: [],
      nameTranslations: { en: nameEn },
      descriptionTranslations: { en: descEn },
    } as any)
    await menu.save()

    logAudit({ tenantId: tenant._id.toString(), action: 'menu.category.created', entity: 'category', details: { name, locationId }, request })
    return NextResponse.json({ menu }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
