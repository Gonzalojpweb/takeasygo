import mongoose from 'mongoose'
import CaeaPeriod from '@/models/CaeaPeriod'
import FiscalCounter from '@/models/FiscalCounter'
import FiscalDocument, { type IFiscalDocument } from '@/models/FiscalDocument'
import FiscalProfile from '@/models/FiscalProfile'
import Order from '@/models/Order'
import PosOfflineDevice from '@/models/PosOfflineDevice'
import { cbteTipo as cbteTipoFor, isValidPointOfSale, type IssuerIvaCondition } from '@takeasygo/business'
import { caeaPeriodOf } from '@takeasygo/business/escpos'
import { loadModality } from '@/lib/fiscal/controller'
import { resolveReceiver, CF_IDENTIFICATION_THRESHOLD_CENTS, type ReceiverInput } from '@/lib/fiscal/issue'
import { ivaRatesForLocation } from '@/lib/fiscal/order-lines'
import { arcaQrUrl } from '@/lib/fiscal/qr'
import { enqueueFiscalTicket } from '@/lib/fiscal/ticket'
import { printerForDocument } from '@/lib/printers/select'
import { PosError } from './errors'

// ============================================================================
// Factura sin internet con CAEA (POS offline V2 — etapa 5, 12/11/2026)
// ============================================================================
// Decisión del dueño: sin internet se factura con el CAEA de contingencia.
//
//   1. Con internet, el equipo habilitado recibe su «kit fiscal»: el CAEA de
//      la quincena (y el de la siguiente, cuando ya se pidió), su punto de
//      venta de contingencia EXCLUSIVO, el último número de cada tipo, los
//      datos del emisor para el ticket y las alícuotas de la carta.
//   2. Sin internet, el equipo numera (último + 1 en su punto de venta), arma
//      el comprobante con el mismo desglose de IVA, lo imprime por la red
//      local y lo entrega. Es un comprobante válido: lleva el CAEA y el QR con
//      tipo de autorización «A».
//   3. Al volver la red, el cobro llega con `invoice.offlineCaea`: el server
//      guarda el comprobante TAL CUAL se entregó (es el papel que tiene el
//      cliente) y el cron fiscal lo informa a ARCA (FECAEARegInformativo) en
//      el plazo de la quincena. Si algo no cierra (equipo no habilitado, otro
//      punto de venta, CAEA de otra quincena, número repetido, total
//      distinto) NO se descarta: queda en «revisión» para una persona.
//
// Límites (los mismos que la contingencia del server, lib/fiscal/caea.ts):
//   · solo Factura A y B (C con CAEA sin validar en el manual de ARCA);
//   · la contingencia tiene que estar habilitada en el perfil fiscal;
//   · sedes con impresora fiscal (controlador) no usan esto.
// ============================================================================

interface ProfileLean {
  enabled?: boolean
  cuit?: string
  environment?: 'homologation' | 'production'
  ivaCondition?: IssuerIvaCondition | null
  defaultIvaRate?: number
  legalName?: string
  fiscalAddress?: string
  grossIncomeNumber?: string
  activityStartDate?: Date | null
  cfIdentificationThresholdCents?: number | null
  invoicingMode?: 'ask' | 'always' | 'off'
  pointsOfSale?: { locationId: mongoose.Types.ObjectId; number: number }[]
  contingency?: { enabled?: boolean; pointsOfSale?: { locationId: mongoose.Types.ObjectId; number: number }[] }
}

const PROFILE_FIELDS =
  'enabled cuit environment ivaCondition defaultIvaRate legalName fiscalAddress grossIncomeNumber activityStartDate cfIdentificationThresholdCents invoicingMode pointsOfSale contingency'

export interface OfflineFiscalKit {
  available: true
  environment: 'homologation' | 'production'
  pointOfSale: number
  issuer: {
    legalName: string
    cuit: string
    fiscalAddress: string
    grossIncomeNumber: string
    activityStartDate: string | null
    ivaCondition: IssuerIvaCondition
  }
  defaultIvaRate: number
  cfThresholdCents: number
  /** menuItemId → alícuota efectiva (producto → categoría → comercio). */
  ivaRates: Record<string, number>
  caeas: { period: string; order: 1 | 2; caea: string; validFrom: string | null; validTo: string | null }[]
  /** cbteTipo → último número usado en el punto de venta del equipo. */
  lastNumbers: Record<string, number>
}

