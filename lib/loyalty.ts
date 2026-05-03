import mongoose from 'mongoose'
import LoyaltyMember from '@/models/LoyaltyMember'
import Order from '@/models/Order'
import { syncWalletPoints } from '@/lib/walletService'

/**
 * Calcula puntos según la configuración del tenant
 */
export function calculatePoints(orderTotal: number, pointsConfig: any): number {
  // Si no hay configuración o está explícitamente deshabilitado el sistema de puntos, no sumamos.
  // Pero si el objeto existe, intentamos ser flexibles.
  const isEnabled = pointsConfig?.enabled === true
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
    
    // Rescate de hashes legacy: Si tenemos el teléfono encriptado de la orden, 
    // calculamos ambas versiones del hash para asegurar el match.
    if (order.customer.phone) {
      try {
        const { safeDecrypt } = require('@/lib/crypto')
        const phoneRaw = safeDecrypt(order.customer.phone)
        const digitsOnly = phoneRaw.replace(/\D/g, '')
        const legacyNumber = digitsOnly.length > 10 ? digitsOnly.slice(-10) : digitsOnly
        const legacyHash = require('crypto').createHash('sha256').update(legacyNumber).digest('hex')
        
        // También regeneramos el hash moderno por si acaso
        const modernHash = require('crypto').createHash('sha256').update(digitsOnly).digest('hex')
        
        if (!hashes.includes(legacyHash)) hashes.push(legacyHash)
        if (!hashes.includes(modernHash)) hashes.push(modernHash)
      } catch (err) {
        console.error('[Loyalty] Error desencriptando teléfono para hash fallback', err)
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
export async function reconcileMissingPoints(member: any, tenant: any) {
  if (!tenant.loyalty?.enabled) return 0

  const hashes = [member.phoneHash]
  
  if (member.phone) {
    const digitsOnly = member.phone.replace(/\D/g, '')
    const legacyNumber = digitsOnly.length > 10 ? digitsOnly.slice(-10) : digitsOnly
    const legacyHash = require('crypto').createHash('sha256').update(legacyNumber).digest('hex')
    if (!hashes.includes(legacyHash)) hashes.push(legacyHash)
  }

  // Búsqueda Ultra-Segura: Si la orden está confirmada o pagada, suma puntos.
  const orders = await Order.find({
    tenantId: tenant._id,
    'customer.phoneHash': { $in: hashes },
    loyaltyPointsCredited: { $ne: true },
    $or: [
      { 'payment.status': 'approved' },
      { status: { $in: ['confirmed', 'preparing', 'ready', 'delivered'] } }
    ]
  })

  let totalReconciled = 0
  for (const order of orders) {
    const memberUpdated = await addPointsFromOrder(order, tenant, undefined, member._id)
    if (memberUpdated) totalReconciled++
  }

  return totalReconciled
}
