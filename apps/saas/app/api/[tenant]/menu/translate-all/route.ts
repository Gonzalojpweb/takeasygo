import { connectDB } from '@/lib/mongoose'
import Menu from '@/models/Menu'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { translateToEnglish } from '@/lib/translate'

/**
 * POST /api/[tenant]/menu/translate-all
 * Translates ALL menu items and categories that are missing English translations.
 * No auth required — only adds translation fields, doesn't modify existing content.
 * Safe to call multiple times (idempotent for already-translated items).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const { locationId } = await request.json()

    const menu = await Menu.findOne({ tenantId: tenant._id, locationId })
    if (!menu) return NextResponse.json({ error: 'Menú no encontrado' }, { status: 404 })

    // Collect all translation tasks and run them in parallel
    const tasks: Promise<void>[] = []

    for (const category of menu.categories) {
      if (!category.nameTranslations?.en && category.name) {
        tasks.push(
          translateToEnglish(category.name).then(en => {
            category.nameTranslations = { en }
          })
        )
      }
      if (!category.descriptionTranslations?.en && category.description) {
        tasks.push(
          translateToEnglish(category.description).then(en => {
            category.descriptionTranslations = { en }
          })
        )
      }

      for (const item of category.items) {
        if (!item.nameTranslations?.en && item.name) {
          tasks.push(
            translateToEnglish(item.name).then(en => {
              item.nameTranslations = { en }
            })
          )
        }
        if (!item.descriptionTranslations?.en && item.description) {
          tasks.push(
            translateToEnglish(item.description).then(en => {
              item.descriptionTranslations = { en }
            })
          )
        }
      }
    }

    if (tasks.length > 0) {
      await Promise.allSettled(tasks)
      menu.markModified('categories')
      await menu.save()
    }

    return NextResponse.json({ menu })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
