import { NextRequest, NextResponse } from 'next/server'
import { isValidCalendarDate } from '@/lib/restaurant-time'
import { loadAutoCollectedByWeek, loadCommissionWeeks, weekKeyOf, weekBounds } from '@/lib/commission-weeks'
import { loadWeekTickets } from '@/lib/commission-tickets'
import { commissionsTenant } from '../../_shared'

/**
 * GET /api/{tenant}/commissions/weeks/{YYYY-MM-DD} (admin · manager · cajero)
 * Tickets explicados de cada pedido por transferencia (delivery) de la
 * semana que empieza ese lunes: qué es del restaurante, qué del envío, cuál
 * es la comisión de TakeasyGO y quién la pagó.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string; key: string }> }) {
  try {
    const { tenant: slug, key } = await params
    const ctx = await commissionsTenant(request, slug)
    if ('error' in ctx) return ctx.error
    // La clave tiene que ser un lunes válido (evita rangos arbitrarios).
    if (!isValidCalendarDate(key) || weekKeyOf(weekBounds(key, ctx.tz).weekStart, ctx.tz) !== key) {
      return NextResponse.json({ error: 'Semana inválida' }, { status: 400 })
    }
    // MercadoPago / Kripton: solo el superadmin (el comercio no lo ve).
    const isSuperadmin = ctx.role === 'superadmin'
    const [detail, weeks, auto] = await Promise.all([
      loadWeekTickets(ctx.tenant._id, key, ctx.tz),
      loadCommissionWeeks(ctx.tenant._id, { tz: ctx.tz }),
      isSuperadmin ? loadAutoCollectedByWeek(ctx.tenant._id, { tz: ctx.tz }) : null,
    ])
    const week = weeks.find((w) => w.key === key)
    return NextResponse.json(
      {
        ...detail,
        tenantName: ctx.tenant.name,
        status: week?.status ?? (detail.tickets.length ? 'pagada' : 'en_curso'),
        // Pendiente según la fuente única (incluye créditos viejos sin detalle).
        pendingCents: week?.pendingCents ?? detail.totals.pendingCents,
        ...(auto ? { autoCollected: auto.get(key) ?? { cents: 0, orders: 0 } } : {}),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('[commissions/weeks/key]', error)
    return NextResponse.json({ error: 'Error al cargar la semana' }, { status: 500 })
  }
}
