import mongoose from 'mongoose'
import CaeaPeriod from '@/models/CaeaPeriod'
import FiscalCounter from '@/models/FiscalCounter'
import FiscalDocument, { type IFiscalDocument } from '@/models/FiscalDocument'
import FiscalProfile from '@/models/FiscalProfile'
import { RECEIVER_IVA_CONDITION_IDS, cbteTipo, type IssuerIvaCondition } from '@takeasygo/business'
import { arcaQrUrl } from './qr'
import { openArcaSession } from './arca/session'
import {
  caeaPeriodFor,
  feCaeaObtener,
  feCaeaRegInformativo,
  feCaeaSinMovimiento,
  feCompUltimoAutorizado,
  nextCaeaPeriod,
  toArcaDate,
  type FetchLike,
} from './arca/wsfe'

// ============================================================================
// Contingencia CAEA (Fase 6 de caja, 2026-10)
// ============================================================================
// Docs: ADMIN/FASE6_ONLINE_POINT_CAEA_LIBRO_DIGITAL.md
//
//   1. Por adelantado (cron diario): se pide el CAEA de la quincena actual y,
//      desde 5 días antes, el de la siguiente. Se sincronizan los contadores
//      locales de los puntos de venta de contingencia con ARCA.
//   2. Al facturar, si ARCA no responde y el pedido de CAE NUNCA salió, el
//      comprobante se emite con el CAEA, en el punto de venta de contingencia
//      de la sede, con numeración local atómica. Es un comprobante válido:
//      lleva el CAEA y el QR con tipo de autorización «A».
//
// Orden de ejecución 31/10 (contraste con arca.gob.ar/fe/emision-autorizacion/
// contingencias.asp, consultado el 31/10/2026, RG 5782):
//   · La contingencia es EXCEPCIONAL: si los comprobantes CAEA llegan al 5 %
//     de los del mes de la sucursal (2 meses seguidos o 3 alternados), ARCA
//     puede suspender la factura electrónica por un año. Por eso NO es
//     automática salvo que el comercio lo active (`contingency.automatic`), y
//     aun así se frena antes de llegar al 4 % del mes de la sede.
//   · Factura C con CAEA: sin confirmar en el manual WSFEv1 v4.7 (un resumen
//     indica «CAEA solo para A y B»). Bloqueada hasta validarlo con el manual
//     y el contador.
//   · Un informe rechazado NO deja el comprobante como autorizado: pasa a
//     `needs_review` con caeaReportStatus 'rejected'.
//   3. Después (cron diario, con conexión): cada comprobante CAEA se informa
//      con FECAEARegInformativo; los puntos de contingencia sin uso en una
//      quincena terminada se informan «sin movimiento». ARCA da 8 días
//      corridos desde el fin de la quincena (FchTopeInf).
// ============================================================================

interface ContingencyProfile {
  enabled: boolean
  cuit: string
  environment: 'homologation' | 'production'
  ivaCondition: IssuerIvaCondition | null
  contingency?: { enabled?: boolean; automatic?: boolean; pointsOfSale?: { locationId: mongoose.Types.ObjectId; number: number }[] }
}

/** Tope propio, por debajo del 5 % de ARCA (RG 5782), por sede y mes. */
export const CAEA_MONTHLY_SHARE_LIMIT = 0.04
/** Por debajo de este volumen mensual, un solo CAEA ya «supera» el porcentaje. */
const CAEA_MIN_MONTHLY_DOCS = 25

export type CaeaTrigger = 'automatic' | 'manual'

