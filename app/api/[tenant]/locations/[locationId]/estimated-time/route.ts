/**
 * API Endpoint: Cálculo y Ajuste de Tiempo Estimado Anti-Gaming
 * 
 * GET: Obtener cálculo óptimo (solo lectura, no aplica)
 * POST: Forzar recálculo y aplicar ajuste (admin only)
 * PATCH: Validar propuesta manual (detecta intentos de gaming)
 */

import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireAdminRole } from '@/lib/apiAuth'
import { 
  calculateOptimalEstimatedTime, 
  applyOptimalEstimatedTime,
  detectGamingAttempt 
} from '@/lib/estimatedTimeEngine'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import mongoose from 'mongoose'

// ── GET: Obtener cálculo óptimo sin aplicar ─────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; locationId: string }> }
) {
  try {
    const { tenant: tenantSlug, locationId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // Requiere autenticación (cualquier rol del tenant)
    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const location = await Location.findOne({
      _id: new mongoose.Types.ObjectId(locationId),
      tenantId: tenant._id
    })

    if (!location) {
      return NextResponse.json({ error: 'Ubicación no encontrada' }, { status: 404 })
    }

    // Calcular tiempo óptimo (solo lectura, no aplica cambios)
    const calculation = await calculateOptimalEstimatedTime(locationId, tenant._id)

    return NextResponse.json({
      current: location.settings?.estimatedPickupTime ?? 20,
      calculated: calculation,
      canApply: calculation.method === 'auto_optimized',
      gamingWarning: calculation.method === 'default_fallback' 
        ? 'Datos insuficientes para cálculo anti-gaming' 
        : null
    })

  } catch (error) {
    console.error('[EstimatedTime API] GET error:', error)
    return NextResponse.json(
      { error: 'Error al calcular tiempo estimado' }, 
      { status: 500 }
    )
  }
}

// ── POST: Forzar recálculo y aplicar ajuste ────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; locationId: string }> }
) {
  try {
    const { tenant: tenantSlug, locationId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // Solo admin puede forzar ajustes
    const roleError = await requireAdminRole(request, tenant._id.toString())
    if (roleError) return roleError

    const location = await Location.findOne({
      _id: new mongoose.Types.ObjectId(locationId),
      tenantId: tenant._id
    })

    if (!location) {
      return NextResponse.json({ error: 'Ubicación no encontrada' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const forceRecalc = body?.force === true

    // Calcular tiempo óptimo
    const calculation = await calculateOptimalEstimatedTime(
      locationId, 
      tenant._id,
      { forceRecalc, triggeredBy: 'admin_request' }
    )

    // Si no hay datos suficientes, no permitir aplicar
    if (calculation.method === 'default_fallback') {
      return NextResponse.json({
        error: 'Datos insuficientes',
        message: `Se requieren al menos ${10} pedidos completados para calcular el tiempo óptimo. Actualmente hay ${calculation.sampleSize}.`,
        calculation
      }, { status: 400 })
    }

    // Aplicar ajuste
    const result = await applyOptimalEstimatedTime(
      locationId,
      tenant._id,
      calculation,
      'admin_request'
    )

    if (!result.success) {
      return NextResponse.json(
        { error: 'Error al aplicar ajuste', details: result.error },
        { status: 500 }
      )
    }

    // Obtener historial actualizado
    const updatedLocation = await Location.findById(locationId)
    const history = updatedLocation?.settings?.adjustmentHistory?.slice(-5) ?? []

    return NextResponse.json({
      success: true,
      applied: result.log !== undefined,
      calculation,
      adjustmentLog: result.log,
      recentHistory: history,
      message: result.log 
        ? `Tiempo ajustado de ${result.log.previousValue} a ${result.log.newValue} minutos`
        : 'No se requirió ajuste (cambio menor a 2 minutos)'
    })

  } catch (error) {
    console.error('[EstimatedTime API] POST error:', error)
    return NextResponse.json(
      { error: 'Error al aplicar ajuste de tiempo' },
      { status: 500 }
    )
  }
}

// ── PATCH: Validar propuesta manual (anti-gaming detection) ─────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; locationId: string }> }
) {
  try {
    const { tenant: tenantSlug, locationId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // Solo admin puede proponer cambios manuales
    const roleError = await requireAdminRole(request, tenant._id.toString())
    if (roleError) return roleError

    const body = await request.json().catch(() => ({}))
    const proposedTime = body?.estimatedPickupTime

    if (typeof proposedTime !== 'number' || proposedTime < 1 || proposedTime > 120) {
      return NextResponse.json(
        { error: 'Tiempo propuesto inválido. Debe estar entre 1 y 120 minutos.' },
        { status: 400 }
      )
    }

    // Detectar posible intento de gaming
    const gamingCheck = await detectGamingAttempt(locationId, tenant._id, proposedTime)

    if (gamingCheck.isSuspicious) {
      return NextResponse.json({
        warning: 'Posible intento de manipulación detectado',
        reason: gamingCheck.reason,
        proposedTime,
        recommendedTime: gamingCheck.recommendedTime,
        confidence: gamingCheck.confidence,
        allowed: false,
        suggestion: 'Use el cálculo automático o ajuste el tiempo dentro del rango recomendado.'
      }, { status: 403 })
    }

    // Si pasa la validación, permitir cambio manual
    return NextResponse.json({
      allowed: true,
      proposedTime,
      confidence: gamingCheck.confidence,
      message: 'Tiempo propuesto dentro de rangos aceptables.'
    })

  } catch (error) {
    console.error('[EstimatedTime API] PATCH error:', error)
    return NextResponse.json(
      { error: 'Error al validar tiempo propuesto' },
      { status: 500 }
    )
  }
}
