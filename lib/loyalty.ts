import mongoose from 'mongoose'
import LoyaltyMember from '@/models/LoyaltyMember'
import Order from '@/models/Order'
import StoreItem from '@/models/StoreItem'
import PlatformConfig from '@/models/PlatformConfig'
import { syncWalletPoints } from '@/lib/walletService'

/**
 * Calcula puntos según la configuración del tenant
 */
export function calculatePoints(orderTotal: number, pointsConfig: any): number {
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
  if (!isEnabled) return 0

  if (orderTotal < (pointsConfig.minOrderForPoints || 0)) {
    return 0
  }

  let points = 0
  const mode = pointsConfig.mode || 'fixed_per_currency'

  const pointsPerCurrency = pointsConfig.pointsPerCurrency ?? 0.1
  const pointsPercentage = pointsConfig.pointsPercentage ?? 10

  if (mode === 'fixed_per_currency') {
    points = Math.floor(orderTotal * pointsPerCurrency)
  } else if (mode === 'percentage') {
    points = Math.floor(orderTotal * pointsPercentage / 100)
  } else if (mode === 'hybrid') {
    const fromCurrency = Math.floor(orderTotal * pointsPerCurrency)
    const fromPercentage = Math.floor(orderTotal * pointsPercentage / 100)
    points = fromCurrency + fromPercentage
  }

  points += (pointsConfig.pointsPerOrder || 0)

  return Math.max(0, points)
}

/**
 * Valida y procesa los ítems de premio durante el checkout (antes del pago).
 * Verifica:
 *  - El item existe y está activo en la Store del tenant
 *  - El miembro tiene puntos suficientes (o entra en SOS)
 *  - No excede el límite SOS configurado
 * Retorna los reward items resueltos con metadata de SOS si aplica.
 */
export async function validateCheckoutRewards(
  member: any,
  rewardItemIds: string[],
  tenant: any
): Promise<{ valid: boolean; error?: string; resolved: any[] }> {
  if (!rewardItemIds || rewardItemIds.length === 0) {
    return { valid: true, resolved: [] }
  }

  const platformConfig = await PlatformConfig.findById('platform').lean() as any
  const globalSosLimit = platformConfig?.sosConfig?.globalSosLimit ?? 250

  const items = await StoreItem.find({
    _id: { $in: rewardItemIds },
    tenantId: tenant._id,
    isActive: true,
  }).lean()

  if (items.length !== rewardItemIds.length) {
    return { valid: false, error: 'Uno o más ítems de premio no están disponibles', resolved: [] }
  }

  const resolved: any[] = []
  let totalPointsNeeded = 0

  for (const item of items) {
    totalPointsNeeded += item.pointsCost
    resolved.push({
      storeItemId: item._id,
      storeItemName: item.name,
      pointsCost: item.pointsCost,
      cashValue: item.cashValue ?? null,
      sosApplied: false,
    })
  }

  const availablePoints = member.loyalty?.points ?? 0

  if (availablePoints >= totalPointsNeeded) {
    return { valid: true, resolved }
  }

  // No alcanzan los puntos → evaluar SOS
  const missingPoints = totalPointsNeeded - availablePoints
  const tenantSosLimit = tenant.loyalty?.sosLimit ?? 0
  const effectiveSosLimit = Math.min(tenantSosLimit, globalSosLimit)

  if (effectiveSosLimit <= 0 || missingPoints > effectiveSosLimit) {
    return {
      valid: false,
      error: `Te faltan ${missingPoints} puntos para canjear este premio. Límite SOS: ${effectiveSosLimit > 0 ? effectiveSosLimit : 'no disponible'}.`,
      resolved: [],
    }
  }

  if (member.sosConfig?.hasPendingSos) {
    return {
      valid: false,
      error: 'Tenés una deuda de puntos pendiente. Completá una compra para liberar tu saldo antes de canjear.',
      resolved: [],
    }
  }

  // Marcar todos como SOS
  for (const r of resolved) {
    r.sosApplied = true
  }

  return { valid: true, resolved }
}

/**
 * Procesa la deducción de puntos por ítems de premio después de confirmado el pago.
 * Si aplica SOS, el saldo queda en negativo y se marca hasPendingSos.
 * Si el miembro tenía deuda SOS previa, se descuenta sobre la deuda existente.
 */
