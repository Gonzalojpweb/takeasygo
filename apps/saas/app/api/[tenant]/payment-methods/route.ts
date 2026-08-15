import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import PlatformConfig from '@/models/PlatformConfig'
import { calculateFinalTotal, getTotalFeesForMethod } from '@/lib/pricing'
import { NextRequest, NextResponse } from 'next/server'

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
    await connectDB()

    const [tenant, platformConfig] = await Promise.all([
      Tenant.findOne({ slug: tenantSlug })
        .select('transfer paymentSurcharges paymentMethodsVisibility mercadopago kripton mpOAuth')
        .lean() as any,
      PlatformConfig.findById('platform').select('platformFees kripton').lean() as any,
    ])

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const platformKriptonEnabled = platformConfig?.kripton?.enabled ?? false
    const kriptonEnabled = platformKriptonEnabled && !!tenant.kripton?.isConfigured
    const transferEnabled = !!tenant.transfer?.enabled && !!tenant.transfer?.alias
    const mpEnabled = !!tenant.mercadopago?.isConfigured

    const methods: Array<{
      id: string
      label: string
      description: string
      enabled: boolean
      surchargePercent: number
      totalFees: number
    }> = []

    {
      const mpSurcharge = calculateFinalTotal(10000, 'mercadopago', tenant, platformConfig)
      const mpTotalFees = getTotalFeesForMethod('mercadopago', tenant, platformConfig)
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
      const krSurcharge = calculateFinalTotal(10000, 'kripton', tenant, platformConfig)
      const krTotalFees = getTotalFeesForMethod('kripton', tenant, platformConfig)
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
      const trSurcharge = calculateFinalTotal(10000, 'transfer', tenant, platformConfig, undefined, mode)
      const trTotalFees = getTotalFeesForMethod('transfer', tenant, platformConfig, undefined, mode)
      methods.push({
        id: 'transfer',
        label: 'Transferencia',
        description: 'Pago por transferencia bancaria',
        enabled: transferEnabled,
        surchargePercent: trSurcharge.surchargePercent,
        totalFees: trTotalFees,
      })
    }

    return NextResponse.json({
      methods,
      transfer: transferEnabled ? {
        alias: tenant.transfer.alias,
        cbu: tenant.transfer.cbu,
        cvu: tenant.transfer.cvu,
      } : null,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
