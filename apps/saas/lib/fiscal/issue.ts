import mongoose from 'mongoose'
import FiscalDocument, { type IFiscalDocument, type ReceiverCondition } from '@/models/FiscalDocument'
import FiscalProfile from '@/models/FiscalProfile'
import FiscalSequenceLock from '@/models/FiscalSequenceLock'
import Order from '@/models/Order'
import {
  RECEIVER_IVA_CONDITION_IDS,
  cbteTipo as cbteTipoFor,
  computeIvaBreakdown,
  invoiceLetterFor,
  isValidCuit,
  normalizeCuit,
  type IssuerIvaCondition,
} from '@takeasygo/business'
import { runAfterResponse } from '@/lib/after-response'
import { enqueueFiscalTicket } from './ticket'
import { issueWithCaea } from './caea'
import { buildFiscalLines, ivaRatesForLocation } from './order-lines'
import { arcaQrUrl } from './qr'
import { openArcaSession, type ArcaSession } from './arca/session'
import {
  ArcaError,
  feCaeSolicitar,
  feCompConsultar,
  feCompUltimoAutorizado,
  toArcaDate,
  type ConsultResult,
  type FetchLike,
} from './arca/wsfe'

// ============================================================================
// Emisión de comprobantes (Fase 5 de caja, 2026-10)
// ============================================================================
// Docs: ADMIN/FASE5_COMPROBANTES_NC_LIBRO_IVA.md
//
// Flujo de una factura:
//   1. Documento `pending` con idempotencyKey (`invoice:<orderId>`): un
//      reintento del POS devuelve el mismo, nunca emite otro.
//   2. Candado por (comercio, ambiente, punto de venta, tipo): un comprobante
//      a la vez (ARCA numera «último + 1»).
//   3. Si un intento anterior quedó colgado con `reservedNumber`, primero se
//      CONSULTA ese número en ARCA: si quedó autorizado con el mismo total, se
//      adopta (sin duplicar); si no existe, se pide uno nuevo.
//   4. último autorizado + 1 → FECAESolicitar.
//        A → autorizado (CAE, vencimiento, QR).
//        R → rechazado con las observaciones de ARCA (el número no se consume).
//        timeout / red → `retrying` con el número reservado; lo retoma el
//        cron o el botón «Reintentar».
//   5. Un error 10016 (número desfasado) reintenta una vez desde el paso 4;
//      un error de autorización renueva el ticket una vez.
//
// La venta NUNCA se corta por la factura: el cobro ya ocurrió.
// ============================================================================

/** Por encima de este total, la factura a consumidor final identifica al cliente. */
export const CF_IDENTIFICATION_THRESHOLD_CENTS = 1_000_000_000 // $10.000.000 — verificar con el contador (RG vigente)

const LOCK_MS = 45_000
const LOCK_WAIT_MS = 30_000
const LOCK_STEP_MS = 400

export class FiscalIssueError extends Error {
  constructor(
    message: string,
    readonly status = 409
  ) {
    super(message)
    this.name = 'FiscalIssueError'
  }
}

export interface ReceiverInput {
  condition?: ReceiverCondition
  /** CUIT (Factura A) o DNI (consumidor final identificado). */
  docNumber?: string | null
  name?: string | null
}

interface ProfileForIssue {
  enabled: boolean
  cuit: string
  ivaCondition: IssuerIvaCondition | null
  defaultIvaRate: number
  environment: 'homologation' | 'production'
  pointsOfSale: { locationId: mongoose.Types.ObjectId; number: number }[]
}

async function loadProfile(tenantId: mongoose.Types.ObjectId): Promise<ProfileForIssue> {
  const p = await FiscalProfile.findOne({ tenantId })
    .select('enabled cuit ivaCondition defaultIvaRate environment pointsOfSale')
    .lean<ProfileForIssue>()
  if (!p?.enabled || !p.ivaCondition) throw new FiscalIssueError('La facturación no está activa para este comercio')
  return p
}

function pointOfSaleFor(profile: ProfileForIssue, locationId: mongoose.Types.ObjectId | string): number {
  const pos = profile.pointsOfSale.find((p) => String(p.locationId) === String(locationId))
  if (!pos) throw new FiscalIssueError('Esta sede no tiene punto de venta de ARCA configurado')
  return pos.number
}