/** ¿Este comprobante puede salir con CAEA? Motivo legible si no. */
export async function caeaEligibility(
  doc: IFiscalDocument,
  profile: ContingencyProfile | null,
  trigger: CaeaTrigger,
  now = new Date()
): Promise<{ ok: true; pointOfSale: number } | { ok: false; reason: string }> {
  if (!profile) return { ok: false, reason: 'La contingencia CAEA no está habilitada para este comercio' }
  if (trigger === 'automatic' && !profile.contingency?.automatic) {
    return { ok: false, reason: 'La contingencia no es automática: la decide una persona' }
  }
  if (doc.authMode === 'caea') return { ok: false, reason: 'El comprobante ya está en contingencia' }
  if (doc.environment !== profile.environment || !doc.issuerCuit || doc.issuerCuit !== profile.cuit) {
    return { ok: false, reason: 'El comprobante es de otro ambiente o CUIT que la configuración actual' }
  }
  if (doc.letter === 'C') {
    return { ok: false, reason: 'Factura C con CAEA sin validar en el manual de ARCA: no se usa contingencia' }
  }
  if (doc.reservedNumber !== null) {
    return { ok: false, reason: 'El pedido de CAE pudo haber llegado a ARCA: primero hay que consultarlo' }
  }
  const pos = profile.contingency?.pointsOfSale?.find((p) => String(p.locationId) === String(doc.locationId))
  if (!pos) return { ok: false, reason: 'La sede no tiene punto de venta de contingencia' }

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 3))
  const base = { tenantId: doc.tenantId, locationId: doc.locationId, environment: doc.environment, createdAt: { $gte: monthStart } }
  const [total, viaCaea] = await Promise.all([
    FiscalDocument.countDocuments({ ...base, status: { $in: ['authorized', 'needs_review'] } }),
    FiscalDocument.countDocuments({ ...base, authMode: 'caea' }),
  ])
  const share = (viaCaea + 1) / Math.max(total + 1, CAEA_MIN_MONTHLY_DOCS)
  if (trigger === 'automatic' && share > CAEA_MONTHLY_SHARE_LIMIT) {
    return { ok: false, reason: `La contingencia ya cubre ${Math.round(share * 100)} % del mes de la sede: no sale sola` }
  }
  return { ok: true, pointOfSale: pos.number }
}

async function loadContingency(tenantId: mongoose.Types.ObjectId | string): Promise<ContingencyProfile | null> {
  const p = await FiscalProfile.findOne({ tenantId }).select('enabled cuit environment ivaCondition contingency').lean<ContingencyProfile>()
  return p?.enabled && p.contingency?.enabled ? p : null
}

/** Tipos de comprobante que puede emitir el comercio (para sincronizar contadores). */
function tiposFor(issuer: IssuerIvaCondition): number[] {
  return issuer === 'responsable_inscripto'
    ? [cbteTipo('A', 'invoice'), cbteTipo('A', 'credit_note'), cbteTipo('B', 'invoice'), cbteTipo('B', 'credit_note')]
    : [cbteTipo('C', 'invoice'), cbteTipo('C', 'credit_note')]
}

/**
 * Emite un comprobante pendiente con el CAEA vigente. null si no corresponde
 * (con `onIneligible` se conoce el motivo, p. ej. para mostrarlo al operador).
 */
