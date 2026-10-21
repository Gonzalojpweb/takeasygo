import { createHmac, timingSafeEqual } from "node:crypto"

// ============================================================================
// PIN del POS — lookup determinístico + reglas de calidad (Node only)
// ============================================================================
// Por qué (Auditoría POS Online V1, hallazgo de la validación): el login por
// PIN del Sync hacía `User.findOne({ tenantId, isActive })` y comparaba el
// PIN SOLO contra el primer usuario que devolviera Mongo. Con más de un
// empleado, el resto no podía entrar. Y el SaaS no tenía forma de asignar
// PINs.
//
// Diseño:
//   · `pin`          — bcrypt (como hasta ahora): verificación final.
//   · `posPinLookup` — HMAC-SHA256(pepper, "<tenantId>:<pin>") en hex. Índice
//                      único PARCIAL por (tenantId, posPinLookup): el login
//                      encuentra al usuario en O(1) y dos empleados del mismo
//                      tenant no pueden compartir PIN.
//   · El pepper es un secreto de servidor: con la base filtrada y SIN el
//     pepper, el lookup no permite recorrer el espacio de PINs offline.
//
// Pepper: POS_PIN_PEPPER si está definido; si no, se DERIVA del secreto
// interno que ya comparten SaaS (Vercel) y Sync (EC2)
// (INTERNAL_API_SECRET / SYNC_LAYER_SECRET). Rotar ese secreto invalida los
// lookups existentes: los usuarios afectados entran por el camino legacy
// (bcrypt, que re-escribe el lookup) o con un PIN nuevo desde el SaaS.
// Importar SOLO desde código de servidor: '@takeasygo/business/pos-pin'.
// ============================================================================

const DERIVATION_LABEL = "takeasygo:pos-pin-lookup:v1"

export const POS_PIN_MIN_LENGTH = 4
export const POS_PIN_MAX_LENGTH = 8

/** Lee POS_PIN_PEPPER, INTERNAL_API_SECRET y SYNC_LAYER_SECRET (acepta process.env). */
type PepperEnv = Readonly<Record<string, string | undefined>>

/** Pepper efectivo, o null si el servidor no tiene ningún secreto (fail-closed). */
export function resolvePosPinPepper(env: PepperEnv): string | null {
  if (env.POS_PIN_PEPPER && env.POS_PIN_PEPPER.length >= 16) return env.POS_PIN_PEPPER
  const shared = env.INTERNAL_API_SECRET || env.SYNC_LAYER_SECRET
  if (!shared) return null
  return createHmac("sha256", shared).update(DERIVATION_LABEL).digest("hex")
}

/** Lookup determinístico del PIN dentro de un tenant. */
export function posPinLookup(pepper: string, tenantId: string, pin: string): string {
  return createHmac("sha256", pepper).update(`${tenantId}:${pin}`).digest("hex")
}

/** Comparación en tiempo constante de dos lookups hex. */
export function sameLookup(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex")
  const bb = Buffer.from(b, "hex")
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/**
 * Valida un PIN nuevo. Devuelve el motivo del rechazo o null si es válido.
 * Rechaza PINs triviales: todos iguales (1111) y secuencias (1234, 9876).
 */
export function validateNewPosPin(pin: unknown): string | null {
  if (typeof pin !== "string") return "El PIN debe ser texto"
  if (!/^\d+$/.test(pin)) return "El PIN solo puede tener números"
  if (pin.length < POS_PIN_MIN_LENGTH || pin.length > POS_PIN_MAX_LENGTH) {
    return `El PIN debe tener entre ${POS_PIN_MIN_LENGTH} y ${POS_PIN_MAX_LENGTH} dígitos`
  }
  if (/^(\d)\1+$/.test(pin)) return "El PIN no puede ser un mismo dígito repetido"
  const digits = pin.split("").map(Number)
  const steps = digits.slice(1).map((d, i) => d - digits[i])
  if (steps.every((s) => s === 1) || steps.every((s) => s === -1)) {
    return "El PIN no puede ser una secuencia (1234, 9876…)"
  }
  return null
}