/** Valida y normaliza el receptor según la letra del comprobante. */
export function resolveReceiver(
  issuer: IssuerIvaCondition,
  input: ReceiverInput,
  totalCents: number
): { letter: 'A' | 'B' | 'C'; receiver: IFiscalDocument['receiver'] } {
  const condition: ReceiverCondition = input.condition ?? 'consumidor_final'
  const letter = invoiceLetterFor(issuer, condition)
  const doc = (input.docNumber ?? '').replace(/\D/g, '')
  const name = (input.name ?? '').trim().slice(0, 120)

  if (condition !== 'consumidor_final' && condition !== 'no_categorizado') {
    if (!isValidCuit(doc)) throw new FiscalIssueError('Ingresá un CUIT válido del cliente', 400)
    return { letter, receiver: { condition, docType: 80, docNumber: normalizeCuit(doc), name } }
  }
  if (doc.length === 11 && isValidCuit(doc)) return { letter, receiver: { condition, docType: 80, docNumber: doc, name } }
  if (doc.length >= 7 && doc.length <= 8) return { letter, receiver: { condition, docType: 96, docNumber: doc, name } }
  if (doc.length > 0) throw new FiscalIssueError('El DNI o CUIT del cliente no es válido', 400)
  if (totalCents >= CF_IDENTIFICATION_THRESHOLD_CENTS) {
    throw new FiscalIssueError('Por el monto, ARCA pide identificar al cliente: cargá su DNI o CUIT', 400)
  }
  return { letter, receiver: { condition, docType: 99, docNumber: '0', name } }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function withSequenceLock<T>(
  key: { tenantId: mongoose.Types.ObjectId; environment: string; pointOfSale: number; cbteTipo: number },
  fn: () => Promise<T>
): Promise<T> {
  const holder = new mongoose.Types.ObjectId().toString()
  const started = Date.now()
  for (;;) {
    const now = new Date()
    try {
      const got = await FiscalSequenceLock.findOneAndUpdate(
        { ...key, $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }] },
        { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS), holder } },
        { upsert: true, new: true }
      )
      if (got?.holder === holder) break
    } catch (err) {
      // Upsert concurrente sobre el índice único: otro tiene el candado.
      if ((err as { code?: number })?.code !== 11000) throw err
    }
    if (Date.now() - started > LOCK_WAIT_MS) {
      throw new ArcaError('timeout', 'Hay otra factura emitiéndose en este punto de venta. Probá de nuevo.')
    }
    await sleep(LOCK_STEP_MS)
  }
  try {
    return await fn()
  } finally {
    await FiscalSequenceLock.updateOne({ ...key, holder }, { $set: { lockedUntil: null, holder: null } })
  }
}

/** Espera progresiva entre reintentos automáticos: 1, 2, 4… hasta 60 min. */
export function nextAttemptDelayMs(attempts: number, kind: string): number {
  // Credenciales o configuración: no tiene sentido insistir cada minuto.
  if (kind === 'auth') return 15 * 60_000
  const minutes = Math.min(60, 2 ** Math.max(0, attempts - 1))
  return minutes * 60_000
}

/** Pasa el comprobante a revisión manual: el sistema no decide solo. */
async function markNeedsReview(doc: IFiscalDocument, code: string, message: string): Promise<IFiscalDocument> {
  doc.status = 'needs_review'
  doc.review = { code, message, at: new Date(), resolvedBy: null, resolvedAt: null }
  doc.arca.lastError = message
  doc.arca.lastErrorKind = 'review'
  doc.arca.nextAttemptAt = null
  await doc.save()
  return doc
}

/** ¿El comprobante que informa ARCA para el número reservado es ESTE? */
export function sameDocument(doc: IFiscalDocument, found: ConsultResult, number: number): { ok: boolean; mismatch: string[] } {
  const id = found.identity
  const expectedDocNumber = doc.receiver.docType === 99 ? '0' : doc.receiver.docNumber
  const checks: [string, boolean][] = [
    ['punto de venta', id.pointOfSale === doc.pointOfSale],
    ['tipo de comprobante', id.cbteTipo === doc.cbteTipo],
    ['número', id.number === number],
    ['fecha', id.date === toArcaDate(doc.issuedAt)],
    ['tipo de documento del receptor', id.docType === doc.receiver.docType],
    ['documento del receptor', String(Number(id.docNumber ?? 'NaN')) === String(Number(expectedDocNumber))],
    ['importe total', found.totalCents === doc.amounts.totalCents],
    ['neto', id.netCents === null || id.netCents === doc.amounts.netCents],
    ['IVA', id.ivaCents === null || id.ivaCents === doc.amounts.ivaCents],
    ['resultado', found.result === 'A' && Boolean(found.cae)],
  ]
  const mismatch = checks.filter(([, ok]) => !ok).map(([label]) => label)
  return { ok: mismatch.length === 0, mismatch }
}

