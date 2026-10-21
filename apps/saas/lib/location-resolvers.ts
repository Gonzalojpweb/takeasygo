import Location from '@/models/Location'
import type { ITransferAccount } from '@/models/Tenant'
import type { TransferAccountInfo } from '@/lib/payment-methods'

/**
 * Resolutores por sede para "cuenta de transferencia" y "WhatsApp de
 * notificaciones". UNA función por concepto — el mismo criterio que
 * `lib/payment-methods.ts` (una fuente, N entradas): si se duplica, checkout,
 * mensaje de WhatsApp, tracking y panel divergen.
 *
 * Semántica de herencia (igual que cash y mpAccountId): el override vive en
 * `Location.settings`; `null`/vacío = hereda el valor global del tenant.
 */

// ── Transferencia ────────────────────────────────────────────────────────────

/** Cuenta de transferencia resuelta: datos para mostrar + id de origen. */
export interface ResolvedTransferAccount extends TransferAccountInfo {
  /** _id en tenant.transferAccounts[]; null = legacy tenant.transfer */
  accountId: string | null
}

export interface TransferResolutionTenant {
  transferAccounts?: ITransferAccount[] | null
  transfer?: {
    enabled?: boolean
    alias?: string | null
    cbu?: string | null
    cvu?: string | null
    bankName?: string | null
    holderName?: string | null
  } | null
}

/**
 * Resuelve QUÉ cuenta de transferencia ve una sede (checkout, mensaje de
 * WhatsApp del pedido y tracking usan siempre esto).
 *
 * Orden:
 *  1. Override de la sede (`locationTransferAccountId`): si la cuenta EXISTE
 *     se usa aunque no esté `isActive` globalmente — cambiar el radio global
 *     no puede romper las sedes con cuenta propia (mismo criterio fail-open
 *     de `getMpAccountForLocation` cuando el override existe). Si ya no existe
 *     (fue borrada) → fallback al paso 2.
 *  2. Cuenta activa del tenant (comportamiento histórico).
 *  3. Legacy `tenant.transfer` (alias/cbu sueltos, pre-transferAccounts).
 *  4. Nada configurado → null.
 */
export function resolveTransferAccountForLocation(
  tenant: TransferResolutionTenant,
  locationTransferAccountId?: string | null
): ResolvedTransferAccount | null {
  const pick = (a: ITransferAccount): ResolvedTransferAccount => ({
    accountId: a._id ? String(a._id) : null,
    alias: a.alias || null,
    cbu: a.cbu ?? null,
    cvu: a.cvu ?? null,
    bankName: a.bankName ?? null,
    holderName: a.holderName ?? null,
  })

  // 1. Override de la sede — existence-wins.
  if (locationTransferAccountId) {
    const match = (tenant.transferAccounts || []).find(
      a => a._id?.toString() === locationTransferAccountId
    )
    if (match) return pick(match)
    // Cuenta borrada → cae al global (mismo fallback que reportó el reviewer).
  }

  // 2. Cuenta activa del tenant.
  const active = (tenant.transferAccounts || []).find(a => a.isActive)
  if (active) return pick(active)

  // 3. Legacy: un solo alias a nivel tenant sin transferAccounts[].
  if (tenant.transfer?.alias || tenant.transfer?.cbu || tenant.transfer?.cvu) {
    return {
      accountId: null,
      alias: tenant.transfer?.alias || null,
      cbu: tenant.transfer?.cbu ?? null,
      cvu: tenant.transfer?.cvu ?? null,
      bankName: tenant.transfer?.bankName ?? null,
      holderName: tenant.transfer?.holderName ?? null,
    }
  }

  return null
}

// ── WhatsApp de notificaciones admin ─────────────────────────────────────────

export interface WhatsAppTenant {
  _id: unknown
  notifications?: {
    whatsappPhone?: string | null
    notifyOnOrder?: boolean
    notifyOnReservation?: boolean
  } | null
}

export interface LocationNotificationSettings {
  whatsappPhone?: string | null
  notifyOnOrder?: boolean | null
  notifyOnReservation?: boolean | null
}

