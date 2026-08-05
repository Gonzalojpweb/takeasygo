import mongoose from 'mongoose'
import LoyaltyMember from '@/models/LoyaltyMember'
import LocationLoyaltyConfig from '@/models/LocationLoyaltyConfig'
import Order from '@/models/Order'
import StoreItem from '@/models/StoreItem'
import StoreRedemption from '@/models/StoreRedemption'
import { syncWalletPoints } from '@/lib/walletService'

/**
 * Get the loyalty points config for a specific location.
 * When perLocation is enabled on the tenant, returns the LocationLoyaltyConfig.
 * Otherwise falls back to tenant.pointsConfig.
 */
export async function getPointsConfigForLocation(
  tenant: any,
  locationId?: mongoose.Types.ObjectId | string | null
): Promise<any> {
  const perLocation = tenant.loyalty?.perLocation === true
  if (!perLocation || !locationId) {
    return tenant.pointsConfig
  }
  const config = await LocationLoyaltyConfig.findOne({ locationId }).lean()
  return config?.pointsConfig || tenant.pointsConfig
}

export function calculatePointsBreakdown(orderTotal: number, pointsConfig: any): { basePoints: number; microBonus: number; total: number } {
  if (!pointsConfig) {
    pointsConfig = {
      enabled: true,
      mode: 'fixed_per_currency',
      pointsPerCurrency: 0.1,
      pointsPercentage: 10,
      pointsPerOrder: 0,
      minOrderForPoints: 0,
    }
  }

  const isEnabled = pointsConfig?.enabled === true || pointsConfig?.enabled === 'true'
  if (!isEnabled) return { basePoints: 0, microBonus: 0, total: 0 }

  if (orderTotal < (pointsConfig.minOrderForPoints || 0)) {
    return { basePoints: 0, microBonus: 0, total: 0 }
  }

  const mode = pointsConfig.mode || 'fixed_per_currency'
  const pointsPerCurrency = pointsConfig.pointsPerCurrency ?? 0.1
  const pointsPercentage = pointsConfig.pointsPercentage ?? 10

  let rawBase = 0
  if (mode === 'fixed_per_currency') {
    rawBase = orderTotal * pointsPerCurrency
  } else if (mode === 'percentage') {
    rawBase = orderTotal * pointsPercentage / 100
  } else if (mode === 'hybrid') {
    rawBase = (orderTotal * pointsPerCurrency) + (orderTotal * pointsPercentage / 100)
  }

  const basePoints = Math.floor(rawBase)
  const fractionalRemainder = rawBase - basePoints

  // El micro-bonus es el residuo flotante redondeado, aplicando el factor asimétrico 0.0575
  // para que el saldo nunca quede en cero redondo y se sienta como un "premio sorpresa"
  const microBonusRaw = fractionalRemainder * 0.0575
  const microBonus = Math.max(1, Math.round(microBonusRaw * 100)) > 50 ? Math.ceil(fractionalRemainder) : Math.floor(fractionalRemainder)
  // Si el residuo es significativo (≥0.5), se premia con 1 punto extra; si no, 0
  const microBonusFinal = microBonus > 0 ? microBonus : (fractionalRemainder >= 0.5 ? 1 : 0)

  const fixedPoints = pointsConfig.pointsPerOrder || 0
  const total = basePoints + microBonusFinal + fixedPoints

  return {
    basePoints,
    microBonus: microBonusFinal,
    total: Math.max(0, total),
  }
}

export function calculatePoints(orderTotal: number, pointsConfig: any): number {
  return calculatePointsBreakdown(orderTotal, pointsConfig).total
}