async function markAuthorized(
  doc: IFiscalDocument,
  number: number,
  cae: string,
  caeExpiresAt: Date | null,
  cuit: string,
  observations: { code: string; message: string }[] = []
): Promise<IFiscalDocument> {
  doc.status = 'authorized'
  doc.number = number
  doc.reservedNumber = null
  doc.cae = cae
  doc.caeExpiresAt = caeExpiresAt
  doc.qrUrl = arcaQrUrl({
    issuedAt: doc.issuedAt,
    cuit,
    pointOfSale: doc.pointOfSale,
    cbteTipo: doc.cbteTipo,
    number,
    totalCents: doc.amounts.totalCents,
    docType: doc.receiver.docType,
    docNumber: doc.receiver.docNumber,
    cae,
  })
  doc.arca.observations = observations
  doc.arca.lastError = ''
  doc.arca.lastErrorKind = ''
  doc.arca.nextAttemptAt = null
  try {
    await doc.save()
  } catch (err) {
    // Índice único de numeración: otro comprobante NUESTRO ya tiene ese número.
    // Nunca se pisa: queda para revisión (no reintenta en bucle).
    if ((err as { code?: number })?.code === 11000) {
      const fresh = await FiscalDocument.findById(doc._id)
      if (!fresh) throw err
      fresh.reservedNumber = number
      return markNeedsReview(
        fresh,
        'duplicate_number',
        `ARCA autorizó el número ${number}, pero otro comprobante del sistema ya lo tiene. Revisar antes de reintentar.`
      )
    }
    throw err
  }
  return doc
}

/**
 * Pide (o recupera) el CAE de un documento pendiente. Idempotente.
 *
 * Orden de ejecución 31/10:
 *   · La identidad fiscal es la DEL COMPROBANTE (ambiente + CUIT con que se
 *     creó), no la del perfil actual. Si no coinciden ⇒ `needs_review`, sin
 *     llamar a ARCA.
 *   · Dentro del candado se RELEE el comprobante: si otro proceso ya lo
 *     resolvió, no se hace nada.
 *   · Recuperar un número reservado exige que coincidan todos los datos del
 *     comprobante (no solo el importe); si ARCA tiene ese número con otros
 *     datos ⇒ `needs_review`.
 *   · Errores clasificados con espera progresiva; CAEA solo si el comercio la
 *     habilitó como automática y es elegible (ver caea.ts).
 */