export async function issueWithCaea(
  doc: IFiscalDocument,
  options: { trigger: CaeaTrigger; onIneligible?: (reason: string) => void }
): Promise<IFiscalDocument | null> {
  const profile = await loadContingency(doc.tenantId)
  const now = new Date()
  const eligible = await caeaEligibility(doc, profile, options.trigger, now)
  if (!eligible.ok) {
    options.onIneligible?.(eligible.reason)
    return null
  }
  const contingencyPos = { number: eligible.pointOfSale }

  const { period, order } = caeaPeriodFor(now)
  const caea = await CaeaPeriod.findOne({ tenantId: doc.tenantId, environment: doc.environment, period, order }).lean()
  if (!caea || (caea.validTo && toArcaDate(now) > toArcaDate(caea.validTo))) {
    options.onIneligible?.('No hay un CAEA vigente para esta quincena')
    return null
  }

  const counter = await FiscalCounter.findOneAndUpdate(
    { tenantId: doc.tenantId, environment: doc.environment, pointOfSale: contingencyPos.number, cbteTipo: doc.cbteTipo },
    { $inc: { last: 1 } },
    { upsert: true, new: true }
  )
  const number = counter!.last

  doc.pointOfSale = contingencyPos.number
  doc.number = number
  doc.reservedNumber = null
  doc.issuedAt = now
  doc.cae = caea.caea
  doc.caeExpiresAt = caea.validTo
  doc.authMode = 'caea'
  doc.caeaInformedAt = null
  doc.caeaReportStatus = 'pending'
  doc.status = 'authorized'
  doc.qrUrl = arcaQrUrl({
    issuedAt: now,
    cuit: doc.issuerCuit!,
    pointOfSale: doc.pointOfSale,
    cbteTipo: doc.cbteTipo,
    number,
    totalCents: doc.amounts.totalCents,
    docType: doc.receiver.docType,
    docNumber: doc.receiver.docNumber,
    cae: caea.caea,
    authType: 'A',
  })
  doc.arca.lastError = ''
  doc.arca.lastErrorKind = ''
  doc.arca.nextAttemptAt = null
  doc.arca.observations = [
    {
      code: 'CAEA',
      message: `Emitido en contingencia (${options.trigger === 'manual' ? 'decisión del operador' : 'automática'}). Pendiente de informar a ARCA.`,
    },
  ]
  await doc.save()
  return doc
}

/** Pide/guarda los CAEA vigentes y sincroniza los contadores de contingencia. */
export async function ensureCaea(
  tenantId: mongoose.Types.ObjectId | string,
  options: { fetchImpl?: FetchLike; now?: Date } = {}
): Promise<{ periods: string[] }> {
  const profile = await loadContingency(tenantId)
  if (!profile?.ivaCondition) return { periods: [] }
  const now = options.now ?? new Date()
  const session = await openArcaSession(tenantId, { fetchImpl: options.fetchImpl })

  const wanted = [caeaPeriodFor(now)]
  const next = nextCaeaPeriod(now)
  // Desde 5 días antes del inicio de la próxima quincena.
  const in5 = caeaPeriodFor(new Date(now.getTime() + 5 * 86_400_000))
  if (in5.period === next.period && in5.order === next.order) wanted.push(next)

  const done: string[] = []
  for (const w of wanted) {
    const exists = await CaeaPeriod.exists({ tenantId, environment: profile.environment, period: w.period, order: w.order })
    if (!exists) {
      const info = await feCaeaObtener(session.environment, session.auth, w.period, w.order, session.fetchImpl)
      await CaeaPeriod.updateOne(
        { tenantId, environment: profile.environment, period: w.period, order: w.order },
        { $setOnInsert: { caea: info.caea, validFrom: info.validFrom, validTo: info.validTo, reportDeadline: info.reportDeadline } },
        { upsert: true }
      )
    }
    done.push(`${w.period}-${w.order}`)
  }

  // Contadores locales nunca por detrás de ARCA.
  for (const pos of profile.contingency?.pointsOfSale ?? []) {
    for (const tipo of tiposFor(profile.ivaCondition)) {
      const last = await feCompUltimoAutorizado(session.environment, session.auth, pos.number, tipo, session.fetchImpl)
      await FiscalCounter.updateOne(
        { tenantId, environment: profile.environment, pointOfSale: pos.number, cbteTipo: tipo },
        { $max: { last } },
        { upsert: true }
      )
    }
  }
  return { periods: done }
}

