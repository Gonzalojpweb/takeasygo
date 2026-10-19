import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Menu from '@/models/Menu'
import Location from '@/models/Location'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import PausedMenuItems from '@/components/admin/PausedMenuItems'
import type { Types } from 'mongoose'

export default async function PausedItemsPage() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .lean<{ _id: Types.ObjectId }>()
  if (!tenant) notFound()

  const tenantId = tenant._id

  const locations = await Location.find({ tenantId, isActive: true })
    .lean<Array<{ _id: { toString(): string }; name: string }>>()
  const menus = await Menu.find({ tenantId, isActive: true }).lean()

  interface PausedItemData {
    itemId: string
    name: string
    categoryName: string
    categoryId: string
    subcategoryName: string | null
    locationId: string
    locationName: string
    price: number
    isAvailable: boolean
  }

  interface PausedCategoryData {
    categoryId: string
    categoryName: string
    locationId: string
    locationName: string
    itemCount: number
  }

  const pausedItems: PausedItemData[] = []
  const pausedCategories: PausedCategoryData[] = []

  for (const menu of menus) {
    const locId = (menu as any).locationId?.toString?.() ?? ''
    const locName = locations.find((l) => l._id.toString() === locId)?.name ?? locId

    for (const cat of ((menu as any).categories ?? [])) {
      const catId = cat._id?.toString?.() ?? ''
      const catName = cat.name ?? ''

      if (cat.isAvailable === false) {
        pausedCategories.push({
          categoryId: catId,
          categoryName: catName,
          locationId: locId,
          locationName: locName,
          itemCount: (cat.items?.length ?? 0) +
            (cat.subcategories ?? []).reduce(
              (acc: number, sub: any) => acc + (sub.items?.length ?? 0), 0
            ),
        })
      }

      for (const item of cat.items ?? []) {
        if (item.isAvailable === false) {
          pausedItems.push({
            itemId: item._id?.toString?.() ?? '',
            name: item.name ?? '',
            categoryName: catName,
            categoryId: catId,
            subcategoryName: null,
            locationId: locId,
            locationName: locName,
            price: item.price ?? 0,
            isAvailable: false,
          })
        }
      }

      for (const sub of cat.subcategories ?? []) {
        for (const item of sub.items ?? []) {
          if (item.isAvailable === false) {
            pausedItems.push({
              itemId: item._id?.toString?.() ?? '',
              name: item.name ?? '',
              categoryName: catName,
              categoryId: catId,
              subcategoryName: sub.name ?? null,
              locationId: locId,
              locationName: locName,
              price: item.price ?? 0,
              isAvailable: false,
            })
          }
        }
      }
    }
  }

  return (
    <PausedMenuItems
      pausedItems={JSON.parse(JSON.stringify(pausedItems))}
      pausedCategories={JSON.parse(JSON.stringify(pausedCategories))}
      locations={JSON.parse(JSON.stringify(locations))}
      tenantSlug={tenantSlug || ''}
    />
  )
}
