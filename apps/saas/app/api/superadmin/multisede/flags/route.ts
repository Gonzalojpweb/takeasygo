import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import { requireSuperAdmin } from '@/lib/apiAuth'
import {
  FLAG_KEYS,
  MODE_FLAGS,
  type ReadinessDb,
  blockersForChanges,
  buildReadiness,
  hasSharedMpAccount,
  normalizeBooleanFlag,
  normalizeModeValue,
} from '@/lib/multisede-readiness'

export const dynamic = 'force-dynamic'

interface ChangeBody {
  key: string
  next: unknown
}

function validateChanges(body: unknown): ChangeBody[] | null {
  if (!Array.isArray(body) || body.length === 0) return null
  const changes: ChangeBody[] = []
  for (const item of body) {
    const key = (item as ChangeBody)?.key
    const next = (item as ChangeBody)?.next
    if (typeof key !== 'string' || !FLAG_KEYS.includes(key as never)) return null
    if (MODE_FLAGS.includes(key)) {
      const mode = normalizeModeValue(next)
      if (!['off', 'log', 'enforce'].includes(String(next)) && typeof next !== 'boolean') return null
      changes.push({ key, next: mode })
    } else {
      if (typeof next !== 'boolean') return null
      changes.push({ key, next: normalizeBooleanFlag(next) })
    }
  }
  return changes
}

export async function POST(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const body = await request.json().catch(() => null)
    const tenantSlug = typeof body?.tenantSlug === 'string' ? body.tenantSlug.trim() : ''
    const confirmSlug = typeof body?.confirmSlug === 'string' ? body.confirmSlug.trim() : ''
    const action = body?.action === 'rollback' ? 'rollback' : 'set'
    const changes = validateChanges(body?.changes)

    if (!tenantSlug) {
      return NextResponse.json({ error: 'Falta el negocio (tenantSlug)' }, { status: 400 })
    }
    if (confirmSlug !== tenantSlug) {
      return NextResponse.json(
        { error: 'Confirmación incorrecta: hay que escribir exactamente el slug del negocio. No se modificó nada.' },
        { status: 400 }
      )
    }

    await connectDB()
    const db = mongoose.connection.db
    if (!db) return NextResponse.json({ error: 'Sin conexión a la base' }, { status: 503 })

    const tenants = db.collection('tenants')
    const tenant = await tenants.findOne({ slug: tenantSlug })
    if (!tenant) {
      return NextResponse.json({ error: `Tenant no encontrado: ${tenantSlug}` }, { status: 404 })
    }

    const prevFlags = { ...(tenant.flags || {}) }

    if (action === 'rollback') {
      const rollbackTo = body?.rollbackTo
      if (typeof rollbackTo !== 'object' || rollbackTo === null) {
        return NextResponse.json({ error: 'Falta el estado previo a restaurar (rollbackTo)' }, { status: 400 })
      }
      await tenants.updateOne({ _id: tenant._id }, { $set: { flags: rollbackTo } })
      const newFlags = rollbackTo as Record<string, unknown>
      await registrarCambio(db, {
        tenantId: tenant._id,
        tenantSlug,
        userName: 'superadmin-panel',
        action: 'rollback',
        changes: Object.keys(newFlags).map(key => ({ key, prev: prevFlags[key], next: newFlags[key] })),
        prevFlags,
        newFlags,
        detail: `rollback de flags en ${tenantSlug}`,
      })
      return NextResponse.json({ ok: true, flags: newFlags, changed: Object.keys(newFlags).length })
    }

    if (!changes) {
      return NextResponse.json({ error: 'Cambios inválidos o vacíos' }, { status: 400 })
    }

    const since = new Date(Date.now() - 7 * 86_400_000)
    const [readiness] = await buildReadiness(db, [tenant as never], since)

    const relevant = changes.filter(c => prevFlags[c.key] !== c.next)
    if (relevant.length === 0) {
      return NextResponse.json({ ok: true, flags: prevFlags, changed: 0, note: 'Nada que cambiar: ya tienen ese valor' })
    }

    const mpTurningOn = relevant.some(c => c.key === 'mp.perLocation' && normalizeBooleanFlag(c.next))
    if (mpTurningOn && !hasSharedMpAccount(tenant as never)) {
      return NextResponse.json(
        { error: 'BLOQUEADO: Mercado Pago por sede requiere una cuenta compartida VÁLIDA (mpAccounts[] con isActive + accessToken, o legacy mercadopago.isConfigured + accessToken). Configurá/activá la cuenta primero.' },
        { status: 409 }
      )
    }

    const blockers = blockersForChanges(readiness.checks, relevant)
    if (blockers.length > 0) {
      return NextResponse.json(
        {
          error: `BLOQUEADO: faltan condiciones para encender:\n- ${blockers.join('\n- ')}`,
          blockers,
        },
        { status: 409 }
      )
    }

    const newFlags = { ...prevFlags }
    for (const c of relevant) newFlags[c.key] = c.next

    await tenants.updateOne({ _id: tenant._id }, { $set: { flags: newFlags } })

    const detail = relevant.map(c => `${c.key}: ${String(prevFlags[c.key] ?? 'off')} -> ${String(c.next)}`).join(', ')
    await registrarCambio(db, {
      tenantId: tenant._id,
      tenantSlug,
      userName: 'superadmin-panel',
      action: 'set',
      changes: relevant.map(c => ({ key: c.key, prev: prevFlags[c.key], next: c.next })),
      prevFlags,
      newFlags,
      detail,
    })

    return NextResponse.json({ ok: true, flags: newFlags, changed: relevant.length, detail })
  } catch (error) {
    console.error('[superadmin/multisede/flags]', error)
    return NextResponse.json({ error: 'Error al actualizar las flags' }, { status: 500 })
  }
}

async function registrarCambio(
  db: ReadinessDb,
  args: {
    tenantId: unknown
    tenantSlug: string
    userName: string
    action: 'set' | 'rollback'
    changes: Array<{ key: string; prev: unknown; next: unknown }>
    prevFlags: Record<string, unknown>
    newFlags: Record<string, unknown>
    detail: string
  }
) {
  try {
    await db.collection('auditlogs').insertOne({
      tenantId: args.tenantId,
      userId: null,
      userName: args.userName,
      userRole: 'superadmin',
      action: 'tenant.flags_updated',
      entity: 'tenant',
      entityId: String(args.tenantId),
      locationId: null,
      details: {
        source: 'superadmin/multisede-panel',
        panelAction: args.action,
        tenantSlug: args.tenantSlug,
        changes: args.changes,
        prevFlags: args.prevFlags,
        newFlags: args.newFlags,
        detail: args.detail,
      },
      ip: '',
      createdAt: new Date(),
    })
  } catch (err) {
    console.error('[multisede/flags] bitácora no registrada (la escritura YA se hizo):', (err as Error)?.message)
  }
}