export async function authorizeDocument(
  input: IFiscalDocument,
  options: { fetchImpl?: FetchLike; allowContingency?: boolean } = {}
): Promise<IFiscalDocument> {
  if (input.status === 'authorized' || input.status === 'rejected' || input.status === 'needs_review') return input

  return withSequenceLock(
    { tenantId: input.tenantId, environment: input.environment, pointOfSale: input.pointOfSale, cbteTipo: input.cbteTipo },
    async () => {
      const doc = (await FiscalDocument.findById(input._id)) ?? input
      if (doc.status === 'authorized' || doc.status === 'rejected' || doc.status === 'needs_review') return doc

      if (!doc.issuerCuit) {
        return markNeedsReview(doc, 'missing_identity', 'El comprobante no tiene CUIT del emisor registrado. No se emite.')
      }
      const expect = { environment: doc.environment, cuit: doc.issuerCuit }

      // La sesión se abre adentro del try: si ARCA no responde ya en la
      // autenticación, el comprobante queda en reintento (no tira error al POS).
      let session: ArcaSession | null = null
      const call = async <T>(fn: (s: ArcaSession) => Promise<T>): Promise<T> => {
        session ??= await openArcaSession(doc.tenantId, { fetchImpl: options.fetchImpl, expect })
        try {
          return await fn(session)
        } catch (err) {
          if (err instanceof ArcaError && err.kind === 'auth' && err.code === '600') {
            session = await openArcaSession(doc.tenantId, { fetchImpl: options.fetchImpl, forceRefresh: true, expect })
            return fn(session)
          }
          throw err
        }
      }

      doc.arca.attempts += 1
      doc.arca.lastAttemptAt = new Date()

      try {
        // 3. ¿Quedó autorizado el número de un intento colgado?
        if (doc.reservedNumber) {
          const reserved = doc.reservedNumber
          const prev = await call((s) => feCompConsultar(s.environment, s.auth, doc.pointOfSale, doc.cbteTipo, reserved, s.fetchImpl))
          if (prev.found) {
            const match = sameDocument(doc, prev, reserved)
            if (!match.ok) {
              return markNeedsReview(
                doc,
                'arca_number_mismatch',
                `ARCA tiene el número ${reserved} con otros datos (${match.mismatch.join(', ')}). No se adopta ese CAE: revisar.`
              )
            }
            const taken = await FiscalDocument.exists({
              _id: { $ne: doc._id },
              tenantId: doc.tenantId,
              environment: doc.environment,
              pointOfSale: doc.pointOfSale,
              cbteTipo: doc.cbteTipo,
              number: reserved,
            })
            if (taken) {
              return markNeedsReview(doc, 'number_taken_locally', `Otro comprobante del sistema ya tiene el número ${reserved}. Revisar.`)
            }
            return markAuthorized(doc, reserved, prev.cae!, prev.caeExpiresAt, session!.cuit)
          }
          // ARCA no tiene ese número: el pedido anterior nunca se autorizó.
          doc.reservedNumber = null
        }

        for (let attempt = 0; attempt < 2; attempt++) {
          const last = await call((s) => feCompUltimoAutorizado(s.environment, s.auth, doc.pointOfSale, doc.cbteTipo, s.fetchImpl))
          const number = last + 1
          doc.reservedNumber = number
          doc.issuedAt = new Date()
          await doc.save()

          const result = await call((s) =>
            feCaeSolicitar(
              s.environment,
              s.auth,
              {
                pointOfSale: doc.pointOfSale,
                cbteTipo: doc.cbteTipo,
                concepto: 1,
                docTipo: doc.receiver.docType,
                docNro: doc.receiver.docNumber,
                number,
                date: doc.issuedAt,
                totalCents: doc.amounts.totalCents,
                netCents: doc.amounts.netCents,
                exemptCents: doc.amounts.exemptCents,
                ivaCents: doc.amounts.ivaCents,
                receiverIvaConditionId: RECEIVER_IVA_CONDITION_IDS[doc.receiver.condition],
                iva: doc.ivaGroups
                  .filter((g) => g.ivaRate > 0)
                  .map((g) => ({ afipId: g.afipId, baseCents: g.baseCents, amountCents: g.amountCents })),
                associated: doc.associated
                  ? [
                      {
                        cbteTipo: doc.associated.cbteTipo,
                        pointOfSale: doc.associated.pointOfSale,
                        number: doc.associated.number,
                        cuit: s.cuit,
                        date: doc.associated.issuedAt,
                      },
                    ]
                  : undefined,
              },
              s.fetchImpl
            )
          )

          if (result.result === 'A' && result.cae) {
            return markAuthorized(doc, number, result.cae, result.caeExpiresAt, session!.cuit, result.observations)
          }
          const desync = result.observations.some((o) => o.code === '10016')
          if (desync && attempt === 0) continue
          doc.status = 'rejected'
          doc.reservedNumber = null
          doc.arca.observations = [...result.observations, ...result.errors]
          doc.arca.lastError = (result.observations[0] ?? result.errors[0])?.message ?? 'ARCA rechazó el comprobante'
          doc.arca.lastErrorKind = 'rejected'
          doc.arca.nextAttemptAt = null
          await doc.save()
          return doc
        }
        return doc
      } catch (err) {
        if (err instanceof ArcaError && err.kind === 'identity') {
          return markNeedsReview(doc, err.code ?? 'identity_mismatch', err.message)
        }
        const kind = err instanceof ArcaError ? err.kind : 'internal'
        const transient = kind === 'timeout' || kind === 'network' || kind === 'fault'
        if (transient && doc.reservedNumber === null && options.allowContingency !== false) {
          // Contingencia CAEA: SOLO si el pedido de CAE nunca llegó a ARCA (sin
          // número reservado) y el comercio la habilitó como automática.
          const viaCaea = await issueWithCaea(doc, { trigger: 'automatic' }).catch((e) => {
            console.error('[fiscal/caea] no se pudo usar la contingencia:', e instanceof Error ? e.message : e)
            return null
          })
          if (viaCaea) return viaCaea
        }
        // El número (si se pidió) queda reservado: el próximo intento lo consulta.
        doc.status = 'retrying'
        doc.arca.lastError = err instanceof Error ? err.message : 'Error al emitir'
        doc.arca.lastErrorKind = kind
        doc.arca.nextAttemptAt = new Date(Date.now() + nextAttemptDelayMs(doc.arca.attempts, kind))
        await doc.save()
        // Transitorios y credenciales: la venta sigue, el comprobante queda en
        // reintento. Un error inesperado se propaga (además queda guardado).
        if (transient || kind === 'auth') return doc
        throw err
      }
    }
  )
}

