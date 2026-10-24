import mongoose from 'mongoose'
import FiscalProfile, { type FiscalEnvironment } from '@/models/FiscalProfile'
import { decrypt, encrypt } from '@/lib/crypto'
import { ARCA_ENDPOINTS, ARCA_TIMEOUT_MS } from './endpoints'
import { signCms } from './crypto'
import { escapeXml, getText, unescapeXml } from './xml'
import { ArcaError, type FetchLike, type WsfeAuth } from './wsfe'

// ============================================================================
// WSAA — autenticación con ARCA (ticket de acceso, ~12 h)
// ============================================================================
// Fase 4 de caja (2026-10). Docs: ADMIN/FASE4_ARCA_FACTURA_ELECTRONICA.md.
//
// ARCA entrega UN ticket por CUIT y servicio, válido ~12 horas, y rechaza un
// pedido nuevo mientras haya uno vigente ("El CEE ya posee un TA válido").
// Por eso:
//   · el ticket se guarda (token/sign cifrados) en FiscalProfile.wsaa y se
//     reutiliza hasta 5 minutos antes de vencer;
//   · un candado en la base (`wsaa.lockedUntil`) evita que dos facturas en
//     paralelo pidan dos tickets: la segunda espera y usa el de la primera;
//   · el ticket se guarda ANTES de devolverlo (si se perdiera, no hay forma
//     de recuperarlo hasta que venza).
// ============================================================================

const WSAA_NS = 'http://wsaa.view.sua.dvadac.desein.afip.gov'
const SERVICE = 'wsfe'
const REUSE_MARGIN_MS = 5 * 60 * 1000
const LOCK_MS = 30_000
const WAIT_STEP_MS = 500
const WAIT_MAX_MS = 25_000

function isoWithOffset(date: Date): string {
  // ARCA acepta ISO 8601 con zona; se usa la de Argentina (-03:00).
  const ar = new Date(date.getTime() - 3 * 60 * 60 * 1000)
  return `${ar.toISOString().slice(0, 19)}-03:00`
}

