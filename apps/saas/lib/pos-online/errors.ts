import { NextResponse } from 'next/server'

// ============================================================================
// PosError — errores tipados de la superficie /api/[tenant]/pos/*
// ============================================================================
// El POS NO parsea mensajes humanos para decidir qué hacer: decide por
// `code` y por el status HTTP. Por eso cada fallo lleva un código estable.
//
// Uso:
//   throw PosError.notFound('Mesa no encontrada')
//   throw PosError.transition('free', 'closed', ['occupied', 'reserved'])
//
// En el route handler:
//   } catch (e) { return toPosErrorResponse(e) }
// ============================================================================

export type PosErrorCode =
  | 'validation'        // 400 — el body no cumple el contrato
  | 'unauthorized'      // 401 — sin token o token inválido
  | 'forbidden'         // 403 — rol/sede insuficiente
  | 'not_found'         // 404 — recurso inexistente para este tenant
  | 'transition_invalid'// 409 — salto de estado no permitido
  | 'conflict'          // 409 — regla de negocio violada (caja abierta, etc.)
  | 'idempotency_mismatch' // 409 — mismo posId con payload distinto
  | 'internal'          // 500 — error inesperado

function defaultStatusFor(code: PosErrorCode): number {
  switch (code) {
    case 'validation': return 400
    case 'unauthorized': return 401
    case 'forbidden': return 403
    case 'not_found': return 404
    case 'transition_invalid':
    case 'conflict':
    case 'idempotency_mismatch': return 409
    case 'internal': return 500
    default: return 500
  }
}

export class PosError extends Error {
  readonly code: PosErrorCode
  readonly status: number
  /** Detalle para el desarrollador; NUNCA se envía al cliente si es internal. */
  readonly detail?: string

  constructor(code: PosErrorCode, message: string, options?: { status?: number; detail?: string }) {
    super(message)
    this.name = 'PosError'
    this.code = code
    this.status = options?.status ?? defaultStatusFor(code)
    this.detail = options?.detail
  }

  static validation(message: string, detail?: string): PosError {
    return new PosError('validation', message, { detail })
  }

  static unauthorized(message = 'No autenticado'): PosError {
    return new PosError('unauthorized', message)
  }

  static forbidden(message = 'Sin permiso para esta operación'): PosError {
    return new PosError('forbidden', message)
  }

  static notFound(message = 'Recurso no encontrado'): PosError {
    return new PosError('not_found', message)
  }

  /**
   * Transición de estado no permitida.
   * `allowed` viaja en el payload para que el POS pueda mostrar el camino legal
   * sin reimplementar el grafo (que vive en @takeasygo/business/transitions).
   */
  static transition(from: string, to: string, allowed: readonly string[]): PosError {
    return new PosError(
      'transition_invalid',
      `Transición no permitida: ${from} → ${to}`,
      { detail: `Allowed: [${allowed.join(', ')}]` }
    )
  }

  static conflict(message: string, detail?: string): PosError {
    return new PosError('conflict', message, { detail })
  }

  static idempotencyMismatch(message: string, detail?: string): PosError {
    return new PosError('idempotency_mismatch', message, { detail })
  }

  static internal(message = 'Error interno', detail?: string): PosError {
    return new PosError('internal', message, { detail })
  }
}

export function isPosError(e: unknown): e is PosError {
  return e instanceof PosError
}

/**
 * Convierte cualquier throw en la respuesta JSON del contrato POS.
 *
 * - Los `PosError` respetan su status y code.
 * - Cualquier otro error queda como 500 y SU MENSAJE NO SE FILTRA: en un
 *   endpoint de dinero, un `err.message` de Mongoose puede verter esquema,
 *   rutas o datos. El detalle real solo va al log del server.
 */
export function toPosErrorResponse(error: unknown): NextResponse {
  if (isPosError(error)) {
    const errorBody: { code: PosErrorCode; message: string; detail?: string } = {
      code: error.code,
      message: error.message,
    }
    // `detail` es para el desarrollador. Nunca viaja en un 5xx: un detail
    // armado con contexto interno podría volcar esquema o rutas.
    if (error.detail && error.status < 500) errorBody.detail = error.detail
    return NextResponse.json({ error: errorBody }, { status: error.status })
  }

  console.error('[pos] unexpected error:', error)
  return NextResponse.json(
    { error: { code: 'internal', message: 'Error interno' } },
    { status: 500 }
  )
}
