import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import PlatformConfig from '@/models/PlatformConfig'
import { calculateFinalTotal } from '@/lib/pricing'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
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
    const mpEnabled = tenant.mercadopago?.isConfigured && tenant.mpOAuth?.isConnected

    const methods: Array<{
      id: string
      label: string
      description: string
      enabled: boolean
      surchargePercent: number
    }> = []

    if (mpEnabled) {
      const mpSurcharge = calculateFinalTotal(10000, 'mercadopago', tenant, platformConfig)
      methods.push({
        id: 'mercadopago',
        label: 'Mercado Pago',
        description: 'Tarjeta, efectivo, transferencia',
        enabled: tenant.paymentMethodsVisibility?.mercadopago !== false,
        surchargePercent: mpSurcharge.surchargePercent,
      })
    }

    if (kriptonEnabled) {
      const krSurcharge = calculateFinalTotal(10000, 'kripton', tenant, platformConfig)
      methods.push({
        id: 'kripton',
        label: 'Kripton',
        description: 'USDT, BTC, ETH y más',
        enabled: tenant.paymentMethodsVisibility?.kripton !== false,
        surchargePercent: krSurcharge.surchargePercent,
      })
    }

    methods.push({
      id: 'transfer',
      label: 'Transferencia',
      description: 'Precio de carta sin recargo',
      enabled: transferEnabled && tenant.paymentMethodsVisibility?.transfer !== false,
      surchargePercent: 0,
    })

    return NextResponse.json({
      methods,
      transfer: transferEnabled ? {
        alias: tenant.transfer.alias,
        cbu: tenant.transfer.cbu,
        cvu: tenant.transfer.cvu,
        bankName: tenant.transfer.bankName,
        holderName: tenant.transfer.holderName,
      } : null,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