export async function validateCheckoutRewards(
  member: any,
  rewardItemIds: string[],
  loyaltyPointsRequired: number,
  tenant: any
): Promise<{ valid: boolean; error?: string; resolved: any[]; microSosRequired?: boolean }> {
  if (!rewardItemIds || rewardItemIds.length === 0) {
    return { valid: true, resolved: [] }
  }
  if (loyaltyPointsRequired <= 0) {
    return { valid: false, error: 'Puntos requeridos inválidos', resolved: [] }
  }

  const items = await StoreItem.find({
    _id: { $in: rewardItemIds },
    tenantId: tenant._id,
    isActive: true,
    $or: [
      { locationId: null },
      { locationId: { $exists: false } },
    ],
  }).lean()

  if (items.length !== rewardItemIds.length) {
    return { valid: false, error: 'Uno o más ítems de premio no están disponibles', resolved: [] }
  }

  const resolved: any[] = []
  let dbTotalPointsCost = 0

  for (const item of items) {
    dbTotalPointsCost += item.pointsCost
    resolved.push({
      storeItemId: item._id,
      storeItemName: item.name,
      pointsCost: item.pointsCost,
      cashValue: item.cashValue ?? null,
    })
  }

  // Cross-check: lo que el cliente dice que gasta debe coincidir con la DB
  if (dbTotalPointsCost !== loyaltyPointsRequired) {
    return {
      valid: false,
      error: `El costo en puntos no coincide: la DB indica ${dbTotalPointsCost}, el cliente indicó ${loyaltyPointsRequired}.`,
      resolved: [],
    }
  }

  const projectedBalance = (member.loyalty?.points ?? 0) - loyaltyPointsRequired

  // Tiene puntos de sobra — sin advance, sin micro-SOS
  if (projectedBalance > 0) {
    return { valid: true, resolved }
  }

  // Tiene exactamente los puntos necesarios — sin advance explícito,
  // pero se aplicará micro-SOS para forzar retorno
  if (projectedBalance === 0) {
    return { valid: true, resolved, microSosRequired: true }
  }

  // No alcanzan: evaluar Reward Advance (antes llamado SOS)
  const missingPoints = Math.abs(projectedBalance)
  const sosMaxLimit = tenant.loyalty?.sosMaxLimit ?? 0
  const effectiveAdvanceLimit = Math.min(tenant.loyalty?.sosLimit ?? 0, sosMaxLimit)

  if (effectiveAdvanceLimit <= 0 || missingPoints > effectiveAdvanceLimit) {
    return {
      valid: false,
      error: `Te faltan ${missingPoints} puntos para canjear este premio. Límite de adelanto: ${effectiveAdvanceLimit > 0 ? effectiveAdvanceLimit : 'no disponible'}.`,
      resolved: [],
    }
  }

  if (member.sosConfig?.hasPendingSos) {
    return {
      valid: false,
      error: 'Tenés un adelanto de puntos pendiente. Completá una compra para consolidar tu saldo antes de canjear.',
      resolved: [],
    }
  }

  return { valid: true, resolved }
}

export async function processRewardDeduction(
  order: any,
  tenant: any,
  session?: mongoose.ClientSession
) {
  if (!order.rewardItems || order.rewardItems.length === 0) return null

  if (order.rewardDeductionProcessed) {
    console.log(`[Loyalty] Reward deduction ya procesado para la orden ${order.orderNumber}`)
    return null
  }

  const totalPointsCost = order.rewardItems.reduce((sum: number, r: any) => sum + (r.pointsCost || 0), 0)
  if (totalPointsCost <= 0) return null

  const query: any = {
    tenantId: tenant._id,
    phoneHash: order.customer.phoneHash,
    status: 'active',
  }

  // Per-location: scope member lookup by locationId from the order
  const perLocation = tenant.loyalty?.perLocation === true
  if (perLocation && order.locationId) {
    query.locationId = order.locationId
  }

  const member = await LoyaltyMember.findOne(query).session(session || null)
  if (!member) return null

  const currentPoints = member.loyalty?.points ?? 0
  const newBalance = currentPoints - totalPointsCost
  const isAdvance = order.rewardAdvanceApplied === true

  // Micro-SOS: si el saldo queda en exactamente 0 y no se usó SOS explícito,
  // forzar un adelanto pequeño para que el miembro siempre tenga deuda que consolidar
  if (newBalance === 0 && !isAdvance) {
    const sosLimit = tenant.loyalty?.sosLimit ?? 250
    const microSosAmount = Math.min(Math.ceil(totalPointsCost * 0.2), sosLimit)

    member.loyalty.points = -microSosAmount
    member.sosConfig.hasPendingSos = true
    member.sosConfig.sosUsed = microSosAmount
    order.rewardAdvanceApplied = true
    order.rewardAdvanceAmount = microSosAmount
  } else if (isAdvance) {
    member.loyalty.points = newBalance
    member.sosConfig.hasPendingSos = true
    member.sosConfig.sosUsed = (member.sosConfig.sosUsed || 0) + Math.abs(Math.min(0, newBalance))
  } else {
    member.loyalty.points = newBalance
  }

  member.store.totalRedemptions = (member.store.totalRedemptions || 0) + order.rewardItems.length
  member.store.totalPointsSpent = (member.store.totalPointsSpent || 0) + totalPointsCost
  member.store.lastRedemptionAt = new Date()

  await member.save({ session })

  order.rewardDeductionProcessed = true

  if (member.wallet?.googleObjectId) {
    syncWalletPoints(member._id).catch(() => {})
  }

  return member
}

