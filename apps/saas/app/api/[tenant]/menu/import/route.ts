import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Menu from '@/models/Menu'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface ImportOption {
  name: string
  extraPrice?: number
  subGroups?: ImportGroup[]
}

interface ImportGroup {
  name: string
  type?: 'single' | 'multiple'
  required?: boolean
  options: ImportOption[]
}

interface ImportVariant {
  name: string
  price: number
  takeawayPrice?: number
  businessPrice?: number
  originalPrice?: number
  takeawayOriginalPrice?: number
  nameTranslations?: { en: string }
}

interface ImportAvailabilitySlot {
  days: number[]
  timeStart: string
  timeEnd: string
}

interface ImportItem {
  name: string
  description?: string
  price: number
  takeawayPrice?: number
  businessPrice?: number
  halfPrice?: number
  originalPrice?: number
  takeawayOriginalPrice?: number
  tags?: string[]
  isFeatured?: boolean
  isAvailable?: boolean
  isTakeawayAvailable?: boolean
  isBusinessAvailable?: boolean
  imageUrl?: string
  printRole?: string
  suggestWith?: string[]
  variants?: ImportVariant[]
  customizationGroups?: ImportGroup[]
  availabilityMode?: 'always' | 'scheduled'
  availabilitySchedule?: ImportAvailabilitySlot[]
}

interface ImportCategory {
  name: string
  description?: string
  imageUrl?: string
  isAvailable?: boolean
  isBusinessAvailable?: boolean
  sortOrder?: number
  printRole?: string
  customizationGroups?: ImportGroup[]
  availabilityMode?: 'always' | 'scheduled'
  availabilitySchedule?: ImportAvailabilitySlot[]
  items: ImportItem[]
  subcategories?: ImportSubCategory[]
}