/** Informa a ARCA los comprobantes CAEA pendientes y los puntos sin movimiento. */
export async function informCaea(
  tenantId: mongoose.Types.ObjectId | string,
  options: { fetchImpl?: FetchLike; now?: Date } = {}
): Promise<{ informed: number; rejected: number; noMovement: number }> {
  const profile = await loadContingency(tenantId)
  const result = { informed: 0, rejected: 0, noMovement: 0 }
  const ident = await FiscalProfile.findOne({ tenantId })
    .select('cuit environment')
    .lean<{ cuit?: string; environment?: 'homologation' | 'production' }>()
  if (!ident?.cuit || !ident.environment) return result
  // Solo los del CUIT y ambiente vigentes: la sesión es de esa identidad.
  const pending = await FiscalDocument.find({
    tenantId,
    authMode: 'caea',
    caeaReportStatus: 'pending',
    environment: ident.environment,
    issuerCuit: ident.cuit,
  })
    .sort({ issuedAt: 1 })
    .limit(100)
  if (pending.length === 0 && !profile) return result
  const session = await openArcaSession(tenantId, {
    fetchImpl: options.fetchImpl,
    expect: { environment: ident.environment, cuit: ident.cuit },
  })

  for (const doc of pending) {
    const r = await feCaeaRegInformativo(
      session.environment,
      session.auth,
      {
        caea: doc.cae!,
        pointOfSale: doc.pointOfSale,
        cbteTipo: doc.cbteTipo,
        concepto: 1,
        docTipo: doc.receiver.docType,
        docNro: doc.receiver.docNumber,
        number: doc.number!,
        date: doc.issuedAt,
        totalCents: doc.amounts.totalCents,
        netCents: doc.amounts.netCents,
        exemptCents: doc.amounts.exemptCents,
        ivaCents: doc.amounts.ivaCents,
        receiverIvaConditionId: RECEIVER_IVA_CONDITION_IDS[doc.receiver.condition],
        iva: doc.ivaGroups.filter((g) => g.ivaRate > 0).map((g) => ({ afipId: g.afipId, baseCents: g.baseCents, amountCents: g.amountCents })),
        associated: doc.associated
          ? [{ cbteTipo: doc.associated.cbteTipo, pointOfSale: doc.associated.pointOfSale, number: doc.associated.number, cuit: session.cuit, date: doc.associated.issuedAt }]
          : undefined,
      },
      session.fetchImpl
    )
    if (r.result === 'A') {
      doc.caeaInformedAt = new Date()
      doc.caeaReportStatus = 'informed'
      result.informed++
    } else {
      // El comprobante ya se entregó con el CAEA, pero ARCA no lo validó: NO
      // puede seguir figurando como autorizado sin más. Revisión manual.
      const message = `ARCA no aceptó el informe del CAEA: ${(r.observations[0] ?? r.errors[0])?.message ?? 'revisar'}`
      doc.arca.observations = [...r.observations, ...r.errors]
      doc.arca.lastError = message
      doc.arca.lastErrorKind = 'review'
      doc.caeaReportStatus = 'rejected'
      doc.status = 'needs_review'
      doc.review = { code: 'caea_report_rejected', message, at: new Date(), resolvedBy: null, resolvedAt: null }
      result.rejected++
    }
    await doc.save()
  }

  // Quincenas terminadas: puntos de contingencia que no usaron el CAEA.
  if (profile) {
    const now = options.now ?? new Date()
    // Quincenas terminadas en los últimos 30 días (el plazo de ARCA es de 8).
    const ended = await CaeaPeriod.find({
      tenantId,
      environment: profile.environment,
      validTo: { $lt: now, $gte: new Date(now.getTime() - 30 * 86_400_000) },
    })
    for (const period of ended) {
      for (const pos of profile.contingency?.pointsOfSale ?? []) {
        if (period.noMovementInformed.includes(pos.number)) continue
        const used = await FiscalDocument.exists({ tenantId, authMode: 'caea', cae: period.caea, pointOfSale: pos.number })
        if (used) continue
        await feCaeaSinMovimiento(session.environment, session.auth, pos.number, period.caea, session.fetchImpl)
        period.noMovementInformed.push(pos.number)
        result.noMovement++
      }
      await period.save()
    }
  }
  return result
}
