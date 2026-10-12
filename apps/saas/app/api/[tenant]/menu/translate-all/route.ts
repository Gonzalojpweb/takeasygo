import { connectDB } from '@/lib/mongoose'
import Menu from '@/models/Menu'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { translateToEnglish } from '@/lib/translate'
import { rateLimit } from '@/lib/rateLimit'

/**
 * POST /api/[tenant]/menu/translate-all
 * Translates ALL menu items and categories that are missing English translations.
 * Público por diseño (lo llama el menú visto por el cliente), protegido con
 * rate limit por IP + caché del resultado por sede (TTL 10 min) para no
 * repetir llamadas a la API de traducción. Idempotente.
 */

// Resultado "completado" por sede: evita re-traducir en ráfagas del menú público.
const translateCache = new Map<string, number>()
const TRANSLATE_CACHE_TTL_MS = 10 * 60 * 1000
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown'
    const { success } = await rateLimit(`translate:${tenantSlug}:${ip}`, 5, 60_000)
    if (!success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const { locationId } = await request.json()

    const menu = await Menu.findOne({ tenantId: tenant._id, locationId })
    if (!menu) return NextResponse.json({ error: 'Menú no encontrado' }, { status: 404 })

    const cacheKey = `${tenant._id}:${locationId}`
    const cachedAt = translateCache.get(cacheKey)
    if (cachedAt && Date.now() - cachedAt < TRANSLATE_CACHE_TTL_MS) {
      return NextResponse.json({ menu, cached: true })
    }

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

      for (const subcategory of category.subcategories || []) {
        if (!subcategory.nameTranslations?.en && subcategory.name) {
          tasks.push(
            translateToEnglish(subcategory.name).then(en => {
              subcategory.nameTranslations = { en }
            })
          )
        }
        if (!subcategory.descriptionTranslations?.en && subcategory.description) {
          tasks.push(
            translateToEnglish(subcategory.description).then(en => {
              subcategory.descriptionTranslations = { en }
            })
          )
        }
        for (const item of subcategory.items) {
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
    }

    if (tasks.length > 0) {
      const settled = await Promise.allSettled(tasks)
      const failed = settled.filter((s) => s.status === 'rejected').length
      if (failed === 0) {
        menu.markModified('categories')
        await menu.save()
        translateCache.set(cacheKey, Date.now())
      }
    } else {
      // Nada pendiente: próxima llamada puede responder desde caché.
      translateCache.set(cacheKey, Date.now())
    }

    return NextResponse.json({ menu })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