export type OfflineFiscalKitResult = OfflineFiscalKit | { available: false; reason: string }

/** Tipos de comprobante que puede emitir sin internet: Factura A y B (las notas de crédito son online). */
function offlineTipos(): number[] {
  return [cbteTipoFor('A', 'invoice'), cbteTipoFor('B', 'invoice')]
}

/** Puntos de venta exclusivos de los equipos habilitados del comercio (para el cron fiscal). */
export async function deviceContingencyPointsOfSale(tenantId: mongoose.Types.ObjectId | string): Promise<number[]> {
  const rows = await PosOfflineDevice.find({ tenantId: new mongoose.Types.ObjectId(String(tenantId)), revokedAt: null, contingencyPointOfSale: { $ne: null } })
    .select('contingencyPointOfSale')
    .lean<{ contingencyPointOfSale: number }[]>()
  return [...new Set(rows.map((r) => r.contingencyPointOfSale))]
}

/**
 * Asigna (o quita, con null) el punto de venta exclusivo del equipo. No puede
 * ser el punto de venta online de ninguna sede, ni el de contingencia del
 * server, ni el de otro equipo: cada uno numera solo, sin internet.
 */
export async function assignDevicePointOfSale(tenantId: string, locationId: string, deviceId: string, value: unknown): Promise<number | null> {
  const device = await PosOfflineDevice.findOne({ tenantId: new mongoose.Types.ObjectId(tenantId), locationId: new mongoose.Types.ObjectId(locationId), deviceId, revokedAt: null })
  if (!device) throw PosError.notFound('Ese equipo no está habilitado sin internet en esta sede')
  if (value === null || value === '' || value === undefined) {
    device.contingencyPointOfSale = null
    await device.save()
    return null
  }
  const number = Number(value)
  if (!isValidPointOfSale(number)) throw PosError.validation('Punto de venta inválido (1 a 99998)')
  const profile = await FiscalProfile.findOne({ tenantId }).select('pointsOfSale contingency').lean<ProfileLean>()
  if ((profile?.pointsOfSale ?? []).some((p) => p.number === number)) {
    throw PosError.conflict(`El punto de venta ${number} es el de factura online de una sede: el equipo necesita uno exclusivo de contingencia (CAEA)`)
  }
  if ((profile?.contingency?.pointsOfSale ?? []).some((p) => p.number === number)) {
    throw PosError.conflict(`El punto de venta ${number} lo usa la contingencia del servidor: el equipo necesita uno propio`)
  }
  const taken = await PosOfflineDevice.exists({ tenantId: device.tenantId, revokedAt: null, contingencyPointOfSale: number, deviceId: { $ne: deviceId } })
  if (taken) throw PosError.conflict(`El punto de venta ${number} ya está asignado a otro equipo`)
  device.contingencyPointOfSale = number
  await device.save()
  return number
}