/** Pedido de ticket de acceso (TRA) para `wsfe`. */
export function buildTra(now: Date = new Date()): string {
  const uniqueId = Math.floor(now.getTime() / 1000)
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<loginTicketRequest version="1.0"><header>` +
    `<uniqueId>${uniqueId}</uniqueId>` +
    `<generationTime>${isoWithOffset(new Date(now.getTime() - 10 * 60 * 1000))}</generationTime>` +
    `<expirationTime>${isoWithOffset(new Date(now.getTime() + 10 * 60 * 1000))}</expirationTime>` +
    `</header><service>${SERVICE}</service></loginTicketRequest>`
  )
}

export interface AccessTicket {
  token: string
  sign: string
  expiresAt: Date
}

/** LoginCms: cambia el CMS firmado por un ticket de acceso. */
export async function loginCms(env: FiscalEnvironment, cms: string, fetchImpl: FetchLike = fetch): Promise<AccessTicket> {
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="${WSAA_NS}">` +
    `<soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${escapeXml(cms)}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ARCA_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetchImpl(ARCA_ENDPOINTS[env].wsaa, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
      body,
      signal: controller.signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw new ArcaError('timeout', 'ARCA (autenticación) no respondió a tiempo')
    throw new ArcaError('network', 'No se pudo conectar con ARCA (autenticación)')
  } finally {
    clearTimeout(timer)
  }
  const text = await res.text()
  const fault = getText(text, 'faultstring')
  if (fault) {
    const already = /ya posee un TA/i.test(fault)
    throw new ArcaError(
      'auth',
      already
        ? 'ARCA ya entregó un acceso vigente que no quedó guardado. Esperá unos minutos y probá de nuevo.'
        : `ARCA rechazó la autenticación: ${fault}`,
      already ? 'alreadyAuthenticated' : getText(text, 'faultcode') ?? undefined
    )
  }
  const inner = getText(text, 'loginCmsReturn')
  if (!inner) throw new ArcaError('fault', 'Respuesta de autenticación inesperada')
  const ticketXml = unescapeXml(inner)
  const token = getText(ticketXml, 'token')
  const sign = getText(ticketXml, 'sign')
  const expiration = getText(ticketXml, 'expirationTime')
  if (!token || !sign || !expiration) throw new ArcaError('fault', 'El ticket de ARCA vino incompleto')
  return { token, sign, expiresAt: new Date(expiration) }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Descifrado estricto: un secreto que no descifra se trata como ausente. */
function tryDecrypt(value: string): string | null {
  try {
    return decrypt(value)
  } catch {
    return null
  }
}

interface StoredTicket {
  wsaa?: { environment?: string | null; token?: string; sign?: string; expiresAt?: Date | null; lockedUntil?: Date | null }
}

function usable(doc: StoredTicket | null, env: FiscalEnvironment, now = Date.now()): AccessTicket | null {
  const w = doc?.wsaa
  if (!w || w.environment !== env || !w.token || !w.sign || !w.expiresAt) return null
  if (new Date(w.expiresAt).getTime() - now < REUSE_MARGIN_MS) return null
  const token = tryDecrypt(w.token)
  const sign = tryDecrypt(w.sign)
  return token && sign ? { token, sign, expiresAt: new Date(w.expiresAt) } : null
}

async function readTicket(tenantId: mongoose.Types.ObjectId): Promise<StoredTicket | null> {
  return FiscalProfile.findOne({ tenantId }).select('+wsaa.token +wsaa.sign').lean<StoredTicket>()
}

export interface TicketInput {
  tenantId: mongoose.Types.ObjectId | string
  environment: FiscalEnvironment
  cuit: string
  certificatePem: string
  privateKeyPem: string
  fetchImpl?: FetchLike
  /** Forzar un ticket nuevo (p. ej. ARCA dijo que el guardado no sirve). */
  forceRefresh?: boolean
}

/** Ticket de acceso vigente (del cache o nuevo) listo para WSFEv1. */
export async function getWsfeAuth(input: TicketInput): Promise<WsfeAuth> {
  const tenantId = new mongoose.Types.ObjectId(String(input.tenantId))
  const started = Date.now()

  for (;;) {
    const stored = await readTicket(tenantId)
    const cached = input.forceRefresh ? null : usable(stored, input.environment)
    if (cached) return { token: cached.token, sign: cached.sign, cuit: input.cuit }

    // Candado: solo una instancia pide el ticket.
    const now = new Date()
    const lock = await FiscalProfile.updateOne(
      { tenantId, $or: [{ 'wsaa.lockedUntil': null }, { 'wsaa.lockedUntil': { $lt: now } }, { 'wsaa.lockedUntil': { $exists: false } }] },
      { $set: { 'wsaa.lockedUntil': new Date(now.getTime() + LOCK_MS) } }
    )
    if (lock.modifiedCount === 1) {
      try {
        const ticket = await loginCms(
          input.environment,
          signCms(buildTra(now), input.certificatePem, input.privateKeyPem),
          input.fetchImpl
        )
        await FiscalProfile.updateOne(
          { tenantId },
          {
            $set: {
              'wsaa.environment': input.environment,
              'wsaa.token': encrypt(ticket.token),
              'wsaa.sign': encrypt(ticket.sign),
              'wsaa.expiresAt': ticket.expiresAt,
              'wsaa.lockedUntil': null,
            },
          }
        )
        return { token: ticket.token, sign: ticket.sign, cuit: input.cuit }
      } catch (err) {
        await FiscalProfile.updateOne({ tenantId }, { $set: { 'wsaa.lockedUntil': null } })
        throw err
      }
    }

    if (Date.now() - started > WAIT_MAX_MS) {
      throw new ArcaError('timeout', 'Otra operación está pidiendo acceso a ARCA. Probá de nuevo en unos segundos.')
    }
    await sleep(WAIT_STEP_MS)
  }
}
