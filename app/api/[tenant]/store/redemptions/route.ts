/**
 * API Endpoint: Store Redemptions (Member)
 * 
 * POST   /api/{tenant}/store/redemptions         - Canjear item
 * GET    /api/{tenant}/store/redemptions         - Listar mis canjes
 */

import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import StoreRedemption from '@/models/StoreRedemption'
import StoreItem from '@/models/StoreItem'
import LoyaltyMember from '@/models/LoyaltyMember'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { syncWalletPoints } from '@/lib/walletService'
import { rateLimit } from '@/lib/rateLimit'
import { canAccess } from '@/lib/plans'
import mongoose from 'mongoose'

export async function POST(
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

    if (!tenant.store?.enabled) {
      return NextResponse.json({ error: 'Store no habilitado' }, { status: 400 })
    }

    // Solo tenants Premium pueden procesar canjes
    if (!canAccess(tenant.plan, 'store')) {
      return NextResponse.json({ error: 'Store disponible solo para plan Premium' }, { status: 403 })
    }

    const body = await request.json()
    const { memberId, storeItemId } = body

    if (!memberId || !storeItemId) {
      return NextResponse.json({ error: 'Faltan memberId y storeItemId' }, { status: 400 })
    }

    // Rate limiting: max 5 intentos de canje por miembro en 60 segundos
    const rl = await rateLimit(`redeem:${tenantSlug}:${memberId}`, 5, 60_000)
    if (!rl.success) {
      return NextResponse.json({
        error: 'Demasiados intentos. Esperá un momento antes de intentar de nuevo.',
        retryAfter: '60 segundos',
      }, { status: 429 })
    }

    const session = await mongoose.startSession()
    session.startTransaction()

    try {
      // Buscar miembro
      const member = await LoyaltyMember.findOne({ _id: memberId, tenantId: tenant._id }).session(session)
      if (!member) {
        await session.abortTransaction()
        return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 })
      }

      if (member.status !== 'active') {
        await session.abortTransaction()
        return NextResponse.json({ error: 'Miembro no activo' }, { status: 400 })
      }

      // Buscar item
      const item = await StoreItem.findOne({ _id: storeItemId, tenantId: tenant._id, isActive: true }).session(session)
      if (!item) {
        await session.abortTransaction()
        return NextResponse.json({ error: 'Item no encontrado o no disponible' }, { status: 404 })
      }

      // Validar puntos suficientes
      if (member.loyalty.points < item.pointsCost) {
        await session.abortTransaction()
        return NextResponse.json({ 
          error: 'Puntos insuficientes',
          currentPoints: member.loyalty.points,
          requiredPoints: item.pointsCost
        }, { status: 400 })
      }

      // Validar stock
      if (item.stock !== null && item.stock <= 0) {
        await session.abortTransaction()
        return NextResponse.json({ error: 'Item sin stock' }, { status: 400 })
      }

      // Validar tier requirement
      if (item.tierRequirement && item.tierRequirement !== 'none') {
        const tierOrder = { none: 0, bronze: 1, silver: 2, gold: 3 }
        if (tierOrder[member.loyalty.tier] < tierOrder[item.tierRequirement]) {
          await session.abortTransaction()
          return NextResponse.json({ 
            error: 'Nivel insuficiente',
            currentTier: member.loyalty.tier,
            requiredTier: item.tierRequirement
          }, { status: 400 })
        }
      }

      // Validar maxPerMember
      if (item.maxPerMember) {
        const memberRedemptions = await StoreRedemption.countDocuments({
          memberId,
          storeItemId,
          status: { $in: ['pending', 'claimed'] }
        }).session(session)

        if (memberRedemptions >= item.maxPerMember) {
          await session.abortTransaction()
          return NextResponse.json({ 
            error: 'Has alcanzado el límite de canjes para este item',
            limit: item.maxPerMember
          }, { status: 400 })
        }
      }

      // Validar recurrencia (opcional — items que requieren compras históricas)
      if (item.minItemPurchases > 0 && item.linkedMenuItemIds?.length > 0) {
        const memberOrders = await Order.aggregate([
          {
            $match: {
              tenantId: tenant._id,
              deletedAt: null,
              'customer.phoneHash': member.phoneHash,
              status: { $nin: ['cancelled'] },
            },
          },
          { $unwind: '$items' },
          {
            $match: {
              'items.menuItemId': { $in: item.linkedMenuItemIds },
              'items.itemType': 'menuItem',
            },
          },
          {
            $group: {
              _id: null,
              totalPurchased: { $sum: '$items.quantity' },
            },
          },
        ])

        const totalPurchased = memberOrders[0]?.totalPurchased || 0

        if (totalPurchased < item.minItemPurchases) {
          await session.abortTransaction()
          return NextResponse.json({
            error: 'No cumplís con las compras mínimas requeridas para canjear este premio',
            currentPurchases: totalPurchased,
            requiredPurchases: item.minItemPurchases,
          }, { status: 400 })
        }
      }

      // Calcular expiración
      const expiryHours = tenant.store.redemptionExpiryHours || 24
      const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000)

      // Crear redención
      const redemption = new StoreRedemption({
        tenantId: tenant._id,
        memberId,
        storeItemId,
        pointsUsed: item.pointsCost,
        cashValue: item.cashValue,
        status: 'pending',
        expiresAt,
      })
      await redemption.save({ session })

      // Deductir puntos del miembro
      await LoyaltyMember.updateOne(
        { _id: memberId },
        {
          $inc: {
            'loyalty.points': -item.pointsCost,
            'store.totalRedemptions': 1,
            'store.totalPointsSpent': item.pointsCost,
          },
          $set: {
            'store.lastRedemptionAt': new Date(),
          },
        },
        { session }
      )

      // Actualizar stock del item
      if (item.stock !== null) {
        await StoreItem.updateOne(
          { _id: storeItemId },
          { $inc: { stock: -1, totalRedemptions: 1 } },
          { session }
        )
      } else {
        await StoreItem.updateOne(
          { _id: storeItemId },
          { $inc: { totalRedemptions: 1 } },
          { session }
        )
      }

      await session.commitTransaction()

      // Sincronizar con wallet (async, no bloqueante)
      if (member.wallet?.googleObjectId) {
        setImmediate(async () => {
          try {
            await syncWalletPoints(memberId)
          } catch (err) {
            console.error('[Store Redemption] Error sincronizando wallet:', err)
          }
        })
      }

      return NextResponse.json({
        redemption,
        item,
        member: {
          name: member.name,
          points: member.loyalty.points - item.pointsCost,
        }
      })

    } catch (error) {
      await session.abortTransaction()
      throw error
    }

  } catch (error) {
    console.error('[Store Redemptions POST] Error:', error)
    return NextResponse.json({ error: 'Error al crear redención' }, { status: 500 })
  }
}

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

    const { searchParams } = new URL(request.url)
    const memberId = searchParams.get('memberId')
    const status = searchParams.get('status')

    if (!memberId) {
      return NextResponse.json({ error: 'Se requiere memberId' }, { status: 400 })
    }

    const query: any = { tenantId: tenant._id, memberId }
    if (status) query.status = status

    const redemptions = await StoreRedemption.find(query)
      .populate('storeItemId')
      .sort({ createdAt: -1 })
      .lean()

    return NextResponse.json({ redemptions })
  } catch (error) {
    console.error('[Store Redemptions GET] Error:', error)
    return NextResponse.json({ error: 'Error al obtener redenciones' }, { status: 500 })
  }
}