interface OrderLean {
  _id: mongoose.Types.ObjectId
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  posId?: string | null
  orderNumber?: string | null
  total: number
  deliveryCost?: number
  status: string
  items: { menuItemId?: mongoose.Types.ObjectId; name: string; quantity: number; subtotal: number }[]
}

/**
 * Crea (o devuelve) la OBLIGACIÓN fiscal de una orden cobrada, sin llamar a
 * ARCA: un documento `pending` con la identidad fiscal congelada (CUIT y
 * ambiente del momento del cobro). Orden de ejecución 31/10 (P1.2): se llama
 * al confirmar el cobro, así una venta cobrada nunca queda fuera del circuito
 * aunque el POS se cierre antes de pedir la factura. Idempotente por orden.
 */
export async function prepareInvoiceForOrder(input: {
  tenantId: string
  orderId: mongoose.Types.ObjectId | string
  receiver: ReceiverInput
  userId: string
}): Promise<IFiscalDocument> {
  const tenantId = new mongoose.Types.ObjectId(input.tenantId)
  const idempotencyKey = `invoice:${String(input.orderId)}`
  const existing = await FiscalDocument.findOne({ tenantId, idempotencyKey })
  if (existing) return existing

  const profile = await loadProfile(tenantId)
  const order = await Order.findOne({ _id: input.orderId, tenantId }).lean<OrderLean>()
  if (!order) throw new FiscalIssueError('Orden no encontrada', 404)
  if (order.status === 'cancelled') throw new FiscalIssueError('La orden está anulada: no se factura')
  if (order.total <= 0) throw new FiscalIssueError('La orden no tiene importe para facturar')

  const pointOfSale = pointOfSaleFor(profile, order.locationId)
  const { letter, receiver } = resolveReceiver(profile.ivaCondition!, input.receiver, order.total)
  const rates = await ivaRatesForLocation(tenantId, order.locationId, profile.defaultIvaRate)
  const { lines, discountCents } = buildFiscalLines(order, rates, profile.defaultIvaRate)
  const breakdown = computeIvaBreakdown(lines, discountCents, profile.ivaCondition!)

  let doc: IFiscalDocument
  try {
    doc = await FiscalDocument.create({
      tenantId,
      locationId: order.locationId,
      orderId: order._id,
      orderPosId: order.posId ?? null,
      orderNumber: order.orderNumber ?? null,
      kind: 'invoice',
      letter,
      cbteTipo: cbteTipoFor(letter, 'invoice'),
      pointOfSale,
      environment: profile.environment,
      issuerCuit: profile.cuit,
      status: 'pending',
      issuedAt: new Date(),
      receiver,
      amounts: {
        totalCents: breakdown.totalCents,
        netCents: breakdown.netCents,
        ivaCents: breakdown.ivaCents,
        exemptCents: breakdown.exemptCents,
      },
      ivaGroups: breakdown.groups.map((g) => ({ ivaRate: g.ivaRate, afipId: g.afipId, baseCents: g.netCents, amountCents: g.ivaCents })),
      lines: lines.map((l) => ({ description: l.description, quantity: l.quantity, totalCents: l.grossCents, ivaRate: l.ivaRate })),
      idempotencyKey,
      createdBy: input.userId,
    })
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) {
      const winner = await FiscalDocument.findOne({ tenantId, idempotencyKey })
      if (winner) return winner
    }
    throw err
  }
  return doc
}

