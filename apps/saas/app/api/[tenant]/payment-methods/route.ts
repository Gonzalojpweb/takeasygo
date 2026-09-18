import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import PlatformConfig from '@/models/PlatformConfig'
import { calculateFinalTotal, getTotalFeesForMethod } from '@/lib/pricing'
import { resolveCashConfig } from '@/lib/cash'
import { canAccess } from '@/lib/plans'
import type { Plan } from '@/lib/plans'
import { NextRequest, NextResponse } from 'next/server'
import { getMpAccountForLocation } from '@/lib/mercadopago'

// ⚠️ CACHE WARNING: If you add caching here, the cache key MUST include locationId.
// Payment methods vary per-sede (MP account, cash config). A global cache would
// return wrong methods for the wrong location.

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    // El mode del pedido determina si se cobra comisión de transferencia.
    // Fallback intencional a 'takeaway': si el caller no manda el parámetro,
    // el sistema falla al lado seguro (no cobra comisión de más).
    const mode = _request.nextUrl.searchParams.get('mode') || 'takeaway'
    const locationId = _request.nextUrl.searchParams.get('locationId')
    await connectDB()

    const [tenant, platformConfig] = await Promise.all([
      Tenant.findOne({ slug: tenantSlug })
        .select('transfer transferAccounts paymentSurcharges paymentMethodsVisibility mercadopago kripton mpOAuth mpAccounts plan features cash')
        .lean() as any,
      PlatformConfig.findById('platform').select('platformFees kripton').lean() as any,
    ])

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // Override de efectivo por sede: si el locationId no existe o no es de este
    // tenant, se usa el fallback a Tenant.cash (comportamiento legacy).
    let locationCash: any = null
    let locationMpAccountId: string | null = null
    let locationDoc: any = null
    if (locationId) {
      locationDoc = await Location.findOne({ _id: locationId, tenantId: tenant._id, isActive: true })
        .select('settings.cash settings.mpAccountId')
        .lean() as any
      if (!locationDoc) {
        return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })
      }
      locationCash = locationDoc.settings?.cash ?? null
      locationMpAccountId = locationDoc.settings?.mpAccountId ?? null
    }

    const cashConfig = resolveCashConfig(tenant.cash, locationCash)

    const platformKriptonEnabled = platformConfig?.kripton?.enabled ?? false
    const kriptonEnabled = platformKriptonEnabled && !!tenant.kripton?.isConfigured

    // MP: resolver por sede si locationId, sino tenant default
    const mpAccount = getMpAccountForLocation(tenant, locationMpAccountId)
    const mpEnabled = !!mpAccount

    // Transfer: prefer transferAccounts (multi-account), fallback to legacy transfer
    const activeTransferAccount = (tenant.transferAccounts || []).find((a: any) => a.isActive)
    const hasTransferAccount = !!activeTransferAccount
    const transferEnabled = hasTransferAccount
      ? !!tenant.transfer?.enabled && !!activeTransferAccount.alias
      : !!tenant.transfer?.enabled && !!tenant.transfer?.alias

    const cashEnabled = canAccess(tenant.plan as Plan, 'cashPayment')
      && !!tenant.features?.cashPaymentEnabledBySuperadmin
      && cashConfig.enabled

    const methods: Array<{
      id: string
      label: string
      description: string
      enabled: boolean
      surchargePercent: number
      totalFees: number
      cashDiscountPercent?: number
    }> = []

    {
      const mpSurcharge = calculateFinalTotal(10000, 'mercadopago', tenant, platformConfig || {})
      const mpTotalFees = getTotalFeesForMethod('mercadopago', tenant, platformConfig || {})
      methods.push({
        id: 'mercadopago',
        label: 'Mercado Pago',
        description: 'Tarjeta, efectivo, transferencia',
        enabled: mpEnabled && tenant.paymentMethodsVisibility?.mercadopago !== false,
        surchargePercent: mpSurcharge.surchargePercent,
        totalFees: mpTotalFees,
      })
    }

    if (kriptonEnabled) {
      const krSurcharge = calculateFinalTotal(10000, 'kripton', tenant, platformConfig || {})
      const krTotalFees = getTotalFeesForMethod('kripton', tenant, platformConfig || {})
      methods.push({
        id: 'kripton',
        label: 'Kripton',
        description: 'USDT, BTC, ETH y más',
        enabled: tenant.paymentMethodsVisibility?.kripton !== false,
        surchargePercent: krSurcharge.surchargePercent,
        totalFees: krTotalFees,
      })
    }

    {
      // Transfer: se pasa el mode para que la comisión de plataforma solo aplique en delivery
      const trSurcharge = calculateFinalTotal(10000, 'transfer', tenant, platformConfig || {}, undefined, mode)
      const trTotalFees = getTotalFeesForMethod('transfer', tenant, platformConfig || {}, undefined, mode)
      methods.push({
        id: 'transfer',
        label: 'Transferencia',
        description: 'Pago por transferencia bancaria',
        enabled: transferEnabled,
        surchargePercent: trSurcharge.surchargePercent,
        totalFees: trTotalFees,
      })
    }

    if (cashEnabled) {
      methods.push({
        id: 'cash',
        label: 'Efectivo',
        description: 'Pago en efectivo al retirar',
        enabled: true,
        surchargePercent: 0,
        totalFees: 0,
        cashDiscountPercent: cashConfig.discountPercent,
      })
    }

    return NextResponse.json({
      methods,
      transfer: transferEnabled ? {
        alias: activeTransferAccount?.alias || tenant.transfer?.alias,
        cbu: activeTransferAccount?.cbu || tenant.transfer?.cbu,
        cvu: activeTransferAccount?.cvu || tenant.transfer?.cvu,
        bankName: activeTransferAccount?.bankName || tenant.transfer?.bankName,
        holderName: activeTransferAccount?.holderName || tenant.transfer?.holderName,
      } : null,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