/**
 * Revert reward redemptions when an order is cancelled or payment fails.
 * - Cancels pending StoreRedemption records (matched by memberId + storeItemId)
 * - Restores StoreItem stock
 * - If points were already deducted (rewardDeductionProcessed), restores them
 */
export async function revertRewardRedemptions(order: any, tenant: any, session?: mongoose.ClientSession) {
  if (!order.rewardItems || order.rewardItems.length === 0) return

  // Find the loyalty member to match pending redemptions
  if (!order.customer?.phoneHash) return

  const query: any = {
    tenantId: tenant._id,
    phoneHash: order.customer.phoneHash,
    status: 'active',
  }
  const perLocation = tenant.loyalty?.perLocation === true
  if (perLocation && order.locationId) {
    query.locationId = order.locationId
  }
  const member = await LoyaltyMember.findOne(query).session(session || null)
  if (!member) return

  // 1. Cancel pending StoreRedemptions for this member + store items
  const storeItemIds = order.rewardItems.map((r: any) => r.storeItemId).filter(Boolean)
  if (storeItemIds.length > 0) {
    const redemptionResult = await StoreRedemption.updateMany(
      {
        memberId: member._id,
        storeItemId: { $in: storeItemIds },
        status: 'pending',
      },
      { $set: { status: 'cancelled' } },
      { session }
    )
    if (redemptionResult.modifiedCount > 0) {
      console.log(`[Loyalty] Reverted ${redemptionResult.modifiedCount} StoreRedemptions for order ${order.orderNumber}`)
    }
  }

  // 2. Restore StoreItem stock
  for (const reward of order.rewardItems) {
    if (reward.storeItemId) {
      await StoreItem.updateOne(
        { _id: reward.storeItemId },
        { $inc: { stock: 1, totalRedemptions: -1 } },
        { session }
      )
    }
  }

  // 3. If points were already deducted, restore them
  if (order.rewardDeductionProcessed) {
    const pointsToRestore = order.rewardItems.reduce(
      (sum: number, r: any) => sum + (r.pointsCost || 0), 0
    )
    member.loyalty.points = (member.loyalty.points ?? 0) + pointsToRestore
    member.store.totalRedemptions = Math.max(0, (member.store.totalRedemptions || 0) - order.rewardItems.length)
    member.store.totalPointsSpent = Math.max(0, (member.store.totalPointsSpent || 0) - pointsToRestore)
    await member.save({ session })
    console.log(`[Loyalty] Restored ${pointsToRestore} points to member ${member._id} for cancelled order ${order.orderNumber}`)

    order.rewardDeductionProcessed = false
    await order.save({ session })
  }
}