interface ImportSubCategory {
  name: string
  description?: string
  imageUrl?: string
  items: ImportItem[]
  customizationGroups?: ImportGroup[]
  availabilityMode?: 'always' | 'scheduled'
  availabilitySchedule?: ImportAvailabilitySlot[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Construye customizationGroups de forma recursiva (resuelve subGroups) */
function buildGroups(groups: ImportGroup[] = []): any[] {
  return groups.map(g => ({
    name: g.name,
    type: g.type ?? 'single',
    required: g.required ?? false,
    options: (g.options ?? []).map(o => ({
      name: o.name,
      extraPrice: o.extraPrice ?? 0,
      subGroups: buildGroups(o.subGroups),
    })),
  }))
}

function validatePayload(categories: unknown): categories is ImportCategory[] {
  if (!Array.isArray(categories) || categories.length === 0) return false
  for (const cat of categories) {
    if (typeof cat.name !== 'string' || !cat.name.trim()) return false
    if (!Array.isArray(cat.items)) return false
    for (const item of cat.items) {
      if (typeof item.name !== 'string' || !item.name.trim()) return false
      if (typeof item.price !== 'number' || item.price < 0) return false
    }
    if (cat.subcategories) {
      for (const sub of cat.subcategories) {
        if (typeof sub.name !== 'string' || !sub.name.trim()) return false
        if (!Array.isArray(sub.items)) return false
        for (const item of sub.items) {
          if (typeof item.name !== 'string' || !item.name.trim()) return false
          if (typeof item.price !== 'number' || item.price < 0) return false
        }
      }
    }
  }
  return true
}

// ─── Handler ──────────────────────────────────────────────────────────────────

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

    const body = await request.json()
    const { locationId, categories, mode = 'replace' } = body

    if (!locationId) {
      return NextResponse.json({ error: 'locationId es requerido' }, { status: 400 })
    }

    if (!validatePayload(categories)) {
      return NextResponse.json(
        { error: 'JSON inválido. Cada categoría debe tener "name" y "items", y cada ítem debe tener "name" y "price" (número).' },
        { status: 400 }
      )
    }

    const menu = await Menu.findOne({ tenantId: tenant._id, locationId, isActive: true })
    if (!menu) {
      return NextResponse.json({ error: 'No se encontró el menú para esta sede' }, { status: 404 })
    }

    const builtCategories = categories.map((cat: ImportCategory, catIndex: number) => ({
      name: cat.name.trim(),
      description: cat.description?.trim() ?? '',
      imageUrl: cat.imageUrl ?? '',
      isAvailable: cat.isAvailable ?? true,
      isBusinessAvailable: cat.isBusinessAvailable ?? true,
      sortOrder: cat.sortOrder ?? catIndex,
      printRole: cat.printRole ?? 'kitchen',
      customizationGroups: buildGroups(cat.customizationGroups),
      availabilityMode: cat.availabilityMode ?? 'always',
      availabilitySchedule: cat.availabilityMode === 'scheduled' ? (cat.availabilitySchedule ?? []) : [],
      items: cat.items.map((item: ImportItem) => ({
        name: item.name.trim(),
        description: item.description?.trim() ?? '',
        price: item.price,
        takeawayPrice: item.takeawayPrice,
        businessPrice: item.businessPrice,
        halfPrice: item.halfPrice,
        originalPrice: item.originalPrice,
        takeawayOriginalPrice: item.takeawayOriginalPrice,
        tags: Array.isArray(item.tags) ? item.tags.map((t: string) => t.trim()).filter(Boolean) : [],
        isFeatured: item.isFeatured ?? false,
        isAvailable: item.isAvailable ?? true,
        isTakeawayAvailable: item.isTakeawayAvailable ?? true,
        isBusinessAvailable: item.isBusinessAvailable ?? true,
        imageUrl: item.imageUrl ?? '',
        printRole: item.printRole ?? 'kitchen',
        suggestWith: Array.isArray(item.suggestWith) ? item.suggestWith : [],
        variants: (item.variants ?? []).map((v: ImportVariant) => ({
          name: v.name,
          price: v.price,
          takeawayPrice: v.takeawayPrice,
          businessPrice: v.businessPrice,
          originalPrice: v.originalPrice,
          takeawayOriginalPrice: v.takeawayOriginalPrice,
          nameTranslations: v.nameTranslations,
        })),
        customizationGroups: buildGroups(item.customizationGroups),
        availabilityMode: item.availabilityMode ?? 'always',
        availabilitySchedule: item.availabilityMode === 'scheduled' ? (item.availabilitySchedule ?? []) : [],
      })),
      subcategories: cat.subcategories?.map((sub: ImportSubCategory, subIndex: number) => ({
        name: sub.name.trim(),
        description: sub.description?.trim() ?? '',
        imageUrl: sub.imageUrl ?? '',
        sortOrder: subIndex,
        items: sub.items.map((item: ImportItem) => ({
          name: item.name.trim(),
          description: item.description?.trim() ?? '',
          price: item.price,
          takeawayPrice: item.takeawayPrice,
          businessPrice: item.businessPrice,
          halfPrice: item.halfPrice,
          originalPrice: item.originalPrice,
          takeawayOriginalPrice: item.takeawayOriginalPrice,
          tags: Array.isArray(item.tags) ? item.tags.map((t: string) => t.trim()).filter(Boolean) : [],
          isFeatured: item.isFeatured ?? false,
          isAvailable: item.isAvailable ?? true,
          isTakeawayAvailable: item.isTakeawayAvailable ?? true,
          isBusinessAvailable: item.isBusinessAvailable ?? true,
          imageUrl: item.imageUrl ?? '',
          printRole: item.printRole ?? 'kitchen',
          suggestWith: Array.isArray(item.suggestWith) ? item.suggestWith : [],
          variants: (item.variants ?? []).map((v: ImportVariant) => ({
            name: v.name,
            price: v.price,
            takeawayPrice: v.takeawayPrice,
            businessPrice: v.businessPrice,
            originalPrice: v.originalPrice,
            takeawayOriginalPrice: v.takeawayOriginalPrice,
            nameTranslations: v.nameTranslations,
          })),
          customizationGroups: buildGroups(item.customizationGroups),
          availabilityMode: item.availabilityMode ?? 'always',
          availabilitySchedule: item.availabilityMode === 'scheduled' ? (item.availabilitySchedule ?? []) : [],
        })),
        customizationGroups: buildGroups(sub.customizationGroups),
        availabilityMode: sub.availabilityMode ?? 'always',
        availabilitySchedule: sub.availabilityMode === 'scheduled' ? (sub.availabilitySchedule ?? []) : [],
      })) ?? [],
    }))

    if (mode === 'replace') {
      menu.categories = builtCategories
    } else {
      // append: agrega al final sin borrar lo existente
      const startOrder = menu.categories.length
      builtCategories.forEach((cat, i) => {
        cat.sortOrder = startOrder + i
        menu.categories.push(cat)
      })
    }

    await menu.save()

    const totalItems = builtCategories.reduce((sum, cat) => sum + cat.items.length + (cat.subcategories?.reduce((s: number, sub: any) => s + sub.items.length, 0) ?? 0), 0)

    return NextResponse.json({
      ok: true,
      imported: {
        categories: builtCategories.length,
        items: totalItems,
        mode,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
