import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { resolvePosContext, type PosContext } from './tenantContext'
import { PosError, toPosErrorResponse } from './errors'

// ============================================================================
// posRoute — el wrapper de TODA la superficie /api/[tenant]/pos/*
// ============================================================================
// Encapsula el orden de operación y el contrato de errores en un solo lugar:
//
//   tenant → auth → sede → handler (body)     ← todo dentro de `try`
//                              └── cualquier throw → toPosErrorResponse()
//
// Así ninguna ruta de dinero puede "olvidarse" de un guard ni devolver un
// stack trace de Mongoose al cliente.
// ============================================================================

type RouteParams = Record<string, string>

export function posRoute<T extends RouteParams = RouteParams>(
  handler: (ctx: PosContext, params: T) => Promise<NextResponse>
) {
  return async (
    request: NextRequest,
    { params }: { params: Promise<T> }
  ): Promise<NextResponse> => {
    try {
      const resolved = await params
      const ctx = await resolvePosContext(request, resolved.tenant)
      return await handler(ctx, resolved)
    } catch (error) {
      return toPosErrorResponse(error)
    }
  }
}

const MAX_BODY_BYTES = 100 * 1024

/**
 * Lee y parsea el body DESPUÉS de que el contexto ya resolvió tenant/auth/sede.
 * Un JSON roto es un 400 tipado, no un 500.
 */
export async function readPosBody<T = Record<string, unknown>>(
  request: NextRequest
): Promise<T> {
  let raw: string
  try {
    raw = await request.text()
  } catch {
    throw PosError.validation('Body ilegible')
  }

  if (raw.length > MAX_BODY_BYTES) {
    throw PosError.validation('Body demasiado grande')
  }
  if (!raw.trim()) {
    throw PosError.validation('Body requerido')
  }

  try {
    return JSON.parse(raw) as T
  } catch {
    throw PosError.validation('Body JSON inválido')
  }
}

/** Valida los campos mínimos de un body parseado y devuelve los tipados. */
export function requireFields(
  body: unknown,
  fields: readonly string[],
  maxString = 500
): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw PosError.validation('Body debe ser un objeto')
  }
  const values = new Map(Object.entries(body as Record<string, unknown>))
  for (const field of fields) {
    const value = values.get(field)
    if (value === undefined || value === null || value === '') {
      throw PosError.validation(`Campo requerido: ${field}`)
    }
    if (typeof value === 'string' && value.length > maxString) {
      throw PosError.validation(`Campo demasiado largo: ${field}`)
    }
  }
  return body as Record<string, unknown>
}
