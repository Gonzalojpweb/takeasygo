import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import PlatformConfig from '@/models/PlatformConfig'
import { calculateFinalTotal, getTotalFeesForMethod, type PaymentMethod, type PricingResult } from '@/lib/pricing'
import { resolveCashConfig } from '@/lib/cash'
import { canAccess, type Plan } from '@/lib/plans'
import { getMpAccountForLocation } from '@/lib/mercadopago'
import type { ITenant, ITransferAccount } from '@/models/Tenant'
import type { IPlatformConfig } from '@/models/PlatformConfig'

/**
 * Fuente única de verdad de "qué métodos de pago están disponibles y a qué
 * precio" para un tenant + sede + modo de pedido.
 *
 * ── POR QUÉ ESTE ARCHIVO ──────────────────────────────────────────────────────
 * `GET /api/[tenant]/payment-methods` (catálogo del checkout) y
 * `POST /api/[tenant]/orders/[orderId]/change-payment-method` (flujo de
 * emergencia) necesitan EXACTAMENTE la misma decisión de disponibilidad. Si se
 * duplica, una puede quedar vieja: el cliente ve un método en el catálogo que el
 * endpoint de cambio rechaza (o al revés), y el flujo de emergencia vuelve a
 * ser un callejón sin salida. Mismo criterio que
 * `lib/sync-layer.ts::confirmOrderPaymentCore`: una función, N entradas.
 *
 * No cambiar la forma de `methods[]` ni el nombre de sus campos sin migrar
 * también el catálogo del checkout: ambos consumidores los leen.
 */

export interface PaymentMethodAvailability {
  id: PaymentMethod
  label: string
  description: string
  enabled: boolean
  surchargePercent: number
  totalFees: number
  cashDiscountPercent?: number
  /** @storedAs cents — presente solo cuando se pidió cotización (quote.baseTotal). */
  total?: number
}

export interface TransferAccountInfo {
  alias: string | null
  cbu: string | null
  cvu: string | null
  bankName: string | null
  holderName: string | null
}

export interface PaymentMethodCatalog {
  methods: PaymentMethodAvailability[]
  transfer: TransferAccountInfo | null
}

/**
 * Configuración de efectivo de una sede. El schema la declara como objeto
 * libre, así que se tipa por lo que realmente se lee acá.
 */
export interface LocationCashConfig {
  enabled?: boolean
  discountPercent?: number
}

/** Tenant + sede + platform config ya resueltos. Reutilizable entre endpoints. */
export interface PaymentMethodContext {
  tenant: ITenant
  platformConfig: IPlatformConfig | null
  locationCash: LocationCashConfig | null
  locationMpAccountId: string | null
}

/**
 * Carga tenant / platform config / sede. Lanza `TenantNotFoundError` o
 * `LocationNotFoundError` para que cada route pueda mapear a su status code.
 */
export class TenantNotFoundError extends Error {}
export class LocationNotFoundError extends Error {}

export async function loadPaymentMethodContext(
  tenantSlug: string,
  locationId?: string | null
): Promise<PaymentMethodContext> {
  await connectDB()

  const [tenant, platformConfig] = await Promise.all([
    Tenant.findOne({ slug: tenantSlug })
      .select(
        'transfer transferAccounts paymentSurcharges paymentMethodsVisibility mercadopago kripton mpOAuth mpAccounts plan features cash'
      )
      .lean() as unknown as ITenant | null,
    PlatformConfig.findById('platform')
      .select('platformFees kripton')
      .lean() as unknown as IPlatformConfig | null,
  ])

  if (!tenant) throw new TenantNotFoundError('Tenant no encontrado')

  let locationCash: LocationCashConfig | null = null
  let locationMpAccountId: string | null = null

  if (locationId) {
    const locationDoc = await Location.findOne({
      _id: locationId,
      tenantId: tenant._id,
      isActive: true,
    })
      .select('settings.cash settings.mpAccountId')
      .lean() as unknown as ({ settings?: { cash?: LocationCashConfig; mpAccountId?: string } } | null)

    if (!locationDoc) throw new LocationNotFoundError('Sede no encontrada')

    locationCash = locationDoc.settings?.cash ?? null
    locationMpAccountId = locationDoc.settings?.mpAccountId ?? null
  }

  return { tenant, platformConfig, locationCash, locationMpAccountId }
}

/**
 * Lista los métodos con su disponibilidad y comisión. `mode` determina si la
 * comisión de transferencia aplica (solo delivery).
 *
 * `quote` activa la cotización: cuando viene `baseTotal`, cada método trae
 * además su `total` final para ese monto. `deliveryCost` importa para
 * transferencia (el recargo se calcula sobre el subtotal, sin delivery).
 * Los totales SIEMPRE se calculan acá — el cliente nunca multiplica precios.
 */
