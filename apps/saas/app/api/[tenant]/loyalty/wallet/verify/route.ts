/**
 * API Endpoint: Verificar QR de Miembro del Club
 * 
 * POST /api/{tenant}/loyalty/wallet/verify
 * 
 * Usado por el staff del restaurante para escanear QR y:
 * - Verificar que el miembro existe y está activo
 * - Ver puntos actuales y nivel
 * - Ver última actividad
 * - Acumular puntos de una compra
 */

import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { syncWalletPoints } from '@/lib/walletService'
import LoyaltyMember from '@/models/LoyaltyMember'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'

/**
 * Calcula puntos según la configuración del tenant
 */
function calculatePoints(orderTotal: number, pointsConfig: any): number {
  if (!pointsConfig?.enabled || orderTotal < (pointsConfig.minOrderForPoints || 0)) {
    return 0
  }

  let points = 0
  const mode = pointsConfig.mode || 'fixed_per_currency'

  if (mode === 'fixed_per_currency') {
    points = Math.floor(orderTotal * (pointsConfig.pointsPerCurrency || 0.1))
  } else if (mode === 'percentage') {
    points = Math.floor(orderTotal * (pointsConfig.pointsPercentage || 10) / 100)
  } else if (mode === 'hybrid') {
    const fromCurrency = Math.floor(orderTotal * (pointsConfig.pointsPerCurrency || 0.1))
    const fromPercentage = Math.floor(orderTotal * (pointsConfig.pointsPercentage || 10) / 100)
    points = fromCurrency + fromPercentage
  }

  points += pointsConfig.pointsPerOrder || 0
  return Math.max(0, points)
}
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

    // Requiere autenticación de staff/admin
    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const body = await request.json()
    const { publicId, action, pointsToAdd, orderTotal } = body

    if (!publicId) {
      return NextResponse.json(
        { error: 'Se requiere publicId del miembro' },
        { status: 400 }
      )
    }

    // Buscar miembro por publicId
    const member = await LoyaltyMember.findOne({
      'wallet.publicId': publicId,
      tenantId: tenant._id
    }).lean()

    if (!member) {
      return NextResponse.json(
        { error: 'Miembro no encontrado', valid: false },
        { status: 404 }
      )
    }

    // Verificar estado
    if (member.status !== 'active') {
      return NextResponse.json({
        valid: false,
        error: `Miembro ${member.status === 'blocked' ? 'bloqueado' : 'inactivo'}`,
        member: {
          name: member.name,
          status: member.status,
          publicId: member.wallet.publicId
        }
      }, { status: 403 })
    }

    // Acción: Solo verificar
    if (!action || action === 'verify') {
      return NextResponse.json({
        valid: true,
        member: {
          id: member._id,
          name: member.name,
          phone: member.phone,
          email: member.email,
          publicId: member.wallet.publicId,
          points: member.loyalty.points,
          tier: member.loyalty.tier,
          joinedAt: member.joinedAt,
          totalOrders: member.cache?.totalOrders || 0,
          totalSpent: member.cache?.totalSpent || 0,
          lastOrderAt: member.cache?.lastOrderAt
        }
      })
    }

    // Acción: Acumular puntos (después de una compra)
    if (action === 'earn' && (pointsToAdd || orderTotal)) {
      // Calcular puntos según configuración del tenant
      const earnedPoints = pointsToAdd || calculatePoints(orderTotal, tenant.pointsConfig)
      const newPoints = member.loyalty.points + earnedPoints

      // Actualizar miembro
      await LoyaltyMember.updateOne(
        { _id: member._id },
        {
          $inc: { 'loyalty.points': earnedPoints },
          $set: { 
            'cache.lastOrderAt': new Date(),
            'cache.totalOrders': (member.cache?.totalOrders || 0) + 1,
            'cache.totalSpent': (member.cache?.totalSpent || 0) + (orderTotal || 0)
          }
        }
      )

      // Sincronizar con wallets digitales
      const syncResult = await syncWalletPoints(member._id)

      return NextResponse.json({
        valid: true,
        action: 'earn',
        earnedPoints,
        newTotal: newPoints,
        syncStatus: syncResult,
        member: {
          name: member.name,
          publicId: member.wallet.publicId,
          tier: member.loyalty.tier
        }
      })
    }

    // Acción: Canjear puntos
    if (action === 'redeem' && pointsToAdd && pointsToAdd > 0) {
      if (member.loyalty.points < pointsToAdd) {
        return NextResponse.json({
          valid: false,
          error: 'Puntos insuficientes',
          currentPoints: member.loyalty.points,
          requestedPoints: pointsToAdd
        }, { status: 400 })
      }

      const newPoints = member.loyalty.points - pointsToAdd

      await LoyaltyMember.updateOne(
        { _id: member._id },
        {
          $inc: { 'loyalty.points': -pointsToAdd }
        }
      )

      // Sincronizar
      const syncResult = await syncWalletPoints(member._id)

      return NextResponse.json({
        valid: true,
        action: 'redeem',
        redeemedPoints: pointsToAdd,
        newTotal: newPoints,
        syncStatus: syncResult,
        member: {
          name: member.name,
          publicId: member.wallet.publicId
        }
      })
    }

    return NextResponse.json(
      { error: 'Acción no válida' },
      { status: 400 }
    )

  } catch (error) {
    console.error('[Wallet Verify] Error:', error)
    return NextResponse.json(
      { error: 'Error al verificar miembro' },
      { status: 500 }
    )
  }
}

/**
 * GET: Buscar miembro por publicId (para pre-visualización)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    const { searchParams } = new URL(request.url)
    const publicId = searchParams.get('publicId')

    if (!publicId) {
      return NextResponse.json(
        { error: 'Se requiere publicId' },
        { status: 400 }
      )
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // Autenticación opcional para previsualización pública
    // (el QR escaneado por el cliente puede mostrar info básica)

    const member = await LoyaltyMember.findOne({
      'wallet.publicId': publicId,
      tenantId: tenant._id
    }).select('name loyalty.points loyalty.tier wallet.publicId status').lean()

    if (!member) {
      return NextResponse.json(
        { error: 'Miembro no encontrado' },
        { status: 404 }
      )
    }

    // Solo mostrar info básica públicamente
    return NextResponse.json({
      valid: member.status === 'active',
      member: {
        name: member.name,
        publicId: member.wallet.publicId,
        points: member.loyalty.points,
        tier: member.loyalty.tier
      }
    })

  } catch (error) {
    console.error('[Wallet Verify] GET Error:', error)
    return NextResponse.json(
      { error: 'Error al buscar miembro' },
      { status: 500 }
    )
  }
}
