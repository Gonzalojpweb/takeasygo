import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import User from '@/models/User'
import Location from '@/models/Location'
import CashRegister from '@/models/CashRegister'
import { posRoute } from '@/lib/pos-online/route'
import { resolvePosRole } from '@/lib/pos-online/permissions'

// ============================================================================
// GET /api/[tenant]/pos/me — «Mi perfil» en el POS (Fase 3), cualquier rol
// ============================================================================
// Nombre, rol, sede, cuándo se generó el PIN y mis cierres de los últimos 30
// días (turno y fecha; sin montos: el cierre es ciego para el cajero).
// ============================================================================

export const GET = posRoute('catalog.read', async (ctx) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const isUser = mongoose.isValidObjectId(ctx.user.id)
  const [user, location, closes] = await Promise.all([
    isUser
      ? User.findOne({ _id: ctx.user.id, tenantId: ctx.tenantId }).select('name role posPinUpdatedAt').lean<{ name: string; role: string; posPinUpdatedAt?: Date | null }>()
      : null,
    Location.findOne({ _id: ctx.locationId, tenantId: ctx.tenantId }).select('name').lean<{ name?: string }>(),
    isUser
      ? CashRegister.find({ tenantId: ctx.tenantId, locationId: ctx.locationId, closedByUserId: ctx.user.id, status: 'closed', closedAt: { $gte: since } })
          .sort({ closedAt: -1 })
          .limit(30)
          .select('posId openedAt closedAt shiftName shiftDate')
          .lean<{ posId: string; openedAt: Date; closedAt: Date; shiftName?: string | null; shiftDate?: string | null }[]>()
      : [],
  ])
  return NextResponse.json({
    name: user?.name ?? '',
    role: user?.role ?? ctx.user.role,
    posRole: resolvePosRole(ctx.user.role),
    locationName: location?.name ?? '',
    hasPin: Boolean(user?.posPinUpdatedAt),
    posPinUpdatedAt: user?.posPinUpdatedAt ?? null,
    closes: closes.map((c) => ({ posId: c.posId, openedAt: c.openedAt, closedAt: c.closedAt, shiftName: c.shiftName ?? null, shiftDate: c.shiftDate ?? null })),
  })
})