/** Kit fiscal del equipo (solo un equipo habilitado lo recibe). */
export async function offlineFiscalKit(
  tenantId: string,
  locationId: string,
  device: { contingencyPointOfSale?: number | null },
  now = new Date()
): Promise<OfflineFiscalKitResult> {
  const profile = await FiscalProfile.findOne({ tenantId }).select(PROFILE_FIELDS).lean<ProfileLean>()
  if (!profile?.enabled || !profile.ivaCondition || !profile.cuit || !profile.environment || profile.invoicingMode === 'off') {
    return { available: false, reason: 'La factura electrónica no está activa para este comercio' }
  }
  const { modality } = await loadModality(tenantId, locationId)
  if (modality !== 'electronic') return { available: false, reason: 'Esta sede no emite factura electrónica (o usa impresora fiscal)' }
  if (!profile.contingency?.enabled) return { available: false, reason: 'La contingencia CAEA no está habilitada en el perfil fiscal (panel web › Factura electrónica)' }
  if (profile.ivaCondition !== 'responsable_inscripto') {
    return { available: false, reason: 'Sin internet solo se emiten Factura A y B con CAEA: la Factura C con CAEA no está validada con ARCA' }
  }
  if (!device.contingencyPointOfSale) return { available: false, reason: 'Falta asignar el punto de venta de contingencia de este equipo' }

  const current = caeaPeriodOf(now)
  const periods = await CaeaPeriod.find({ tenantId, environment: profile.environment, validTo: { $gte: new Date(now.getTime() - 86_400_000) } })
    .sort({ period: 1, order: 1 })
    .lean<{ period: string; order: 1 | 2; caea: string; validFrom: Date | null; validTo: Date | null }[]>()
  if (!periods.some((p) => p.period === current.period && p.order === current.order)) {
    return { available: false, reason: 'Todavía no hay CAEA para esta quincena (lo pide el sistema todos los días)' }
  }

  const tipos = offlineTipos()
  const counters = await FiscalCounter.find({ tenantId, environment: profile.environment, pointOfSale: device.contingencyPointOfSale, cbteTipo: { $in: tipos } })
    .select('cbteTipo last')
    .lean<{ cbteTipo: number; last: number }[]>()
  // Lo ya emitido por el equipo (informado o no) también cuenta.
  const lastDocs = await FiscalDocument.aggregate<{ _id: number; last: number }>([
    { $match: { tenantId: new mongoose.Types.ObjectId(tenantId), environment: profile.environment, pointOfSale: device.contingencyPointOfSale, number: { $type: 'number' } } },
    { $group: { _id: '$cbteTipo', last: { $max: '$number' } } },
  ])
  const lastNumbers: Record<string, number> = {}
  for (const t of tipos) {
    lastNumbers[t] = Math.max(counters.find((c) => c.cbteTipo === t)?.last ?? 0, lastDocs.find((d) => d._id === t)?.last ?? 0)
  }

  const rates = await ivaRatesForLocation(tenantId, locationId, profile.defaultIvaRate ?? 21)
  return {
    available: true,
    environment: profile.environment,
    pointOfSale: device.contingencyPointOfSale,
    issuer: {
      legalName: profile.legalName ?? '',
      cuit: profile.cuit,
      fiscalAddress: profile.fiscalAddress ?? '',
      grossIncomeNumber: profile.grossIncomeNumber ?? '',
      activityStartDate: profile.activityStartDate ? new Date(profile.activityStartDate).toISOString() : null,
      ivaCondition: profile.ivaCondition,
    },
    defaultIvaRate: profile.defaultIvaRate ?? 21,
    cfThresholdCents: profile.cfIdentificationThresholdCents ?? CF_IDENTIFICATION_THRESHOLD_CENTS,
    ivaRates: Object.fromEntries(rates),
    caeas: periods.map((p) => ({
      period: p.period,
      order: p.order,
      caea: p.caea,
      validFrom: p.validFrom ? new Date(p.validFrom).toISOString() : null,
      validTo: p.validTo ? new Date(p.validTo).toISOString() : null,
    })),
    lastNumbers,
  }
}

// ── Al volver la red: guardar el comprobante que ya se entregó ───────────────

/** Lo que manda el equipo en `invoice.offlineCaea` (el comprobante impreso). */
export interface OfflineCaeaInvoice {
  pointOfSale: number
  cbteTipo: number
  letter: 'A' | 'B'
  number: number
  issuedAt: string
  caea: string
  receiver: { condition: string; docType: number; docNumber: string; name: string }
  amounts: { totalCents: number; netCents: number; ivaCents: number; exemptCents: number }
  ivaGroups: { ivaRate: number; afipId: number; baseCents: number; amountCents: number }[]
  lines: { description: string; quantity: number; totalCents: number; ivaRate: number }[]
}

const int = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) ? v : NaN)

