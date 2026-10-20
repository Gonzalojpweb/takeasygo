// ============================================================================
// printer-agent-auth.ts — Token del agente de impresión por sede (P-1)
// ============================================================================
// Cada sede puede tener un token propio para su agente de Windows. Se guarda
// solo el SHA-256 (`Location.printerAgent.secretHash`); el token en claro se
// muestra una única vez al generarlo y el agente lo manda en `X-Agent-Token`.
//
// Adopción gradual sin cortar la impresión:
//   - sede SIN token generado  → se acepta el poll (comportamiento legacy) y
//     queda registrado como `missing`.
//   - sede CON token generado  → token ausente o inválido = 401. Generar el
//     token es lo que "enciende" la exigencia para esa sede.
// ============================================================================

import crypto from 'node:crypto'
import { NextResponse } from 'next/server'

export type AgentTokenStatus = 'match' | 'invalid' | 'missing' | 'not_configured'

export function hashAgentToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

/** Token nuevo en claro (48 hex, prefijo legible para soporte). */
export function generateAgentToken(): string {
  return `tga_${crypto.randomBytes(24).toString('hex')}`
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

export function checkAgentToken(
  expectedHash: string | null | undefined,
  presented: string | null | undefined
): AgentTokenStatus {
  if (!expectedHash) return 'not_configured'
  if (!presented) return 'missing'
  return timingSafeEqualHex(hashAgentToken(presented), expectedHash) ? 'match' : 'invalid'
}

/** 401 si la sede exige token y el request no trae uno válido; null si pasa. */
export function agentTokenDenied(status: AgentTokenStatus): NextResponse | null {
  if (status === 'match' || status === 'not_configured') return null
  return NextResponse.json(
    { error: status === 'missing' ? 'Falta el token del agente' : 'Token del agente inválido' },
    { status: 401 }
  )
}