export async function addPointsFromOrder(order: any, tenant: any, session?: mongoose.ClientSession, forceMemberId?: any) {
  if (order.loyaltyPointsCredited) {
    console.log(`[Loyalty] Puntos ya acreditados para la orden ${order.orderNumber}`)
    return null
  }

  const locationId = order.locationId || null
  const pointsConfig = await getPointsConfigForLocation(tenant, locationId)

  // B11: Si no hay phoneHash (usuario solo email), no rendirse — buscar por email
  if (!order.customer?.phoneHash && !forceMemberId) {
    if (!order.customer?.email) return null
    try {
      const { safeDecrypt } = require('@/lib/crypto')
      const emailRaw = safeDecrypt(order.customer.email).toLowerCase().trim()
      if (!emailRaw) return null

      const memberQuery: any = {
        tenantId: tenant._id,
        email: emailRaw,
        status: 'active',
      }
      // Per-location: scope by locationId
      const perLocation = tenant.loyalty?.perLocation === true
      if (perLocation && locationId) {
        memberQuery.locationId = locationId
      }

      const member = await LoyaltyMember.findOne(memberQuery).session(session || null)

      if (!member) return null

      const pointsToAdd = calculatePoints(
        order.items?.filter((i: any) => i.itemType !== 'reward')?.reduce((sum: number, i: any) => sum + (i.subtotal || 0), 0) ?? order.total ?? 0,
        pointsConfig,
      )
      if (pointsToAdd <= 0) return null

      await LoyaltyMember.updateOne(
        { _id: member._id },
        {
          $inc: { 'loyalty.points': pointsToAdd, 'cache.totalOrders': 1, 'cache.totalSpent': order.total ?? 0 },
          $set: { 'cache.lastOrderAt': new Date(), 'cache.updatedAt': new Date() },
        },
        { session }
      )

      await Order.updateOne({ _id: order._id }, { $set: { loyaltyPointsCredited: true } }, { session })
      order.loyaltyPointsCredited = true

      if (member.wallet?.googleObjectId) {
        setImmediate(() => { syncWalletPoints(member._id).catch(() => {}) })
      }

      return { member, breakdown: { basePoints: pointsToAdd, microBonus: 0, total: pointsToAdd }, consolidated: false }
    } catch {
      return null
    }
  }

  if (!order.customer?.phoneHash && !forceMemberId) return null

  const saleItemsTotal = order.items
    ?.filter((i: any) => i.itemType !== 'reward')
    ?.reduce((sum: number, i: any) => sum + (i.subtotal || 0), 0) ?? order.total ?? 0

  const breakdown = calculatePointsBreakdown(saleItemsTotal, pointsConfig)
  const pointsToAdd = breakdown.total
  if (pointsToAdd <= 0) return null

  console.log(`[Loyalty] Agregando ${pointsToAdd} puntos (base:${breakdown.basePoints}, bonus:${breakdown.microBonus}) a orden ${order.orderNumber}`)

  const query: any = {
    tenantId: tenant._id,
    status: 'active',
  }

  // Per-location: scope member lookup by locationId
  const perLocation = tenant.loyalty?.perLocation === true
  if (perLocation && locationId) {
    query.locationId = locationId
  }

  if (forceMemberId) {
    query._id = forceMemberId
  } else {
    const hashes = [order.customer.phoneHash]

    if (order.customer.phone) {
      try {
        const { safeDecrypt } = require('@/lib/crypto')
        const phoneRaw = safeDecrypt(order.customer.phone)
        const digits = phoneRaw.replace(/\D/g, '')

        const hashWithPlus = require('crypto').createHash('sha256').update('+' + digits).digest('hex')
        const hashDigits = require('crypto').createHash('sha256').update(digits).digest('hex')
        const last10 = digits.length >= 10 ? digits.slice(-10) : digits
        const hash10 = require('crypto').createHash('sha256').update(last10).digest('hex')

        if (!hashes.includes(hashWithPlus)) hashes.push(hashWithPlus)
        if (!hashes.includes(hashDigits)) hashes.push(hashDigits)
        if (!hashes.includes(hash10)) hashes.push(hash10)
      } catch (err) {
        console.error('[Loyalty] Error generando variantes de hash para búsqueda', err)
      }
    }

    const orConditions: any[] = [
      { phoneHash: { $in: hashes.filter(Boolean) } }
    ]

    if (order.customer.email) {
      try {
        const { safeDecrypt } = require('@/lib/crypto')
        const emailRaw = safeDecrypt(order.customer.email).toLowerCase().trim()
        if (emailRaw) orConditions.push({ email: emailRaw })
      } catch (err) {
        console.error('[Loyalty] Error desencriptando email para búsqueda de miembro', err)
      }
    }

    query.$or = orConditions
  }

  let member: any = null
  try {
    member = await LoyaltyMember.findOne(query).session(session || null)
  } catch {
    return null
  }

  if (!member) return null

  const hasDebt = member.sosConfig?.hasPendingSos && (member.sosConfig?.sosUsed || 0) > 0

  let consolidated = false

  if (hasDebt) {
    const currentDebt = member.sosConfig.sosUsed
    let remainingPoints = pointsToAdd

    if (currentDebt > 0) {
      if (remainingPoints >= currentDebt) {
        member.sosConfig.sosUsed = 0
        member.sosConfig.hasPendingSos = false
        member.loyalty.points = remainingPoints - currentDebt
        remainingPoints = 0
        consolidated = true
      } else {
        member.sosConfig.sosUsed = currentDebt - remainingPoints
        member.sosConfig.hasPendingSos = true
        member.loyalty.points = 0
        remainingPoints = 0
        consolidated = true
      }
    }

    member.cache.totalOrders = (member.cache.totalOrders || 0) + 1
    member.cache.totalSpent = (member.cache.totalSpent || 0) + (order.total ?? 0)
    member.cache.lastOrderAt = new Date()
    member.cache.updatedAt = new Date()

    await member.save({ session })
  } else {
    try {
      const updated = await LoyaltyMember.findOneAndUpdate(
        { _id: member._id },
        {
          $inc: {
            'cache.totalOrders': 1,
            'cache.totalSpent': order.total ?? 0,
            'loyalty.points': pointsToAdd,
          },
          $set: {
            'cache.lastOrderAt': new Date(),
            'cache.updatedAt': new Date(),
          },
        },
        { session, upsert: false, returnDocument: "after" }
      )
      if (updated) member = updated
    } catch (err) {
      console.error('[Loyalty] Error actualizando miembro:', err)
      return null
    }
  }

  // Auto-liberar hasPendingSos si el saldo cruzó a >= 0 (en caso de que estuviera en deuda
  // y la inyección de puntos lo haya dejado en positivo o cero)
  if (member.sosConfig?.hasPendingSos && member.loyalty?.points >= 0) {
    member.sosConfig.hasPendingSos = false
    member.sosConfig.sosUsed = 0
    consolidated = true
    await member.save({ session })
  }

  await Order.updateOne(
    { _id: order._id },
    { $set: { loyaltyPointsCredited: true } },
    { session }
  )

  order.loyaltyPointsCredited = true

  if (member && member.wallet?.googleObjectId) {
    setImmediate(async () => {
      try {
        await syncWalletPoints(member._id)
      } catch (err) {
        console.error('[Loyalty] Error sincronizando wallet:', err)
      }
    })
  }

  return { member, breakdown, consolidated }
}

