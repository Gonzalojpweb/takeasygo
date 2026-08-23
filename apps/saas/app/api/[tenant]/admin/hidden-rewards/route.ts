/**
 * GET  /api/{tenant}/admin/hidden-rewards  — Stats + list of menu items with hidden rewards
 * PUT  /api/{tenant}/admin/hidden-rewards  — Update hidden reward settings for a menu item
 */

import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Menu from '@/models/Menu'
import Tenant from '@/models/Tenant'
import HiddenRewardClaim from '@/models/HiddenRewardClaim'
import { requireAdminRole } from '@/lib/apiAuth'
import { PLAN_ACCESS, HIDDEN_REWARDS_LIMIT } from '@takeasygo/business'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAdminRole(request, tenant._id.toString()).catch(() =>
      NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    )
    if (authError) return authError

    // Stats (v2 status names)
    const [totalClaims, pendingClaims, reservadoClaims, consumedClaims, expiredClaims] = await Promise.all([
      HiddenRewardClaim.countDocuments({ tenantId: tenant._id }),
      HiddenRewardClaim.countDocuments({ tenantId: tenant._id, status: 'pendiente' }),
      HiddenRewardClaim.countDocuments({ tenantId: tenant._id, status: 'reservado' }),
      HiddenRewardClaim.countDocuments({ tenantId: tenant._id, status: 'consumido' }),
      HiddenRewardClaim.countDocuments({ tenantId: tenant._id, status: 'expired' }),
    ])

    // Total descuentos aplicados (consumed claims)
    const consumedAgg = await HiddenRewardClaim.aggregate([
      { $match: { tenantId: tenant._id, status: 'consumido' } },
      { $group: { _id: null, totalDiscount: { $sum: '$discountPercentage' }, count: { $sum: 1 } } },
    ])
    const totalDiscountsApplied = consumedAgg[0]?.count ?? 0

    // Menu items with hidden rewards
    const menus = await Menu.find({ tenantId: tenant._id, isActive: true }).lean()
    const itemsWithRewards: any[] = []
    for (const menu of menus) {
      for (const cat of menu.categories || []) {
        for (const item of cat.items || []) {
          if (item.hiddenReward?.enabled) {
            itemsWithRewards.push({
              _id: item._id,
              name: item.name,
              locationId: menu.locationId,
              categoryName: cat.name,
              hiddenReward: item.hiddenReward,
            })
          }
          for (const sub of cat.subcategories || []) {
            for (const item of sub.items || []) {
              if (item.hiddenReward?.enabled) {
                itemsWithRewards.push({
                  _id: item._id,
                  name: item.name,
                  locationId: menu.locationId,
                  categoryName: `${cat.name} > ${sub.name}`,
                  hiddenReward: item.hiddenReward,
                })
              }
            }
          }
        }
      }
    }

    // Plan info
    const plan = tenant.plan || 'trial'
    const planAccess = PLAN_ACCESS[plan] || {}
    // const hasHiddenRewards = planAccess.hiddenRewards?.length > 0
    const hasHiddenRewards = canAccess(plan as Plan, 'hiddenRewards')
    const maxItems = HIDDEN_REWARDS_LIMIT[plan] || 0
    const currentEnabled = itemsWithRewards.filter(i => i.hiddenReward.enabled).length

    return NextResponse.json({
      stats: {
        totalClaims,
        pendingClaims,
        reservedClaims: reservadoClaims,
        consumedClaims,
        expiredClaims,
        totalDiscountsApplied,
      },
      itemsWithRewards,
      plan: {
        name: plan,
        hasHiddenRewards,
        maxItems,
        currentEnabled,
        isAtLimit: maxItems > 0 && currentEnabled >= maxItems,
      },
    })
  } catch (error) {
    console.error('[Admin Hidden Rewards GET] Error:', error)
    return NextResponse.json({ error: 'Error al obtener datos' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAdminRole(request, tenant._id.toString()).catch(() =>
      NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    )
    if (authError) return authError

    const body = await request.json()
    const { menuItemId, locationId, hiddenReward } = body

    if (!menuItemId || !locationId) {
      return NextResponse.json({ error: 'menuItemId y locationId son requeridos' }, { status: 400 })
    }

    // Plan gating: block enabling new items if at Growth limit
    if (hiddenReward.enabled) {
      const plan = tenant.plan || 'trial'
      const maxItems = HIDDEN_REWARDS_LIMIT[plan] || 0
      if (maxItems > 0) {
        const menus = await Menu.find({ tenantId: tenant._id, isActive: true }).lean()
        let currentEnabled = 0
        for (const m of menus) {
          for (const cat of m.categories || []) {
            for (const item of cat.items || []) {
              if (item.hiddenReward?.enabled) currentEnabled++
            }
            for (const sub of cat.subcategories || []) {
              for (const item of sub.items || []) {
                if (item.hiddenReward?.enabled) currentEnabled++
              }
            }
          }
        }
        // Allow if this item is already enabled (editing existing)
        const menu = await Menu.findOne({ tenantId: tenant._id, locationId }).lean()
        const alreadyEnabled = menu?.categories?.some(cat =>
          cat.items?.some(i => i._id?.toString() === menuItemId && i.hiddenReward?.enabled)
        ) || menu?.categories?.some(cat =>
          cat.subcategories?.some(sub =>
            sub.items?.some(i => i._id?.toString() === menuItemId && i.hiddenReward?.enabled)
          )
        )
        if (!alreadyEnabled && currentEnabled >= maxItems) {
          return NextResponse.json({
            error: `Tu plan ${plan} permite máximo ${maxItems} recompensas. Desactivá una antes de crear otra.`,
            planLimit: maxItems,
            currentCount: currentEnabled,
          }, { status: 403 })
        }
      }
    }

    const menu = await Menu.findOne({ tenantId: tenant._id, locationId })
    if (!menu) {
      return NextResponse.json({ error: 'Menú no encontrado' }, { status: 404 })
    }

    // Find and update the item in categories or subcategories
    let found = false
    for (const cat of menu.categories || []) {
      for (const item of cat.items || []) {
        if (item._id?.toString() === menuItemId) {
          item.hiddenReward = hiddenReward
          found = true
          break
        }
      }
      if (found) break
      for (const sub of cat.subcategories || []) {
        for (const item of sub.items || []) {
          if (item._id?.toString() === menuItemId) {
            item.hiddenReward = hiddenReward
            found = true
            break
          }
        }
        if (found) break
      }
      if (found) break
    }

    if (!found) {
      return NextResponse.json({ error: 'Ítem no encontrado en el menú' }, { status: 404 })
    }

    await menu.save()

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Admin Hidden Rewards PUT] Error:', error)
    return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 })
  }
}