/**
 * Factura de una orden cobrada. Devuelve el documento (autorizado, rechazado,
 * en reintento o en revisión). Lanza FiscalIssueError si no corresponde.
 */
export async function issueInvoiceForOrder(input: {
  tenantId: string
  orderId: mongoose.Types.ObjectId | string
  receiver: ReceiverInput
  userId: string
  fetchImpl?: FetchLike
}): Promise<IFiscalDocument> {
  const doc = await prepareInvoiceForOrder(input)
  if (doc.status === 'authorized' || doc.status === 'rejected' || doc.status === 'needs_review') return doc
  const issued = await authorizeDocument(doc, { fetchImpl: input.fetchImpl })
  // Si ARCA respondió, se aprovecha para destrabar pendientes viejos del comercio.
  if (issued.status === 'authorized') {
    runAfterResponse('factura: reintentar pendientes', () =>
      retryPendingDocuments({ tenantId: input.tenantId, limit: 3, olderThanMs: 2 * 60_000 }).then(() => undefined)
    )
  }
  return issued
}

/**
 * Nota de crédito total de la factura de una orden (al anular la venta).
 * Si la orden no tiene factura autorizada, no hace nada (devuelve null).
 */
export async function issueCreditNoteForOrder(input: {
  tenantId: string
  orderId: mongoose.Types.ObjectId | string
  userId: string
  fetchImpl?: FetchLike
}): Promise<IFiscalDocument | null> {
  const tenantId = new mongoose.Types.ObjectId(input.tenantId)
  const invoice = await FiscalDocument.findOne({ tenantId, idempotencyKey: `invoice:${String(input.orderId)}` })
  if (!invoice || invoice.status !== 'authorized' || invoice.number === null) return null

  const idempotencyKey = `credit:${String(input.orderId)}`
  const existing = await FiscalDocument.findOne({ tenantId, idempotencyKey })
  if (existing) return existing.status === 'authorized' ? existing : authorizeDocument(existing, { fetchImpl: input.fetchImpl })

  let doc: IFiscalDocument
  try {
    doc = await FiscalDocument.create({
      tenantId,
      locationId: invoice.locationId,
      orderId: invoice.orderId,
      orderPosId: invoice.orderPosId,
      orderNumber: invoice.orderNumber,
      kind: 'credit_note',
      letter: invoice.letter,
      cbteTipo: cbteTipoFor(invoice.letter, 'credit_note'),
      pointOfSale: invoice.pointOfSale,
      environment: invoice.environment,
      // La NC es del mismo emisor y ambiente que su factura, siempre.
      issuerCuit: invoice.issuerCuit,
      status: 'pending',
      issuedAt: new Date(),
      receiver: invoice.receiver,
      amounts: invoice.amounts,
      ivaGroups: invoice.ivaGroups,
      lines: invoice.lines,
      associated: {
        documentId: invoice._id,
        cbteTipo: invoice.cbteTipo,
        pointOfSale: invoice.pointOfSale,
        number: invoice.number,
        issuedAt: invoice.issuedAt,
      },
      idempotencyKey,
      createdBy: input.userId,
    })
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) {
      const winner = await FiscalDocument.findOne({ tenantId, idempotencyKey })
      if (winner) return winner
    }
    throw err
  }
  return authorizeDocument(doc, { fetchImpl: input.fetchImpl })
}

