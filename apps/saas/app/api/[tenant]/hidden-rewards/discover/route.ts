/**
 * POST /api/{tenant}/hidden-rewards/discover
 *
 * Descubre y crea un HiddenRewardClaim (reserva provisoria) al agregar un ítem al carrito.
 * La reserva dura 15 min, NO decrementa remainingClaims, NO pide teléfono.
 * El teléfono se vincula recién cuando el pedido se paga.
 *
 * Respuestas uniformes: siempre { ok: true } o { ok: false } con mismo formato/código.
 * El secreto (tipo de recompensa) solo se revela si la reserva se creó exitosamente.
 *
 * Rate limit: 10 descubrimientos por IP en 60 segundos.
 */

import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import Menu from '@/models/Menu'
import Tenant from '@/models/Tenant'
import HiddenRewardClaim from '@/models/HiddenRewardClaim'
import { rateLimit } from '@/lib/rateLimit'
import { getOrCreateDeviceId, generateSessionId } from '@/lib/hidden-rewards'

const RESERVATION_TTL_MS = 15 * 60 * 1000 // 15 minutos

// ── Respuesta uniforme ────────────────────────────────────────────────────────
function uniformResponse(success: boolean, data?: Record<string, any>): NextResponse {
  if (!success) {
    // Mismo shape y código para todo: "no disponible"
    return NextResponse.json({ ok: false }, { status: 404 })
  }
  return NextResponse.json({ ok: true, ...data })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params

    // ── DIAGNÓSTICO TEMPORAL: verificar DB en momento de request ───────────
    await connectDB()
    const envUri = (process.env.MONGODB_URI || '').substring(0, 60)
    console.log(`[HR-DISCOVER] env.MONGODB_URI="${envUri}..." conn.name="${mongoose.connection.name}" host="${mongoose.connection.host}" readyState=${mongoose.connection.readyState} tenant="${tenantSlug}"`)
    // ── FIN DIAGNÓSTICO ────────────────────────────────────────────────────

    const body = await request.json()
    const { menuItemId, locationId, sessionId } = body as {
      menuItemId?: string
      locationId?: string
      sessionId?: string
    }

    if (!menuItemId) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    // Rate limit: 10 descubrimientos por IP en 60s
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const rl = await rateLimit(`hr-discover:${tenantSlug}:${ip}`, 10, 60_000)
    if (!rl.success) {
      return NextResponse.json({ ok: false }, { status: 429 })
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      console.log(`[HR-DISCOVER-DBG] FAIL: tenant not found for slug="${tenantSlug}"`)
      return uniformResponse(false)
    }

    // ── Fingerprint del dispositivo ────────────────────────────────────────────
    const { deviceId, setCookie } = await getOrCreateDeviceId()
    const sid = sessionId || generateSessionId()

    // ── Buscar menú ───────────────────────────────────────────────────────────
    const query: any = { tenantId: tenant._id, isActive: true }
    if (locationId) query.locationId = locationId

    const menu = await Menu.findOne(query)
    if (!menu) {
      const menuCount = await Menu.countDocuments({ tenantId: tenant._id })
      console.log(`[HR-DISCOVER-DBG] FAIL: menu not found. query=${JSON.stringify({ tenantId: tenant._id.toString(), locationId, isActive: true })} menusForTenant=${menuCount}`)
      return uniformResponse(false)
    }

    // ── Buscar ítem ───────────────────────────────────────────────────────────
    let foundItem: any = null
    for (const cat of menu.categories || []) {
      for (const item of cat.items || []) {
        if (item._id?.toString() === menuItemId) {
          foundItem = item
          break
        }
      }
      if (foundItem) break
      for (const sub of cat.subcategories || []) {
        for (const item of sub.items || []) {
          if (item._id?.toString() === menuItemId) {
            foundItem = item
            break
          }
        }
        if (foundItem) break
      }
      if (foundItem) break
    }

    if (!foundItem) {
      console.log(`[HR-DISCOVER-DBG] FAIL: item not found. menuItemId="${menuItemId}" categories=${menu.categories?.length} catNames=${menu.categories?.map((c: any) => c.name).join(',')}`)
      return uniformResponse(false)
    }

    const hr = foundItem.hiddenReward
    if (!hr || !hr.enabled) {
      console.log(`[HR-DISCOVER-DBG] FAIL: hiddenReward not enabled. hr=${JSON.stringify(hr)}`)
      return uniformResponse(false)
    }

    // ── Validar vigencia ──────────────────────────────────────────────────────
    const now = new Date()
    if (hr.scheduledStart && now < hr.scheduledStart) {
      return uniformResponse(false)
    }
    if (hr.scheduledEnd && now > hr.scheduledEnd) {
      return uniformResponse(false)
    }

    // ── Validar stock (reservas activas en vez de remainingClaims) ─────────────
    // Contar reservas activas de este ítem (no decrementa pool global)
    const activeReservations = await HiddenRewardClaim.countDocuments({
      tenantId: tenant._id,
      menuItemId: foundItem._id,
      status: 'reserva',
      reservationExpiresAt: { $gt: now },
    })
    if (hr.maxClaims > 0 && activeReservations >= hr.maxClaims) {
      console.log(`[HR-DISCOVER-DBG] FAIL: stock exhausted. activeReservations=${activeReservations} maxClaims=${hr.maxClaims}`)
      return uniformResponse(false)
    }

    // ── Verificar si ya reclamó (misma sesión o mismo teléfono) ────────────────
    const existingClaim = await HiddenRewardClaim.findOne({
      tenantId: tenant._id,
      menuItemId: foundItem._id,
      $or: [
        { deviceId },                      // misma sesión dispositivo
        { customerPhoneHash: { $ne: null } }, // ya tiene teléfono vinculado
      ],
      status: { $in: ['reserva', 'pendiente', 'reservado'] },
    })

    if (existingClaim) {
      console.log(`[HR-DISCOVER-DBG] FAIL: existingClaim found. status=${existingClaim.status} deviceId=${existingClaim.deviceId}`)
      return uniformResponse(false)
    }

    // ── Crear reserva provisoria (15 min, sin tocar remainingClaims) ──────────
    const reservationExpiresAt = new Date(Date.now() + RESERVATION_TTL_MS)

    await HiddenRewardClaim.create({
      tenantId: tenant._id,
      menuItemId: foundItem._id,
      deviceId,
      customerPhoneHash: null,
      sessionId: sid,
      discountPercentage: hr.discountPercentage,
      rewardTitle: hr.title,
      rewardDescription: hr.description,
      status: 'reserva',
      discoveredAt: now,
      reservationExpiresAt,
      expiresAt: new Date(Date.now() + (hr.claimExpiryDays || 30) * 24 * 60 * 60 * 1000),
    })

    // ── Respuesta: solo revela si la reserva se creó ──────────────────────────
    const response = uniformResponse(true, {
      reward: {
        title: hr.title,
        description: hr.description,
        discountPercentage: hr.discountPercentage,
        sessionId: sid,
      },
    })

    // Adjuntar cookie si se generó
    if (setCookie) {
      response.headers.set('Set-Cookie', setCookie)
    }

    return response
  } catch (error) {
    console.error('[HR-DISCOVER-DBG] CATCH ERROR:', error instanceof Error ? error.message : String(error))
    console.error('[HR-DISCOVER-DBG] STACK:', error instanceof Error ? error.stack?.substring(0, 300) : 'N/A')
    return uniformResponse(false)
  }
}
