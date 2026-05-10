import mongoose from 'mongoose'
import LoyaltyMember from '@/models/LoyaltyMember'
import Order from '@/models/Order'
import { syncWalletPoints } from '@/lib/walletService'

/**
 * Calcula puntos según la configuración del tenant
 */
export function calculatePoints(orderTotal: number, pointsConfig: any): number {
  // Aplicar defaults para tenants que no tienen pointsConfig (creados antes del schema)
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

  // Si no hay configuración o está explícitamente deshabilitado el sistema de puntos, no sumamos.
  // Pero si el objeto existe, intentamos ser flexibles.
  const isEnabled = pointsConfig?.enabled === true || pointsConfig?.enabled === 'true'
  if (!isEnabled) return 0

  if (orderTotal < (pointsConfig.minOrderForPoints || 0)) {
    return 0
  }

  let points = 0
  const mode = pointsConfig.mode || 'fixed_per_currency'
  
  // Safe defaults: Si no hay valores, usamos 0.1 (1 punto cada $10) como base
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

  // Sumar puntos fijos por pedido si está configurado
  points += (pointsConfig.pointsPerOrder || 0)

  return Math.max(0, points)
}

/**
 * Agrega puntos a un miembro basado en una orden
 */
export async function addPointsFromOrder(order: any, tenant: any, session?: mongoose.ClientSession, forceMemberId?: any) {
  // Evitar duplicados si ya se acreditaron puntos
  if (order.loyaltyPointsCredited) {
    console.log(`[Loyalty] Puntos ya acreditados para la orden ${order.orderNumber}`)
    return null
  }

  if (!order.customer?.phoneHash && !forceMemberId) return null

  const pointsToAdd = calculatePoints(order.total ?? 0, tenant.pointsConfig)
  if (pointsToAdd <= 0) return null

  console.log(`[Loyalty] Agregando ${pointsToAdd} puntos a orden ${order.orderNumber}`)

  // Construir query robusta para encontrar al miembro
  const query: any = {
    tenantId: tenant._id,
    status: 'active',
  }

  if (forceMemberId) {
    query._id = forceMemberId
  } else {
    const hashes = [order.customer.phoneHash]
    
    // Rescate de hashes: Calculamos múltiples variantes para asegurar el match 
    // entre miembros antiguos (con prefijos) y órdenes nuevas (normalizadas).
    if (order.customer.phone) {
      try {
        const { safeDecrypt } = require('@/lib/crypto')
        const phoneRaw = safeDecrypt(order.customer.phone)
        const digits = phoneRaw.replace(/\D/g, '')
        
        // 1. Versión con + (Legacy principal)
        const hashWithPlus = require('crypto').createHash('sha256').update('+' + digits).digest('hex')
        // 2. Versión solo dígitos (Moderno intermedio)
        const hashDigits = require('crypto').createHash('sha256').update(digits).digest('hex')
        // 3. Versión 10 dígitos (Nuevo Estándar)
        const last10 = digits.length >= 10 ? digits.slice(-10) : digits
        const hash10 = require('crypto').createHash('sha256').update(last10).digest('hex')
        
        if (!hashes.includes(hashWithPlus)) hashes.push(hashWithPlus)
        if (!hashes.includes(hashDigits)) hashes.push(hashDigits)
        if (!hashes.includes(hash10)) hashes.push(hash10)
      } catch (err) {
        console.error('[Loyalty] Error generando variantes de hash para búsqueda', err)
      }
    }
    
    query.phoneHash = { $in: hashes.filter(Boolean) }
  }

  // 1. Actualizar el miembro
  let member: any = null
  try {
    member = await LoyaltyMember.findOneAndUpdate(
      query,
      {
        $inc: {
          'cache.totalOrders': 1,
          'cache.totalSpent':  order.total ?? 0,
          'loyalty.points': pointsToAdd,
        },
        $set: {
          'cache.lastOrderAt': new Date(),
          'cache.updatedAt':  new Date(),
        },
      },
      { session, upsert: false, new: true }
    )
  } catch (err) {
    console.error('[Loyalty] Error actualizando miembro:', err)
    return null
  }

  // 2. Marcar la orden como procesada para lealtad
  if (member) {
    await Order.updateOne(
      { _id: order._id },
      { $set: { loyaltyPointsCredited: true } },
      { session }
    )
    
    // Actualizar el objeto local por si se usa después en la misma ejecución
    order.loyaltyPointsCredited = true

    // 3. Sincronizar asíncronamente con la billetera
    if (pointsToAdd > 0 && member.wallet?.googleObjectId) {
      setImmediate(async () => {
        try {
          await syncWalletPoints(member._id)
          console.log(`[Loyalty] Wallet sincronizada para miembro ${member._id}`)
        } catch (err) {
          console.error('[Loyalty] Error sincronizando wallet:', err)
        }
      })
    }
  }

  return member
}