export interface AdminWhatsAppTarget {
  /** Número de destino. null = no se notifica. */
  phone: string | null
  /** Sin default: cada call site conserva su chequeo original (truthy vs !== false). */
  notifyOnOrder?: boolean
  notifyOnReservation?: boolean
}

/**
 * Destino WhatsApp admin + flags efectivos, puro (para callers que ya tienen
 * el doc de la sede a mano). Override vacío/nulo = hereda el global.
 */
export function pickAdminWhatsApp(
  tenant: WhatsAppTenant,
  locationSettings?: LocationNotificationSettings | null
): AdminWhatsAppTarget {
  const global = tenant.notifications
  const phone = locationSettings?.whatsappPhone || global?.whatsappPhone || null
  return {
    phone,
    notifyOnOrder: locationSettings?.notifyOnOrder ?? global?.notifyOnOrder,
    notifyOnReservation:
      locationSettings?.notifyOnReservation ?? global?.notifyOnReservation,
  }
}

/**
 * Igual que `pickAdminWhatsApp` pero cargando la sede por id (scopeado al
 * tenant). Para callers que solo tienen el id (confirmación de transferencia,
 * cancelación de reservas).
 */
export async function resolveAdminWhatsApp(
  tenant: WhatsAppTenant,
  locationId?: string | null
): Promise<AdminWhatsAppTarget> {
  if (!locationId) return pickAdminWhatsApp(tenant, null)
  try {
    const loc = await Location.findById(locationId)
      .select('tenantId settings.whatsappPhone settings.notifyOnOrder settings.notifyOnReservation')
      .lean() as { tenantId?: unknown; settings?: LocationNotificationSettings } | null
    if (!loc || String(loc.tenantId) !== String(tenant._id)) {
      return pickAdminWhatsApp(tenant, null)
    }
    return pickAdminWhatsApp(tenant, loc.settings ?? null)
  } catch {
    return pickAdminWhatsApp(tenant, null)
  }
}

// ── Recargos, Kripton y descuento del club ───────────────────────────────────

type SurchargeMethod = 'mercadopago' | 'kripton' | 'transfer'
const SURCHARGE_METHODS: SurchargeMethod[] = ['mercadopago', 'kripton', 'transfer']

export interface LocationCommercialSettings {
  paymentSurcharges?: Partial<Record<SurchargeMethod, { feePercent?: number | null } | null>> | null
  kriptonEnabled?: boolean | null
  clubDiscountEnabled?: boolean | null
}

interface CommercialTenant {
  paymentSurcharges?: Partial<Record<SurchargeMethod, { feePercent: number }>> | null
  paymentMethodsVisibility?: { mercadopago?: boolean; kripton?: boolean } | null
}

/**
 * Tenant con los recargos y la visibilidad de Kripton ya resueltos para una
 * sede (override de la sede > valor del tenant). Devuelve un objeto nuevo con
 * la misma forma que el tenant, así `lib/pricing` y el catálogo de medios de
 * pago no necesitan saber de sedes.
 */
export function withLocationCommercialSettings<T extends CommercialTenant>(
  tenant: T,
  settings: LocationCommercialSettings | null | undefined
): T {
  if (!settings) return tenant
  const surcharges: Partial<Record<SurchargeMethod, { feePercent: number }>> = {
    ...(tenant.paymentSurcharges ?? {}),
  }
  for (const method of SURCHARGE_METHODS) {
    const own = settings.paymentSurcharges?.[method]?.feePercent
    if (typeof own === 'number') surcharges[method] = { feePercent: own }
  }
  const visibility = { ...(tenant.paymentMethodsVisibility ?? {}) }
  if (settings.kriptonEnabled === false) visibility.kripton = false
  return { ...tenant, paymentSurcharges: surcharges, paymentMethodsVisibility: visibility }
}

/** ¿Aplica el descuento del club en esta sede? null/ausente = hereda (aplica). */
export function isClubDiscountEnabledForLocation(
  settings: LocationCommercialSettings | null | undefined
): boolean {
  return settings?.clubDiscountEnabled !== false
}
