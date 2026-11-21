// ============================================================================
// Pantallas: token, código de vinculación y hashes (21/11/2026)
// ============================================================================
// · Token propio de cada pantalla (`tgd_…`): se guarda solo el SHA-256 y se
//   entrega una única vez. Solo lee el contenido de su sede y manda latido y
//   estadísticas. Revocable desde el panel. Mismo patrón que el agente de
//   impresión (lib/printer-agent-auth.ts).
// · Código de 6 caracteres sin O/0/I/1 (32^6 ≈ 1.070 millones), hasheado con
//   pepper (DISPLAY_PAIRING_PEPPER). Vence a los 10 minutos.
// · IP: solo como clave de límite de pedidos, hasheada con el pepper. Nunca en
//   claro, ni en Mongo ni en Redis.
// ============================================================================

import crypto from 'node:crypto'
import type { NextRequest } from 'next/server'
import DisplayDevice, { type IDisplayDevice } from '@/models/DisplayDevice'

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 6
export const PAIRING_TTL_MS = 10 * 60 * 1000
export const MAX_NONCE_ATTEMPTS = 5

export class DisplayConfigError extends Error {}

export function pepper(): string {
  const p = process.env.DISPLAY_PAIRING_PEPPER
  if (p && p.trim().length >= 16) return p.trim()
  if (process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'production') {
    throw new DisplayConfigError('Falta DISPLAY_PAIRING_PEPPER')
  }
  return 'tgd-dev-pepper-solo-desarrollo'
}

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')

export function generateCode(rand: (n: number) => Buffer = crypto.randomBytes): string {
  const bytes = rand(CODE_LENGTH)
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  return out
}

/** Normaliza lo que tipea el comercio: mayúsculas, sin espacios ni guiones. */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const c = input.toUpperCase().replace(/[\s-]/g, '')
  if (c.length !== CODE_LENGTH) return null
  for (const ch of c) if (!CODE_ALPHABET.includes(ch)) return null
  return c
}

export const hashCode = (code: string) => sha256(`${pepper()}|code|${code}`)
export const hashNonce = (nonce: string) => sha256(`${pepper()}|nonce|${nonce}`)

export function generateDisplayToken(): string {
  return `tgd_${crypto.randomBytes(24).toString('hex')}`
}
export const hashDisplayToken = (raw: string) => sha256(raw)

/** Clave de límite de pedidos por IP, hasheada (la IP nunca se guarda). */
export function ipRateKey(request: NextRequest, scope: string): string {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
  return `display-${scope}:${sha256(`${pepper()}|ip|${ip}`).slice(0, 32)}`
}

/** Pantalla activa del token Bearer, o null. */
export async function deviceFromRequest(request: NextRequest): Promise<(IDisplayDevice & { _id: unknown }) | null> {
  const auth = request.headers.get('authorization') || ''
  const m = /^Bearer\s+(tgd_[a-f0-9]{48})$/.exec(auth.trim())
  if (!m) return null
  const device = await DisplayDevice.findOne({ tokenHash: hashDisplayToken(m[1]), status: 'active' })
    .lean<IDisplayDevice & { _id: unknown }>()
  return device ?? null
}
