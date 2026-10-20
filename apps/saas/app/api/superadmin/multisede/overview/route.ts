import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { buildReadiness } from '@/lib/multisede-readiness'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    await connectDB()
    const db = mongoose.connection.db
    if (!db) return NextResponse.json({ error: 'Sin conexión a la base' }, { status: 503 })

    const dias = Math.min(90, Math.max(1, Number(request.nextUrl.searchParams.get('dias')) || 7))
    const since = new Date(Date.now() - dias * 86_400_000)

    const tenants = await db.collection('tenants')
      .find({ isActive: true }, {
        projection: {
          slug: 1,
          name: 1,
          flags: 1,
          timezone: 1,
          plan: 1,
          'mpAccounts.isActive': 1,
          'mpAccounts.accessToken': 1,
          'mercadopago.isConfigured': 1,
          'mercadopago.accessToken': 1,
        },
      })
      .sort({ name: 1 })
      .toArray()

    const results = await buildReadiness(db, tenants as never, since)

    const lastChanges = await db.collection('auditlogs').aggregate([
      { $match: { action: 'tenant.flags_updated' } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$tenantId', last: { $first: '$$ROOT' } } },
    ]).toArray()
    const lastChangeMap = new Map(lastChanges.map(r => [String(r._id), r.last]))

    const rows = results.map(r => {
      const last = lastChangeMap.get(String(r.tenant._id)) as
        | { userName?: string; createdAt?: Date; details?: Record<string, unknown> }
        | undefined
      const lastDetail =
        typeof last?.details?.detail === 'string'
          ? (last.details.detail as string)
          : Array.isArray(last?.details?.changes)
            ? (last.details.changes as Array<{ key?: string; prev?: unknown; next?: unknown }>)
                .map(c => `${c?.key ?? '?'}: ${String(c?.prev ?? 'off')} -> ${String(c?.next ?? 'off')}`)
                .join(', ')
            : ''
      return {
        slug: r.tenant.slug,
        name: r.tenant.name ?? r.tenant.slug,
        plan: (r.tenant as { plan?: string }).plan ?? '',
        flags: r.signals.flags,
        checks: r.checks,
        verdicts: r.verdicts,
        metrics: {
          locations: r.signals.locations,
          ulr: r.signals.ulr,
          mp: {
            sharedOk: r.signals.mp.sharedOk,
            cuentas: r.signals.mp.cuentas,
            pendingSinAccount: r.signals.mp.pendingOrdersSinAccount + r.signals.mp.pendingResSinAccount,
          },
          cash: r.signals.cash,
          shadowRecientes: r.signals.shadowRecientes,
        },
        lastChange: last
          ? {
              userName: last.userName ?? '',
              createdAt: last.createdAt instanceof Date ? last.createdAt.toISOString() : String(last.createdAt ?? ''),
              detail: lastDetail,
              prevFlags:
                last.details && typeof last.details.prevFlags === 'object' && last.details.prevFlags !== null
                  ? (last.details.prevFlags as Record<string, unknown>)
                  : null,
              newFlags:
                last.details && typeof last.details.newFlags === 'object' && last.details.newFlags !== null
                  ? (last.details.newFlags as Record<string, unknown>)
                  : null,
            }
          : null,
      }
    })

    return NextResponse.json({ dias, generatedAt: new Date().toISOString(), tenants: rows })
  } catch (error) {
    console.error('[superadmin/multisede/overview]', error)
    return NextResponse.json({ error: 'Error al calcular el readiness multisede' }, { status: 500 })
  }
}
