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
  contingency?: { enabled?: boolean; pointsOfSale?: { locationId: mongoose.Types.ObjectId; number: number }[] }
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

/** Emite un comprobante pendiente con el CAEA vigente. null si no se puede. */
export async function issueWithCaea(doc: IFiscalDocument): Promise<IFiscalDocument | null> {
  const profile = await loadContingency(doc.tenantId)
  if (!profile || doc.authMode === 'caea') return null
  const contingencyPos = profile.contingency?.pointsOfSale?.find((p) => String(p.locationId) === String(doc.locationId))
  if (!contingencyPos) return null

  const now = new Date()
  const { period, order } = caeaPeriodFor(now)
  const caea = await CaeaPeriod.findOne({ tenantId: doc.tenantId, environment: profile.environment, period, order }).lean()
  if (!caea) return null
  if (caea.validTo && toArcaDate(now) > toArcaDate(caea.validTo)) return null

  const counter = await FiscalCounter.findOneAndUpdate(
    { tenantId: doc.tenantId, environment: profile.environment, pointOfSale: contingencyPos.number, cbteTipo: doc.cbteTipo },
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
  doc.status = 'authorized'
  doc.qrUrl = arcaQrUrl({
    issuedAt: now,
    cuit: profile.cuit,
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
  doc.arca.observations = [{ code: 'CAEA', message: 'Emitido en contingencia (ARCA sin respuesta). Se informa automáticamente.' }]
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
  const pending = await FiscalDocument.find({ tenantId, authMode: 'caea', status: 'authorized', caeaInformedAt: null }).sort({ issuedAt: 1 }).limit(100)
  if (pending.length === 0 && !profile) return result
  const session = await openArcaSession(tenantId, { fetchImpl: options.fetchImpl })

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
      result.informed++
    } else {
      doc.arca.observations = [...r.observations, ...r.errors]
      doc.arca.lastError = `ARCA no aceptó el informe del CAEA: ${(r.observations[0] ?? r.errors[0])?.message ?? 'revisar'}`
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