/** Valida la forma (no el fondo) de `invoice.offlineCaea`. null si no viene o no sirve. */
export function readOfflineCaea(raw: unknown): OfflineCaeaInvoice | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const receiver = r.receiver as Record<string, unknown> | undefined
  const amounts = r.amounts as Record<string, unknown> | undefined
  if (!receiver || !amounts || !Array.isArray(r.ivaGroups) || !Array.isArray(r.lines)) return null
  const out: OfflineCaeaInvoice = {
    pointOfSale: int(r.pointOfSale),
    cbteTipo: int(r.cbteTipo),
    letter: r.letter === 'A' ? 'A' : 'B',
    number: int(r.number),
    issuedAt: typeof r.issuedAt === 'string' ? r.issuedAt : '',
    caea: typeof r.caea === 'string' ? r.caea.slice(0, 20) : '',
    receiver: {
      condition: String(receiver.condition ?? 'consumidor_final'),
      docType: int(receiver.docType),
      docNumber: String(receiver.docNumber ?? '0').slice(0, 20),
      name: String(receiver.name ?? '').slice(0, 120),
    },
    amounts: { totalCents: int(amounts.totalCents), netCents: int(amounts.netCents), ivaCents: int(amounts.ivaCents), exemptCents: int(amounts.exemptCents) },
    ivaGroups: (r.ivaGroups as Record<string, unknown>[]).slice(0, 10).map((g) => ({ ivaRate: int(g.ivaRate), afipId: int(g.afipId), baseCents: int(g.baseCents), amountCents: int(g.amountCents) })),
    lines: (r.lines as Record<string, unknown>[]).slice(0, 200).map((l) => ({ description: String(l.description ?? '').slice(0, 200), quantity: int(l.quantity), totalCents: int(l.totalCents), ivaRate: int(l.ivaRate) })),
  }
  const numbers = [out.pointOfSale, out.cbteTipo, out.number, out.receiver.docType, ...Object.values(out.amounts), ...out.ivaGroups.flatMap((g) => Object.values(g)), ...out.lines.flatMap((l) => [l.quantity, l.totalCents, l.ivaRate])]
  if (numbers.some((n) => Number.isNaN(n)) || !out.caea || Number.isNaN(new Date(out.issuedAt).getTime())) return null
  return out
}

/**
 * Guarda el comprobante CAEA que el equipo emitió sin internet. Idempotente
 * por orden. Nunca lanza por el fondo: lo que no cierra queda en revisión.
 */