/**
 * Busca órdenes pagadas que no hayan sumado puntos para un miembro y las procesa.
 * Esto sirve como "fail-safe" si el webhook falló o fue muy rápido.
 */
export async function reconcileMissingPoints(member: any, tenant: any, explicitlyApprovedOrderId?: any) {
  if (!tenant.loyalty?.enabled) return 0

  const hashes = [member.phoneHash]
  
  if (member.phone) {
    const digits = member.phone.replace(/\D/g, '')
    const crypto = require('crypto')
    
    // Variante 1: Con +
    const hashPlus = crypto.createHash('sha256').update('+' + digits).digest('hex')
    // Variante 2: Solo dígitos
    const hashDigits = crypto.createHash('sha256').update(digits).digest('hex')
    // Variante 3: 10 dígitos (Nuevo Estándar)
    const last10 = digits.length >= 10 ? digits.slice(-10) : digits
    const hash10 = crypto.createHash('sha256').update(last10).digest('hex')

    if (!hashes.includes(hashPlus)) hashes.push(hashPlus)
    if (!hashes.includes(hashDigits)) hashes.push(hashDigits)
    if (!hashes.includes(hash10)) hashes.push(hash10)
  }

  // Búsqueda Ultra-Segura: Si la orden está confirmada o pagada en DB, suma puntos.
  // También sumamos si explicitlyApprovedOrderId coincide (MP aprobó en URL pero webhook demoró)
  const orConditions: any[] = [
    { 'payment.status': 'approved' },
    { status: { $in: ['confirmed', 'preparing', 'ready', 'delivered'] } }
  ]
  if (explicitlyApprovedOrderId) {
    orConditions.push({ _id: explicitlyApprovedOrderId })
  }

  const orders = await Order.find({
    tenantId: tenant._id,
    'customer.phoneHash': { $in: hashes },
    loyaltyPointsCredited: { $ne: true },
    $or: orConditions
  })

  let totalReconciled = 0
  for (const order of orders) {
    const memberUpdated = await addPointsFromOrder(order, tenant, undefined, member._id)
    if (memberUpdated) totalReconciled++
  }

  return totalReconciled
}

/**
 * Deduce puntos de un miembro basado en una orden que aplicó descuento por lealtad.
 * Esta operación debe ser atómica y ejecutarse usualmente tras la aprobación del pago.
 */
export async function deductPointsFromOrder(order: any, tenant: any, session?: mongoose.ClientSession) {
  if (!order.loyaltyPointsUsed || order.loyaltyPointsUsed <= 0) return null

  // Evitar doble deducción si ya se marcaron como deducidos (podríamos agregar un flag loyaltyPointsDeducted)
  // Por ahora confiamos en la lógica del webhook que valida el estado de la orden.

  const query: any = {
    tenantId: tenant._id,
    'customer.phoneHash': order.customer.phoneHash,
    status: 'active',
  }

  console.log(`[Loyalty] Deduciendo ${order.loyaltyPointsUsed} puntos de la orden ${order.orderNumber}`)

  try {
    const member = await LoyaltyMember.findOneAndUpdate(
      query,
      {
        $inc: {
          'loyalty.points': -order.loyaltyPointsUsed,
        },
      },
      { session, new: true }
    )

    if (member && member.wallet?.googleObjectId) {
      setImmediate(async () => {
        try {
          await syncWalletPoints(member._id)
          console.log(`[Loyalty] Wallet sincronizada tras deducción para miembro ${member._id}`)
        } catch (err) {
          console.error('[Loyalty] Error sincronizando wallet tras deducción:', err)
        }
      })
    }

    return member
  } catch (err) {
    console.error('[Loyalty] Error deduciendo puntos:', err)
    return null
  }
}
