import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { FLAG_LABELS, normalizeModeValue } from '@/lib/multisede-readiness'

export const dynamic = 'force-dynamic'

interface GroupedRow {
  _id: unknown
  count: number
}

function group(rows: GroupedRow[], label: (id: unknown) => string) {
  const total = rows.reduce((s, r) => s + r.count, 0)
  return {
    total,
    items: rows.slice(0, 50).map(r => ({
      label: label(r._id),
      count: r.count,
      pct: total > 0 ? Math.round((r.count / total) * 1000) / 10 : 0,
    })),
  }
}

export async function GET(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const tenantSlug = request.nextUrl.searchParams.get('tenant')
    if (!tenantSlug) {
      return NextResponse.json({ error: 'Falta el parámetro tenant (slug)' }, { status: 400 })
    }
    const dias = Math.min(90, Math.max(1, Number(request.nextUrl.searchParams.get('dias')) || 7))

    await connectDB()
    const db = mongoose.connection.db
    if (!db) return NextResponse.json({ error: 'Sin conexión a la base' }, { status: 503 })

    const tenant = await db.collection('tenants').findOne(
      { slug: tenantSlug },
      { projection: { slug: 1, name: 1, flags: 1 } }
    )
    if (!tenant) {
      return NextResponse.json({ error: `Tenant no encontrado: ${tenantSlug}` }, { status: 404 })
    }

    const since = new Date(Date.now() - dias * 86_400_000)

    const match = { $match: { tenantId: tenant._id, action: 'rbac.shadow_denied', createdAt: { $gte: since } } }

    const [total, byUser, byRoute, bySede, byPermission, byEffectiveRole, usersWithRows] = await Promise.all([
      db.collection('auditlogs').countDocuments({ tenantId: tenant._id, action: 'rbac.shadow_denied', createdAt: { $gte: since } }),
      db.collection('auditlogs').aggregate([
        match,
        { $group: { _id: { userId: '$userId', userName: '$userName', role: '$userRole' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 50 },
      ]).toArray(),
      db.collection('auditlogs').aggregate([
        match,
        { $group: { _id: '$details.route', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 50 },
      ]).toArray(),
      db.collection('auditlogs').aggregate([
        match,
        { $group: { _id: '$locationId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 50 },
      ]).toArray(),
      db.collection('auditlogs').aggregate([
        match,
        { $group: { _id: '$details.permission', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 50 },
      ]).toArray(),
      db.collection('auditlogs').aggregate([
        match,
        { $group: { _id: '$details.effectiveRole', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 50 },
      ]).toArray(),
      db.collection('auditlogs').aggregate([
        match,
        { $group: { _id: '$userId', count: { $sum: 1 } } },
        { $count: 'distinct' },
      ]).toArray(),
    ])

    const sedeIds = (bySede as GroupedRow[])
      .map(r => r._id)
      .filter((id): id is mongoose.Types.ObjectId => id instanceof mongoose.Types.ObjectId)
    const sedes = sedeIds.length > 0
      ? await db.collection('locations').find({ _id: { $in: sedeIds } }, { projection: { name: 1 } }).toArray()
      : []
    const sedeNames = new Map(sedes.map(s => [String(s._id), String(s.name ?? '')]))

    const byUserTotal = (byUser as GroupedRow[]).reduce((s, r) => s + r.count, 0)
    const flags = tenant.flags ?? {}
    const rbacMode = normalizeModeValue(flags['rbac.sedeScope'])

    return NextResponse.json({
      tenant: { slug: tenant.slug, name: tenant.name ?? tenant.slug },
      dias,
      generatedAt: new Date().toISOString(),
      flagsNow: {
        'rbac.sedeScope': flags['rbac.sedeScope'] ?? 'off',
        label: FLAG_LABELS['rbac.sedeScope'],
      },
      rbacMode,
      summary: {
        total,
        usuariosDistintos: (usersWithRows[0]?.distinct as number) ?? 0,
        nota: total === 0
          ? 'Sin denegaciones simuladas en la ventana: enforce no bloquearía nada con este uso (igual validar la lista manual antes de encender).'
          : `${total} denegación(es) simuladas en ${dias} día(s): enforce bloquearía estas rutas con el uso real del cliente.`,
      },
      byUser: {
        total: byUserTotal,
        items: (byUser as Array<{ _id: { userId: unknown; userName: unknown; role: unknown }; count: number }>)
          .slice(0, 50)
          .map(r => ({
            userId: r._id?.userId == null ? '' : String(r._id.userId),
            userName: String(r._id?.userName ?? '(sin nombre)'),
            role: String(r._id?.role ?? ''),
            count: r.count,
            pct: byUserTotal > 0 ? Math.round((r.count / byUserTotal) * 1000) / 10 : 0,
          })),
      },
      byRoute: group(byRoute as GroupedRow[], id => String(id ?? '(sin ruta)')),
      bySede: group(bySede as GroupedRow[], id => (id == null ? '(sin sede)' : sedeNames.get(String(id)) || `sede ${String(id).slice(-6)}`)),
      byPermission: group(byPermission as GroupedRow[], id => String(id ?? '(sin permiso)')),
      byEffectiveRole: group(byEffectiveRole as GroupedRow[], id => String(id ?? '(sin rol)')),
    })
  } catch (error) {
    console.error('[superadmin/multisede/shadow]', error)
    return NextResponse.json({ error: 'Error al generar el reporte de sombra' }, { status: 500 })
  }
}