/** Resumen para el POS y el ticket. */
export function documentSummary(doc: IFiscalDocument) {
  return {
    id: String(doc._id),
    kind: doc.kind,
    letter: doc.letter,
    status: doc.status,
    pointOfSale: doc.pointOfSale,
    number: doc.number,
    label:
      doc.number !== null
        ? `${doc.kind === 'invoice' ? 'Factura' : 'Nota de crédito'} ${doc.letter} ${String(doc.pointOfSale).padStart(5, '0')}-${String(doc.number).padStart(8, '0')}`
        : `${doc.kind === 'invoice' ? 'Factura' : 'Nota de crédito'} ${doc.letter}`,
    cae: doc.cae,
    caeExpiresAt: doc.caeExpiresAt,
    totalCents: doc.amounts.totalCents,
    message:
      doc.status === 'needs_review'
        ? doc.review?.message || doc.arca.lastError || 'Necesita revisión'
        : doc.status === 'authorized'
          ? doc.authMode === 'caea'
            ? 'Emitida en contingencia (CAEA)'
            : null
          : doc.arca.lastError || null,
    authMode: doc.authMode ?? 'cae',
    environment: doc.environment,
    /** Motivo estable de la revisión (para ofrecer la acción que corresponde). */
    reviewCode: doc.status === 'needs_review' ? doc.review?.code || null : null,
    /** Estado de la impresión: independiente del estado fiscal. */
    printStatus: doc.printing?.status ?? 'not_requested',
    caeaReportStatus: doc.caeaReportStatus ?? 'not_applicable',
  }
}

/**
 * Reintenta comprobantes que quedaron en `pending`/`retrying` (ARCA caída,
 * timeout). Lo usan: cada factura nueva (para su comercio), el botón del
 * panel y el cron diario. Nunca reintenta los rechazados (requieren revisar).
 */
export async function retryPendingDocuments(options: {
  tenantId?: string
  limit?: number
  olderThanMs?: number
  /** Ignora la espera progresiva (botón «Reintentar» de una persona). */
  ignoreBackoff?: boolean
  fetchImpl?: FetchLike
} = {}): Promise<{ tried: number; authorized: number }> {
  const now = new Date()
  // `needs_review` y `rejected` NUNCA se reintentan solos.
  const filter: Record<string, unknown> = {
    status: { $in: ['pending', 'retrying'] },
    updatedAt: { $lt: new Date(now.getTime() - (options.olderThanMs ?? 60_000)) },
  }
  if (!options.ignoreBackoff) {
    filter.$or = [{ 'arca.nextAttemptAt': null }, { 'arca.nextAttemptAt': { $exists: false } }, { 'arca.nextAttemptAt': { $lte: now } }]
  }
  if (options.tenantId) filter.tenantId = new mongoose.Types.ObjectId(options.tenantId)
  const docs = await FiscalDocument.find(filter).sort({ createdAt: 1 }).limit(options.limit ?? 20)
  let authorized = 0
  for (const doc of docs) {
    try {
      const result = await authorizeDocument(doc, { fetchImpl: options.fetchImpl })
      if (result.status === 'authorized') {
        authorized++
        // Emitido por la recuperación (el POS no estaba): sale el ticket
        // ORIGINAL, una sola vez (dedupeKey) y solo si nunca se pidió.
        if (result.printing?.status === 'not_requested') {
          await enqueueFiscalTicket(result).catch((e) => console.error('[fiscal/retry] ticket:', e instanceof Error ? e.message : e))
        }
      }
    } catch (err) {
      console.error(`[fiscal/retry] ${String(doc._id)}:`, err instanceof Error ? err.message : err)
    }
  }
  return { tried: docs.length, authorized }
}

const KICK_EVERY_MS = 2 * 60_000

/**
 * Disparador de la recuperación fiscal de UN comercio, a lo sumo cada 2 min.
 * Orden de ejecución 31/10 (P1.3): con Vercel Hobby el cron es diario; el POS
 * abierto y el agente de impresión (activos mientras el local opera) llaman a
 * esto en segundo plano. El candado vive en la base: varias instancias no
 * corren a la vez. Con Vercel Pro el cron `fiscal-retry` puede correr cada 5 minutos.
 */
export async function kickFiscalRecovery(tenantId: string, options: { fetchImpl?: FetchLike } = {}): Promise<boolean> {
  const tid = new mongoose.Types.ObjectId(tenantId)
  const now = new Date()
  const claimed = await FiscalProfile.updateOne(
    {
      tenantId: tid,
      enabled: true,
      $or: [{ 'recovery.lastRunAt': null }, { 'recovery.lastRunAt': { $exists: false } }, { 'recovery.lastRunAt': { $lt: new Date(now.getTime() - KICK_EVERY_MS) } }],
    },
    { $set: { 'recovery.lastRunAt': now } }
  )
  if (claimed.modifiedCount !== 1) return false
  await retryPendingDocuments({ tenantId, limit: 10, olderThanMs: 30_000, fetchImpl: options.fetchImpl })
  return true
}
