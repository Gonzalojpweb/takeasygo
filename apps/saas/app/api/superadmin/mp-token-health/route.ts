import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { scanTenantTokens } from '@/lib/mp-oauth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/superadmin/mp-token-health
 *
 * Escaneo por negocio de los tokens OAuth de Mercado Pago: cuántos están
 * vencidos, cuántos vencen pronto (≤30 días) y cuándo es el próximo
 * vencimiento. Solo superadmin.
 */
export async function GET() {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    await connectDB()
    const scans = await scanTenantTokens()

    const totals = scans.reduce(
      (acc, s) => ({
        tenants: acc.tenants + 1,
        accounts: acc.accounts + s.accounts.length,
        expired: acc.expired + s.expiredCount,
        soon: acc.soon + s.soonCount,
        unknown: acc.unknown + s.unknownCount,
        valid: acc.valid + s.validCount,
        autoRenewOn: acc.autoRenewOn + (s.autoRenewFlag ? 1 : 0),
      }),
      { tenants: 0, accounts: 0, expired: 0, soon: 0, unknown: 0, valid: 0, autoRenewOn: 0 }
    )

    // Próximo vencimiento global (la fecha más cercana entre todas).
    let nextGlobalExpiry: Date | null = null
    for (const s of scans) {
      if (s.nextExpiryAt && (!nextGlobalExpiry || s.nextExpiryAt < nextGlobalExpiry)) {
        nextGlobalExpiry = s.nextExpiryAt
      }
    }

    return NextResponse.json({
      scannedAt: new Date().toISOString(),
      ttlDays: 180,
      renewWindowDays: 30,
      totals,
      nextGlobalExpiryAt: nextGlobalExpiry?.toISOString() ?? null,
      tenants: scans,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