export async function reconcileMissingPoints(member: any, tenant: any, explicitlyApprovedOrderId?: any) {
  if (!tenant.loyalty?.enabled) return { totalReconciled: 0, anyConsolidated: false }

  const hashes = [member.phoneHash]

  if (member.phone) {
    const digits = member.phone.replace(/\D/g, '')
    const crypto = require('crypto')

    const hashPlus = crypto.createHash('sha256').update('+' + digits).digest('hex')
    const hashDigits = crypto.createHash('sha256').update(digits).digest('hex')
    const last10 = digits.length >= 10 ? digits.slice(-10) : digits
    const hash10 = crypto.createHash('sha256').update(last10).digest('hex')

    if (!hashes.includes(hashPlus)) hashes.push(hashPlus)
    if (!hashes.includes(hashDigits)) hashes.push(hashDigits)
    if (!hashes.includes(hash10)) hashes.push(hash10)
  }

  const orConditions: any[] = [
    { 'payment.status': 'approved' },
    { status: { $in: ['confirmed', 'preparing', 'ready', 'delivered'] } }
  ]
  if (explicitlyApprovedOrderId) {
    orConditions.push({ _id: explicitlyApprovedOrderId })
  }

  const query: any = {
    tenantId: tenant._id,
    loyaltyPointsCredited: { $ne: true },
    $or: orConditions,
    $and: [
      {
        $or: [
          { 'customer.phoneHash': { $in: hashes } },
          { email: member.email ? member.email.toLowerCase().trim() : '___never___' }
        ]
      }
    ]
  }

  // Per-location: scope order query by member's locationId
  const perLocation = tenant.loyalty?.perLocation === true
  if (perLocation && member.locationId) {
    query.locationId = member.locationId
  }

  const orders = await Order.find({ ...query, deletedAt: null })

  let totalReconciled = 0
  let anyConsolidated = false
  for (const order of orders) {
    const result = await addPointsFromOrder(order, tenant, undefined, member._id)
    if (result) {
      totalReconciled++
      if (result.consolidated) anyConsolidated = true
    }
  }

  return { totalReconciled, anyConsolidated }
}