export function buildPaymentMethodCatalog(
  ctx: PaymentMethodContext,
  mode: string = 'takeaway',
  quote?: { baseTotal: number; deliveryCost?: number }
): PaymentMethodCatalog {
  const { tenant, platformConfig, locationCash, locationMpAccountId } = ctx
  const methods: PaymentMethodAvailability[] = []

  // Sin cotización: 10000 como base de referencia, igual que antes.
  const baseTotal = quote?.baseTotal ?? 10000
  const deliveryCost = quote?.deliveryCost ?? 0
  const withTotal = (p: PricingResult) => (quote ? { total: p.finalTotal } : {})

  // ── MP: la cuenta se resuelve por sede; si no, la default del tenant ──────
  const mpAccount = getMpAccountForLocation(tenant, locationMpAccountId)
  const mpEnabled = !!mpAccount

  const mpPricing = calculateFinalTotal(
    baseTotal,
    'mercadopago',
    tenant,
    platformConfig || {},
    undefined,
    mode,
    deliveryCost
  )

  methods.push({
    id: 'mercadopago',
    label: 'Mercado Pago',
    description: 'Tarjeta, efectivo, transferencia',
    enabled: mpEnabled && tenant.paymentMethodsVisibility?.mercadopago !== false,
    surchargePercent: mpPricing.surchargePercent,
    totalFees: getTotalFeesForMethod('mercadopago', tenant, platformConfig || {}),
    ...withTotal(mpPricing),
  })

  // ── Kripton: habilitado a nivel plataforma + configurado en el tenant ─────
  const kriptonEnabled = (platformConfig?.kripton?.enabled ?? false) && !!tenant.kripton?.isConfigured
  if (kriptonEnabled) {
    const krPricing = calculateFinalTotal(
      baseTotal,
      'kripton',
      tenant,
      platformConfig || {},
      undefined,
      mode,
      deliveryCost
    )
    methods.push({
      id: 'kripton',
      label: 'Kripton',
      description: 'USDT, BTC, ETH y más',
      enabled: tenant.paymentMethodsVisibility?.kripton !== false,
      surchargePercent: krPricing.surchargePercent,
      totalFees: getTotalFeesForMethod('kripton', tenant, platformConfig || {}),
      ...withTotal(krPricing),
    })
  }

  // ── Transferencia: preferimos transferAccounts, fallback al legacy ────────
  const activeTransferAccount = (tenant.transferAccounts || []).find(
    (a: ITransferAccount) => a.isActive
  )
  const transferEnabled = activeTransferAccount
    ? !!tenant.transfer?.enabled && !!activeTransferAccount.alias
    : !!tenant.transfer?.enabled && !!tenant.transfer?.alias

  const trPricing = calculateFinalTotal(
    baseTotal,
    'transfer',
    tenant,
    platformConfig || {},
    undefined,
    mode,
    deliveryCost
  )

  methods.push({
    id: 'transfer',
    label: 'Transferencia',
    description: 'Pago por transferencia bancaria',
    enabled: transferEnabled,
    surchargePercent: trPricing.surchargePercent,
    totalFees: getTotalFeesForMethod('transfer', tenant, platformConfig || {}, undefined, mode),
    ...withTotal(trPricing),
  })

  // ── Efectivo: plan + flag de superadmin + config (tenant o sede) ─────────
  const cashConfig = resolveCashConfig(tenant.cash, locationCash)
  const cashEnabled =
    canAccess(tenant.plan as Plan, 'cashPayment') &&
    !!tenant.features?.cashPaymentEnabledBySuperadmin &&
    cashConfig.enabled

  if (cashEnabled) {
    // Cash no tiene recargo: el total final es exactamente el baseTotal.
    const cashPricing = calculateFinalTotal(
      baseTotal,
      'cash',
      tenant,
      platformConfig || {},
      undefined,
      mode,
      deliveryCost
    )
    methods.push({
      id: 'cash',
      label: 'Efectivo',
      description: 'Pago en efectivo al retirar',
      enabled: true,
      surchargePercent: 0,
      totalFees: 0,
      cashDiscountPercent: cashConfig.discountPercent,
      ...withTotal(cashPricing),
    })
  }

  const transfer: TransferAccountInfo | null = transferEnabled
    ? {
        alias: activeTransferAccount?.alias || tenant.transfer?.alias || null,
        cbu: activeTransferAccount?.cbu || tenant.transfer?.cbu || null,
        cvu: activeTransferAccount?.cvu || tenant.transfer?.cvu || null,
        bankName: activeTransferAccount?.bankName || tenant.transfer?.bankName || null,
        holderName: activeTransferAccount?.holderName || tenant.transfer?.holderName || null,
      }
    : null

  return { methods, transfer }
}

/** ¿El método está disponible para este tenant/sede/modo? Única fuente para el guard. */
export function isPaymentMethodAvailable(
  catalog: PaymentMethodCatalog,
  method: string
): boolean {
  return catalog.methods.some((m) => m.id === method && m.enabled)
}