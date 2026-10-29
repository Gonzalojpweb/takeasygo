import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { canSeeExpectedCash } from '@takeasygo/business'
import CashRegister from '@/models/CashRegister'
import Location from '@/models/Location'
import { posRoute } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { resolvePosRole } from '@/lib/pos-online/permissions'
import { summarizeCashiers } from '@/lib/cash/cashier-summary'
import { publicOrigin, tenantSlugOf, zShareUrl } from '@/lib/cash/z-share'
import { DEFAULT_TIMEZONE, getDayAndMidnightInTimezone, getTodayStrInTimezone } from '@/lib/restaurant-time'

// ============================================================================
// GET /api/[tenant]/pos/cash/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
// ============================================================================
// Caja en el POS (informe de caja X9 / Fase K): cierres de la sede en el
// rango (zona de la sede; por defecto los últimos 30 días) con su link
// público del Z, y faltantes / sobrantes por cajero con alerta de faltantes
// recurrentes. Cierre ciego: el cajero ve sus cierres y el link, NO los
// esperados ni las diferencias (solo encargado y admin).
// ============================================================================

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
/** Faltantes en el período a partir de los cuales se marca «recurrente». */
export const RECURRENT_SHORT_CLOSES = 3

function shiftDay(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

interface ClosedDoc {
  _id: mongoose.Types.ObjectId
  posId: string
  openedAt: Date
  closedAt: Date
  openedBy: string
  closedBy: string | null
  closedByUserId: string | null
  initialAmount: number
  finalAmount: number | null
  expectedAmount: number | null
  difference: number | null
  shareToken: string | null
  zReport?: { salesTotal?: number } | null
}

export const GET = posRoute('cash.read', async (ctx) => {
  const p = new URL(ctx.request.url).searchParams
  const location = await Location.findOne({ _id: ctx.locationId, tenantId: ctx.tenantId }).select('timezone').lean<{ timezone?: string }>()
  const tz = location?.timezone || DEFAULT_TIMEZONE
  const today = getTodayStrInTimezone(tz)
  const to = p.get('to') && DATE_RE.test(p.get('to')!) ? p.get('to')! : today
  const from = p.get('from') && DATE_RE.test(p.get('from')!) ? p.get('from')! : shiftDay(to, -29)
  if (from > to) throw PosError.validation('El rango de fechas es inválido')
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 366) throw PosError.validation('El rango máximo es de un año')

  const docs = await CashRegister.find({
    tenantId: new mongoose.Types.ObjectId(ctx.tenantId),
    locationId: new mongoose.Types.ObjectId(ctx.locationId),
    status: 'closed',
    closedAt: { $gte: getDayAndMidnightInTimezone(from, tz).date, $lt: getDayAndMidnightInTimezone(shiftDay(to, 1), tz).date },
  })
    .sort({ closedAt: -1 })
    .limit(500)
    .select('posId openedAt closedAt openedBy closedBy closedByUserId initialAmount finalAmount expectedAmount difference shareToken zReport.salesTotal')
    .lean<ClosedDoc[]>()

  const seesExpected = canSeeExpectedCash(resolvePosRole(ctx.user.role))
  const slug = await tenantSlugOf(ctx.tenantId)
  const origin = publicOrigin(ctx.request.url)
  const closes = docs.map((d) => ({
    id: String(d._id),
    posId: d.posId,
    openedAt: d.openedAt,
    closedAt: d.closedAt,
    openedBy: d.openedBy,
    closedBy: d.closedBy,
    salesTotal: seesExpected ? d.zReport?.salesTotal ?? null : null,
    initialAmount: seesExpected ? d.initialAmount : null,
    finalAmount: seesExpected ? d.finalAmount : null,
    expectedAmount: seesExpected ? d.expectedAmount : null,
    difference: seesExpected ? d.difference : null,
    shareUrl: slug && d.shareToken ? zShareUrl(origin, slug, d.shareToken, d.closedAt) : null,
  }))

  const summary = seesExpected ? summarizeCashiers(docs) : null
  const alerts = summary
    ? summary.cashiers
        .filter((c) => c.shortCloses >= RECURRENT_SHORT_CLOSES)
        .map((c) => ({ name: c.name, shortCloses: c.shortCloses, shortTotal: c.shortTotal }))
    : []

  return NextResponse.json({ range: { from, to }, revenueVisible: seesExpected, closes, cashiers: summary, alerts })
})