export async function recordOfflineCaeaInvoice(input: {
  tenantId: string
  locationId: string
  orderId: mongoose.Types.ObjectId | string
  deviceId: string | null
  trusted: boolean
  invoice: OfflineCaeaInvoice
  printedPrinterIds: string[]
  userId: string
}): Promise<IFiscalDocument> {
  const tenantId = new mongoose.Types.ObjectId(input.tenantId)
  const idempotencyKey = `invoice:${String(input.orderId)}`
  const existing = await FiscalDocument.findOne({ tenantId, idempotencyKey })
  if (existing && existing.status !== 'pending' && existing.status !== 'retrying') return existing

  const inv = input.invoice
  const problems: string[] = []
  const [profile, order, device] = await Promise.all([
    FiscalProfile.findOne({ tenantId }).select(PROFILE_FIELDS).lean<ProfileLean>(),
    Order.findOne({ _id: input.orderId, tenantId }).select('locationId posId orderNumber total').lean<{ _id: mongoose.Types.ObjectId; locationId: mongoose.Types.ObjectId; posId?: string; orderNumber?: string; total: number }>(),
    input.deviceId ? PosOfflineDevice.findOne({ tenantId, deviceId: input.deviceId, revokedAt: null }).lean<{ contingencyPointOfSale?: number | null; locationId: mongoose.Types.ObjectId }>() : null,
  ])
  if (!order) throw PosError.notFound('Orden no encontrada')
  const environment = profile?.environment ?? 'homologation'
  const issuedAt = new Date(inv.issuedAt)

  if (!input.trusted || !device) problems.push('el equipo no está habilitado sin internet')
  else if (device.contingencyPointOfSale !== inv.pointOfSale) problems.push(`el punto de venta ${inv.pointOfSale} no es el del equipo`)
  const { period, order: half } = caeaPeriodOf(issuedAt)
  const caea = await CaeaPeriod.findOne({ tenantId, environment, period, order: half }).lean<{ caea: string; validTo: Date | null }>()
  if (!caea || caea.caea !== inv.caea) problems.push('el CAEA no es el de la quincena de emisión')
  if (inv.amounts.totalCents !== order.total) problems.push('el total del comprobante no coincide con el de la venta')
  if (inv.cbteTipo !== cbteTipoFor(inv.letter, 'invoice')) problems.push('tipo de comprobante inconsistente')
  let receiver = { condition: inv.receiver.condition, docType: inv.receiver.docType, docNumber: inv.receiver.docNumber, name: inv.receiver.name } as IFiscalDocument['receiver']
  if (profile?.ivaCondition) {
    try {
      const resolved = resolveReceiver(profile.ivaCondition, { condition: inv.receiver.condition as ReceiverInput['condition'], docNumber: inv.receiver.docNumber === '0' ? '' : inv.receiver.docNumber, name: inv.receiver.name }, 0)
      if (resolved.letter !== inv.letter) problems.push(`la letra debería ser ${resolved.letter}`)
      receiver = resolved.receiver
    } catch (err) {
      problems.push(err instanceof Error ? err.message : 'receptor inválido')
    }
  }
  const clash = await FiscalDocument.exists({ tenantId, environment, pointOfSale: inv.pointOfSale, cbteTipo: inv.cbteTipo, number: inv.number })
  if (clash) problems.push(`el número ${inv.number} ya existe en ese punto de venta`)

  const ok = problems.length === 0
  const fields = {
    tenantId,
    locationId: order.locationId,
    orderId: order._id,
    orderPosId: order.posId ?? null,
    orderNumber: order.orderNumber ?? null,
    kind: 'invoice' as const,
    letter: inv.letter,
    cbteTipo: inv.cbteTipo,
    pointOfSale: inv.pointOfSale,
    environment,
    issuerCuit: profile?.cuit ?? null,
    status: ok ? ('authorized' as const) : ('needs_review' as const),
    // Si el número choca, no se ocupa (el índice único lo impediría).
    number: clash ? null : inv.number,
    reservedNumber: null,
    issuedAt,
    receiver,
    amounts: inv.amounts,
    ivaGroups: inv.ivaGroups,
    lines: inv.lines,
    cae: inv.caea,
    caeExpiresAt: caea?.validTo ?? null,
    authMode: 'caea' as const,
    caeaInformedAt: null,
    // En revisión no se informa solo: lo decide una persona.
    caeaReportStatus: ok ? ('pending' as const) : ('not_applicable' as const),
    qrUrl: profile?.cuit
      ? arcaQrUrl({ issuedAt, cuit: profile.cuit, pointOfSale: inv.pointOfSale, cbteTipo: inv.cbteTipo, number: inv.number, totalCents: inv.amounts.totalCents, docType: receiver.docType, docNumber: receiver.docNumber, cae: inv.caea, authType: 'A' })
      : null,
    arca: {
      attempts: 0,
      lastAttemptAt: null,
      nextAttemptAt: null,
      lastErrorKind: ok ? '' : 'review',
      lastError: ok ? '' : `Factura sin internet para revisar: ${problems.join('; ')}`,
      observations: [{ code: 'CAEA_OFFLINE', message: `Emitida sin internet por el equipo ${input.deviceId ?? '?'} y entregada al cliente.` }],
    },
    review: ok
      ? { code: '', message: '', at: null, resolvedBy: null, resolvedAt: null }
      : { code: 'caea_offline_mismatch', message: `Factura emitida sin internet: ${problems.join('; ')}. El cliente ya tiene el papel.`, at: new Date(), resolvedBy: null, resolvedAt: null },
    idempotencyKey,
    createdBy: input.userId,
  }

  let doc: IFiscalDocument
  if (existing) {
    existing.set(fields)
    doc = await existing.save()
  } else {
    try {
      doc = await FiscalDocument.create(fields)
    } catch (err) {
      if ((err as { code?: number })?.code === 11000) {
        const winner = await FiscalDocument.findOne({ tenantId, idempotencyKey })
        if (winner) return winner
      }
      throw err
    }
  }

  if (ok) {
    // El equipo ya numeró: el contador del server no puede quedar atrás.
    await FiscalCounter.updateOne(
      { tenantId, environment, pointOfSale: inv.pointOfSale, cbteTipo: inv.cbteTipo },
      { $max: { last: inv.number } },
      { upsert: true }
    )
    // ¿Ya salió por la red local? Entonces no se imprime otra vez.
    const printer = await printerForDocument(tenantId, order.locationId, 'factura')
    if (printer && input.printedPrinterIds.includes(String(printer._id))) {
      await FiscalDocument.updateOne({ _id: doc._id }, { $set: { 'printing.status': 'printed', 'printing.printedAt': issuedAt } })
    } else {
      await enqueueFiscalTicket(doc).catch((err) => console.error('[offlineFiscal] no se pudo encolar el ticket:', err))
    }
  }
  return doc
}