export async function processRewardDeduction(
  order: any,
  tenant: any,
  session?: mongoose.ClientSession
) {
  if (!order.rewardItems || order.rewardItems.length === 0) return null

  const totalPointsCost = order.rewardItems.reduce((sum: number, r: any) => sum + (r.pointsCost || 0), 0)
  if (totalPointsCost <= 0) return null

  const query: any = {
    tenantId: tenant._id,
    'customer.phoneHash': order.customer.phoneHash,
    status: 'active',
  }

  const member = await LoyaltyMember.findOne(query).session(session || null)
  if (!member) return null

  const currentPoints = member.loyalty?.points ?? 0
  const hasSos = order.rewardItems.some((r: any) => r.sosApplied)

  if (hasSos) {
    // SOS: puntos quedan en negativo
    const newBalance = currentPoints - totalPointsCost

    member.loyalty.points = newBalance
    member.sosConfig.hasPendingSos = true
    member.sosConfig.sosUsed = (member.sosConfig.sosUsed || 0) + Math.abs(Math.min(0, newBalance))
    member.store.totalRedemptions = (member.store.totalRedemptions || 0) + order.rewardItems.length
    member.store.totalPointsSpent = (member.store.totalPointsSpent || 0) + totalPointsCost
    member.store.lastRedemptionAt = new Date()

    await member.save({ session })

    if (member.wallet?.googleObjectId) {
      syncWalletPoints(member._id).catch(() => {})
    }

    return member
  }

  // Sin SOS: deducción normal
  member.loyalty.points = currentPoints - totalPointsCost
  member.store.totalRedemptions = (member.store.totalRedemptions || 0) + order.rewardItems.length
  member.store.totalPointsSpent = (member.store.totalPointsSpent || 0) + totalPointsCost
  member.store.lastRedemptionAt = new Date()

  await member.save({ session })

  if (member.wallet?.googleObjectId) {
    syncWalletPoints(member._id).catch(() => {})
  }

  return member
}

/**
 * Agrega puntos a un miembro basado en una orden.
 * Si el miembro tiene deuda SOS pendiente, la deuda se descuenta primero
 * y solo el remanente se acredita como saldo positivo.
 */
export async function addPointsFromOrder(order: any, tenant: any, session?: mongoose.ClientSession, forceMemberId?: any) {
  if (order.loyaltyPointsCredited) {
    console.log(`[Loyalty] Puntos ya acreditados para la orden ${order.orderNumber}`)
    return null
  }

  if (!order.customer?.phoneHash && !forceMemberId) return null

  // Calcular puntos sobre el subtotal de items NO reward (items de venta real)
  const saleItemsTotal = order.items
    ?.filter((i: any) => i.itemType !== 'reward')
    ?.reduce((sum: number, i: any) => sum + (i.subtotal || 0), 0) ?? order.total ?? 0

  const pointsToAdd = calculatePoints(saleItemsTotal, tenant.pointsConfig)
  if (pointsToAdd <= 0) return null

  console.log(`[Loyalty] Agregando ${pointsToAdd} puntos a orden ${order.orderNumber}`)

  const query: any = {
    tenantId: tenant._id,
    status: 'active',
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

  // Liberación de deuda SOS: si el miembro debe, los puntos nuevos primero pagan la deuda
  const hasDebt = member.sosConfig?.hasPendingSos && (member.sosConfig?.sosUsed || 0) > 0

  if (hasDebt) {
    const currentDebt = member.sosConfig.sosUsed
    let remainingPoints = pointsToAdd

    // Si la deuda es <= 0, no hay deuda real
    if (currentDebt > 0) {
      if (remainingPoints >= currentDebt) {
        // Paga toda la deuda y sobran puntos
        member.sosConfig.sosUsed = 0
        member.sosConfig.hasPendingSos = false
        member.loyalty.points = remainingPoints - currentDebt
        remainingPoints = 0
      } else {
        // Paga parcialmente la deuda
        member.sosConfig.sosUsed = currentDebt - remainingPoints
        member.sosConfig.hasPendingSos = true
        member.loyalty.points = 0
        remainingPoints = 0
      }
    }

    member.cache.totalOrders = (member.cache.totalOrders || 0) + 1
    member.cache.totalSpent = (member.cache.totalSpent || 0) + (order.total ?? 0)
    member.cache.lastOrderAt = new Date()
    member.cache.updatedAt = new Date()

    await member.save({ session })
  } else {
    // Sin deuda: acumulación normal
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
        { session, upsert: false, new: true }
      )
      if (updated) member = updated
    } catch (err) {
      console.error('[Loyalty] Error actualizando miembro:', err)
      return null
    }
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

  return member
}

/**
 * Busca órdenes pagadas que no hayan sumado puntos para un miembro y las procesa.
 */
export async function reconcileMissingPoints(member: any, tenant: any, explicitlyApprovedOrderId?: any) {
  if (!tenant.loyalty?.enabled) return 0

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

  const orders = await Order.find(query)

  let totalReconciled = 0
  for (const order of orders) {
    const memberUpdated = await addPointsFromOrder(order, tenant, undefined, member._id)
    if (memberUpdated) totalReconciled++
  }

  return totalReconciled
}
