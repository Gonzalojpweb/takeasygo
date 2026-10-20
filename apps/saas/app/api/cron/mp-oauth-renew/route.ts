/**
 * Cron Job: Renovación automática de tokens OAuth de Mercado Pago
 *
 * Renueva (grant_type=refresh_token) los access_token OAuth que están
 * vencidos o vencen dentro de RENEW_WINDOW_DAYS (30 días), de los tenants
 * cuyo flag mp.oauthAutoRenew esté ON. Porta el patrón de Google Contacts:
 * un solo ejecutor (candado en PlatformConfig), guardar el nuevo antes de
 * descartar el viejo, nunca guardar vacío ni pisar si falla, mail de aviso
 * al superadmin si algo falla.
 *
 * Doc MP: el access_token OAuth dura 180 días; cada refresh devuelve
 * access_token y refresh_token NUEVOS (hay que guardar ambos).
 *
 * URL: /api/cron/mp-oauth-renew
 * Método: GET (header Authorization: Bearer CRON_SECRET)
 */

import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { isFlagEnabled, FLAGS } from '@/lib/feature-flags'
import Tenant from '@/models/Tenant'
import {
  RENEW_WINDOW_DAYS,
  acquireRefreshLock,
  findRenewCandidates,
  loadPlatformOAuthCreds,
  refreshOAuthForTenant,
  releaseRefreshLock,
  notifyRefreshFailure,
} from '@/lib/mp-oauth'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const owner = `mp-renew-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  try {
    await connectDB()

    // ── Candado cross-instancia: un solo ejecutor ──
    const locked = await acquireRefreshLock(owner)
    if (!locked) {
      return NextResponse.json({
        success: true,
        skipped: 'lock_held',
        message: 'Otra instancia está renovando tokens ahora.',
      })
    }

    try {
      const candidates = await findRenewCandidates(RENEW_WINDOW_DAYS)

      // Filtrar por el flag mp.oauthAutoRenew (por tenant).
      const flagged = new Map<string, boolean>()
      const results: Array<{
        tenantSlug: string
        accountLabel: string
        scope: string
        ok: boolean
        reason?: string
        newExpiresAt?: string
      }> = []

      for (const cand of candidates) {
        const tenantIdKey = String(cand.tenantId)
        if (!flagged.has(tenantIdKey)) {
          const tenant = await Tenant.findById(cand.tenantId).select('flags').lean()
          flagged.set(tenantIdKey, isFlagEnabled(tenant, FLAGS.MP_OAUTH_AUTO_RENEW))
        }
        if (!flagged.get(tenantIdKey)) continue

        // Re-cargar el tenant completo (necesitamos los docs para el executor).
        const tenantDoc = await Tenant.findById(cand.tenantId)
        if (!tenantDoc) continue

        const creds = await loadPlatformOAuthCreds()
        if (!creds) {
          results.push({
            tenantSlug: cand.tenantSlug,
            accountLabel: cand.accountLabel,
            scope: cand.scope,
            ok: false,
            reason: 'sin_credenciales_oauth_plataforma',
          })
          continue
        }

        const result = await refreshOAuthForTenant(
          tenantDoc,
          cand.scope,
          cand.accountId,
          creds
        )

        results.push({
          tenantSlug: cand.tenantSlug,
          accountLabel: cand.accountLabel,
          scope: cand.scope,
          ok: result.ok,
          reason: result.reason,
          newExpiresAt: result.newExpiresAt?.toISOString(),
        })

        if (!result.ok) {
          await notifyRefreshFailure({
            tenantSlug: cand.tenantSlug,
            tenantName: cand.tenantName,
            accountLabel: cand.accountLabel,
            reason: result.reason ?? 'desconocido',
          })
        }
      }

      const refreshed = results.filter((r) => r.ok).length
      const failed = results.filter((r) => !r.ok).length

      return NextResponse.json({
        success: true,
        timestamp: new Date().toISOString(),
        summary: {
          candidatesFound: candidates.length,
          refreshed,
          failed,
        },
        results,
      })
    } finally {
      await releaseRefreshLock(owner)
    }
  } catch (error) {
    console.error('[Cron][MP OAuth Renew] Error:', error)
    return NextResponse.json(
      { error: 'Error executing cron job', details: String(error) },
      { status: 500 }
    )
  }
}
