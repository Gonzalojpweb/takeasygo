import { Types } from 'mongoose'
import Order from '@/models/Order'
import Menu from '@/models/Menu'

export interface BestSellerItem {
  _id: string
  name: string
  description?: string
  price: number
  takeawayPrice?: number
  businessPrice?: number
  imageUrl?: string
  count: number
  revenue: number
}

export async function getBestSellers(
  tenantId: Types.ObjectId | string,
  locationId: string,
  mode: 'takeaway' | 'dine-in' | 'business' = 'takeaway',
  limit = 6,
  minThreshold = 3,
): Promise<BestSellerItem[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const topProducts = await Order.aggregate([
    {
      $match: {
        tenantId: new Types.ObjectId(tenantId as string),
        locationId: new Types.ObjectId(locationId),
        deletedAt: null,
        createdAt: { $gte: thirtyDaysAgo },
        status: { $nin: ['cancelled'] },
        orderMode: mode,
      },
    },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.name',
        count: { $sum: '$items.quantity' },
        revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
      },
    },
    { $sort: { count: -1 } },
    { $limit: limit },
    { $project: { name: '$_id', count: 1, revenue: 1, _id: 0 } },
  ])

  if (topProducts.length < minThreshold) return []

  const menu = await Menu.findOne({
    tenantId: new Types.ObjectId(tenantId as string),
    locationId,
    isActive: true,
  }).lean()

  if (!menu) return []

  const allItems: any[] = []
  for (const cat of (menu.categories ?? []) as any[]) {
    allItems.push(...(cat.items ?? []))
    for (const sub of cat.subcategories ?? []) {
      allItems.push(...(sub.items ?? []))
    }
  }
  const nameToItem = new Map<string, Record<string, unknown>>()
  for (const item of allItems) {
    nameToItem.set(item.name.toLowerCase().trim(), item)
  }

  const result: BestSellerItem[] = []
  for (const tp of topProducts) {
    const match = nameToItem.get(tp.name.toLowerCase().trim())
    if (match) {
      result.push({
        _id: String(match._id),
        name: String(match.name ?? ''),
        description: match.description ? String(match.description) : undefined,
        price: Number(match.price ?? 0),
        takeawayPrice: match.takeawayPrice != null ? Number(match.takeawayPrice) : undefined,
        businessPrice: match.businessPrice != null ? Number(match.businessPrice) : undefined,
        imageUrl: match.imageUrl ? String(match.imageUrl) : undefined,
        count: tp.count,
        revenue: tp.revenue,
      })
    }
  }

  return result
}
