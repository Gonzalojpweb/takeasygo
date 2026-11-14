// ============================================================================
// Política de descuentos y ajustes del POS (14/11/2026)
// ============================================================================
// Fuente ÚNICA de las reglas de descuento: la usan el server (al aplicar un
// descuento y al reprocesar una operación hecha sin internet), el POS (para
// pedir el PIN correcto antes de mandar, también sin internet) y el panel
// admin (para validar lo que se guarda). Mismo módulo en los tres lados ⇒
// las reglas no pueden divergir.
//
// Modelo:
//   · Cada comercio define, por rol (cajero, encargado, admin):
//       - si puede iniciar descuentos;
//       - su AUTONOMÍA: hasta qué % de la cuenta y hasta qué monto descuenta
//         sin pedir PIN;
//       - su TOPE: el máximo que puede pedir aun con autorización.
//   · Lo que supera la autonomía necesita el PIN de alguien que lo pueda
//     hacer SOLO (encargado o admin cuya autonomía lo cubra). Un encargado
//     autoriza hasta donde él mismo podría descontar; más arriba, un admin.
//   · Se evalúa el descuento RESULTANTE de toda la cuenta (la orden, o todas
//     las rondas sin cobrar de la mesa). Partir un descuento grande en varios
//     chicos (por plato, por ronda) no esquiva el límite.
//   · Bajar o quitar un descuento nunca pide autorización (sube el importe).
//
// Por defecto la política reproduce la regla anterior (Fase D): el cajero
// siempre con PIN, encargado y admin directo, sin topes.
// ============================================================================

// ── Motivos ─────────────────────────────────────────────────────────────────

export const DISCOUNT_REASONS = {
  courtesy: "Cortesía de la casa",
  complaint: "Reclamo / demora",
  regular: "Cliente frecuente",
  staff: "Consumo del personal",
  promotion: "Promoción del local",
  agreement: "Acuerdo comercial",
  incident: "Incidencia operativa",
  other: "Otro",
} as const

export type DiscountReason = keyof typeof DISCOUNT_REASONS

export const DISCOUNT_REASON_IDS = Object.keys(DISCOUNT_REASONS) as DiscountReason[]

export function isDiscountReason(value: unknown): value is DiscountReason {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(DISCOUNT_REASONS, value)
}

/** «Otro» exige nota siempre, lo configure o no el comercio. */
export const ALWAYS_NOTE_REASONS: readonly DiscountReason[] = ["other"]

export const DISCOUNT_NOTE_MAX = 140

// ── Política ────────────────────────────────────────────────────────────────

export type DiscountActorRole = "cashier" | "manager" | "admin"

export const DISCOUNT_ACTOR_ROLES: readonly DiscountActorRole[] = ["cashier", "manager", "admin"]

export const DISCOUNT_ROLE_LABELS: Readonly<Record<DiscountActorRole, string>> = {
  cashier: "Cajero",
  manager: "Encargado",
  admin: "Administrador",
}

export interface DiscountRoleRule {
  /** Puede iniciar descuentos y ajustes. */
  enabled: boolean
  /** Hasta este % de la cuenta, sin PIN (0 = siempre con PIN). */
  autonomyPercent: number
  /** …y hasta este monto en centavos (null = sin tope por monto). */
  autonomyCents: number | null
  /** Máximo que puede pedir aun con autorización (100 = sin tope). */
  maxPercent: number
  /** Máximo en centavos aun con autorización (null = sin tope). */
  maxCents: number | null
}

export interface DiscountPolicy {
  roles: Record<DiscountActorRole, DiscountRoleRule>
  /** Motivos habilitados en el comercio. */
  allowedReasons: DiscountReason[]
  /** Motivos que exigen observación (además de «Otro»). */
  requireNoteFor: DiscountReason[]
}

export const DEFAULT_DISCOUNT_POLICY: DiscountPolicy = Object.freeze({
  roles: {
    cashier: { enabled: true, autonomyPercent: 0, autonomyCents: null, maxPercent: 100, maxCents: null },
    manager: { enabled: true, autonomyPercent: 100, autonomyCents: null, maxPercent: 100, maxCents: null },
    admin: { enabled: true, autonomyPercent: 100, autonomyCents: null, maxPercent: 100, maxCents: null },
  },
  allowedReasons: [...DISCOUNT_REASON_IDS],
  requireNoteFor: [...ALWAYS_NOTE_REASONS],
}) as DiscountPolicy

/** Tope de sanidad para montos (mil millones de pesos en centavos). */
const MAX_CENTS = 100_000_000_000

function clampPercent(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100 ? v : fallback
}

function clampCents(v: unknown, fallback: number | null): number | null {
  if (v === null) return null
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_CENTS ? v : fallback
}

function normalizeRule(raw: unknown, fallback: DiscountRoleRule): DiscountRoleRule {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof DiscountRoleRule, unknown>>
  const maxPercent = clampPercent(r.maxPercent, fallback.maxPercent)
  const maxCents = clampCents(r.maxCents, fallback.maxCents)
  // La autonomía nunca supera el tope: lo que se puede hacer solo, se puede pedir.
  const autonomyPercent = Math.min(clampPercent(r.autonomyPercent, fallback.autonomyPercent), maxPercent)
  const rawAutonomyCents = clampCents(r.autonomyCents, fallback.autonomyCents)
  const autonomyCents =
    maxCents === null ? rawAutonomyCents : rawAutonomyCents === null ? maxCents : Math.min(rawAutonomyCents, maxCents)
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : fallback.enabled,
    autonomyPercent,
    autonomyCents,
    maxPercent,
    maxCents,
  }
}

function reasonList(raw: unknown, fallback: DiscountReason[]): DiscountReason[] {
  if (!Array.isArray(raw)) return [...fallback]
  return DISCOUNT_REASON_IDS.filter((id) => raw.includes(id))
}

/**
 * Política completa y coherente a partir de lo guardado (o de nada). Lo que
 * falta o es inválido toma el valor por defecto. Nunca lanza: sirve para leer
 * la base y la copia guardada en el equipo.
 */
export function normalizeDiscountPolicy(raw: unknown): DiscountPolicy {
  const p = (raw && typeof raw === "object" ? raw : {}) as { roles?: Record<string, unknown>; allowedReasons?: unknown; requireNoteFor?: unknown }
  const roles = {} as Record<DiscountActorRole, DiscountRoleRule>
  for (const role of DISCOUNT_ACTOR_ROLES) roles[role] = normalizeRule(p.roles?.[role], DEFAULT_DISCOUNT_POLICY.roles[role])
  // El administrador nunca queda sin poder descontar: es quien configura.
  roles.admin.enabled = true
  let allowedReasons = reasonList(p.allowedReasons, DEFAULT_DISCOUNT_POLICY.allowedReasons)
  if (allowedReasons.length === 0) allowedReasons = [...DEFAULT_DISCOUNT_POLICY.allowedReasons]
  const requireNoteFor = Array.from(new Set([...ALWAYS_NOTE_REASONS, ...reasonList(p.requireNoteFor, DEFAULT_DISCOUNT_POLICY.requireNoteFor)]))
  return { roles, allowedReasons, requireNoteFor: DISCOUNT_REASON_IDS.filter((id) => requireNoteFor.includes(id)) }
}

/**
 * Validación ESTRICTA de lo que manda el panel admin (a diferencia de
 * normalize, que completa en silencio). Devuelve la política o el primer error.
 */
export function validateDiscountPolicyInput(raw: unknown): { ok: true; policy: DiscountPolicy } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Política inválida" }
  const p = raw as { roles?: unknown; allowedReasons?: unknown; requireNoteFor?: unknown }
  if (!p.roles || typeof p.roles !== "object") return { ok: false, error: "Faltan las reglas por rol" }
  const roles = p.roles as Record<string, unknown>
  for (const role of DISCOUNT_ACTOR_ROLES) {
    const label = DISCOUNT_ROLE_LABELS[role]
    const r = roles[role] as Record<string, unknown> | undefined
    if (!r || typeof r !== "object") return { ok: false, error: `Faltan las reglas del rol ${label}` }
    if (typeof r.enabled !== "boolean") return { ok: false, error: `${label}: «puede descontar» tiene que ser sí o no` }
    for (const k of ["autonomyPercent", "maxPercent"] as const) {
      if (typeof r[k] !== "number" || !Number.isInteger(r[k]) || (r[k] as number) < 0 || (r[k] as number) > 100) {
        return { ok: false, error: `${label}: los porcentajes van de 0 a 100, sin decimales` }
      }
    }
    for (const k of ["autonomyCents", "maxCents"] as const) {
      const v = r[k]
      if (v !== null && (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > MAX_CENTS)) {
        return { ok: false, error: `${label}: los montos tienen que ser positivos (o vacíos = sin tope)` }
      }
    }
    if ((r.autonomyPercent as number) > (r.maxPercent as number)) {
      return { ok: false, error: `${label}: el % sin autorización no puede superar el máximo` }
    }
    if (r.maxCents !== null && r.autonomyCents !== null && (r.autonomyCents as number) > (r.maxCents as number)) {
      return { ok: false, error: `${label}: el monto sin autorización no puede superar el máximo` }
    }
    if (r.maxCents !== null && r.autonomyCents === null) {
      return { ok: false, error: `${label}: con un monto máximo, el monto sin autorización también tiene que tener tope` }
    }
  }
  if ((roles.admin as { enabled?: boolean }).enabled !== true) {
    return { ok: false, error: "El administrador siempre puede descontar" }
  }
  if (!Array.isArray(p.allowedReasons) || p.allowedReasons.length === 0 || !p.allowedReasons.every(isDiscountReason)) {
    return { ok: false, error: "Elegí al menos un motivo válido" }
  }
  if (!Array.isArray(p.requireNoteFor) || !p.requireNoteFor.every(isDiscountReason)) {
    return { ok: false, error: "Motivos con observación obligatoria inválidos" }
  }
  return { ok: true, policy: normalizeDiscountPolicy(raw) }
}

// ── Evaluación ──────────────────────────────────────────────────────────────

/** Importes de la cuenta evaluada (orden o mesa), en centavos. */
export interface DiscountAmounts {
  /** Importe de la cuenta sin descuentos. */
  grossCents: number
  /** Descuento total de la cuenta DESPUÉS de la operación. */
  discountCents: number
  /** Descuento total de la cuenta ANTES de la operación. */
  previousDiscountCents: number
}

export type DiscountDecision =
  | { kind: "allow" }
  | { kind: "approval"; approverRoles: DiscountActorRole[]; message: string }
  | { kind: "deny"; message: string }

/** Rol del POS (o SaaS ya traducido) → rol de la política. Otro = sin descuentos. */
export function discountActorRole(posRole: string | null | undefined): DiscountActorRole | null {
  if (posRole === "superadmin") return "admin"
  return posRole === "cashier" || posRole === "manager" || posRole === "admin" ? posRole : null
}

/** discount ≤ percent% de gross, en enteros (sin redondeos de coma flotante). */
function withinPercent(discount: number, gross: number, percent: number): boolean {
  return discount * 100 <= gross * percent
}

function within(a: DiscountAmounts, percent: number, cents: number | null): boolean {
  return withinPercent(a.discountCents, a.grossCents, percent) && (cents === null || a.discountCents <= cents)
}

/** % efectivo (entero, redondeado hacia arriba: 10,2 % se muestra 11 %). */
export function effectivePercent(a: Pick<DiscountAmounts, "grossCents" | "discountCents">): number {
  if (a.grossCents <= 0) return a.discountCents > 0 ? 100 : 0
  return Math.ceil((a.discountCents * 100) / a.grossCents)
}

/** ¿Este rol puede hacer este descuento SOLO (sin PIN)? */
export function canDiscountAlone(policy: DiscountPolicy, role: string | null | undefined, a: DiscountAmounts): boolean {
  const actor = discountActorRole(role)
  if (!actor) return false
  const rule = policy.roles[actor]
  return rule.enabled && within(a, rule.autonomyPercent, rule.autonomyCents)
}

/**
 * ¿Este rol puede AUTORIZAR con su PIN el descuento de otro? Solo encargado
 * y admin, y solo hasta donde ellos mismos podrían descontar sin PIN.
 */
export function canApproveDiscount(policy: DiscountPolicy, approverRole: string | null | undefined, a: DiscountAmounts): boolean {
  const actor = discountActorRole(approverRole)
  if (actor !== "manager" && actor !== "admin") return false
  return canDiscountAlone(policy, actor, a)
}

function roleList(roles: DiscountActorRole[]): string {
  const names = roles.map((r) => (r === "admin" ? "un administrador" : "un encargado"))
  return names.join(" o ")
}

/**
 * Qué pasa con este descuento para este rol:
 *   · allow    → se aplica sin PIN.
 *   · approval → hace falta el PIN de alguien de `approverRoles`.
 *   · deny     → no se puede (rol sin permiso o supera su tope / el de todos).
 */
export function evaluateDiscount(policy: DiscountPolicy, role: string | null | undefined, a: DiscountAmounts): DiscountDecision {
  const actor = discountActorRole(role)
  if (!actor) return { kind: "deny", message: "Tu rol no puede aplicar descuentos" }
  const rule = policy.roles[actor]
  if (!rule.enabled) return { kind: "deny", message: "En este comercio tu rol no puede aplicar descuentos" }
  if (a.grossCents <= 0 || a.discountCents <= 0) return { kind: "allow" }
  // Bajar (o dejar igual) un descuento nunca pide autorización.
  if (a.discountCents <= a.previousDiscountCents) return { kind: "allow" }

  if (!within(a, rule.maxPercent, rule.maxCents)) {
    const cap = rule.maxCents !== null && a.discountCents > rule.maxCents ? "monto" : "porcentaje"
    return { kind: "deny", message: `Supera el máximo de descuento permitido para tu rol (${cap}). Pedile a un encargado que lo haga.` }
  }
  if (within(a, rule.autonomyPercent, rule.autonomyCents)) return { kind: "allow" }

  // El cajero lo pide a un encargado o admin; un encargado que supera su
  // autonomía, a un admin (no a otro encargado); un admin limitado, a otro admin.
  const candidates: DiscountActorRole[] = actor === "cashier" ? ["manager", "admin"] : ["admin"]
  const eligible = candidates.filter((r) => canApproveDiscount(policy, r, a))
  if (eligible.length === 0) {
    return { kind: "deny", message: "Este descuento supera lo que cualquier encargado o administrador puede autorizar en este comercio" }
  }
  const pct = effectivePercent(a)
  return {
    kind: "approval",
    approverRoles: eligible,
    message: `Descuento del ${pct} %: supera tu límite sin autorización. Necesita el PIN de ${roleList(eligible)}.`,
  }
}

/** Valida motivo y observación contra la política. null = está bien. */
export function checkDiscountReason(policy: DiscountPolicy, reason: string, note: string | null | undefined): string | null {
  if (!isDiscountReason(reason)) return "Motivo de descuento inválido"
  if (!policy.allowedReasons.includes(reason)) return `El motivo «${DISCOUNT_REASONS[reason]}» no está habilitado en este comercio`
  if ((policy.requireNoteFor.includes(reason) || ALWAYS_NOTE_REASONS.includes(reason)) && !(note ?? "").trim()) {
    return `Con el motivo «${DISCOUNT_REASONS[reason]}» la observación es obligatoria`
  }
  return null
}

export function reasonNeedsNote(policy: DiscountPolicy, reason: DiscountReason): boolean {
  return ALWAYS_NOTE_REASONS.includes(reason) || policy.requireNoteFor.includes(reason)
}

// ── Historial (cambios de política y operaciones sin internet) ──────────────

export interface DiscountPolicyVersion {
  version: number
  policy: DiscountPolicy
  /** Desde cuándo rige. */
  validFrom: Date | string
}

/**
 * Versión que regía en `at` (la última con validFrom ≤ at). Sirve para que
 * una operación hecha sin internet bajo la política de ESE momento no se
 * rechace porque después el admin la endureció.
 */
export function policyInForceAt(history: readonly DiscountPolicyVersion[], at: Date): DiscountPolicyVersion | null {
  let best: DiscountPolicyVersion | null = null
  for (const v of history) {
    const from = new Date(v.validFrom).getTime()
    if (from <= at.getTime() && (!best || from >= new Date(best.validFrom).getTime())) best = v
  }
  return best
}

// ── Modo «importe final» ────────────────────────────────────────────────────

/**
 * Del importe que se quiere cobrar al descuento en monto fijo. El importe
 * final tiene que ser ≥ 0 y menor que la base (si no, no hay descuento).
 */
export function discountForFinalAmount(baseCents: number, finalCents: number): number | null {
  if (!Number.isInteger(baseCents) || !Number.isInteger(finalCents)) return null
  if (finalCents < 0 || finalCents >= baseCents) return null
  return baseCents - finalCents
}

// ── Resumen por motivo (cierre Z) ───────────────────────────────────────────

export interface DiscountSummaryInput {
  /** Importe de la venta sin descuentos. */
  grossCents: number
  /** Descuento de cada línea con su motivo. */
  lines: { reason: string; cents: number }[]
}

export interface DiscountSummary {
  totalCents: number
  orderCount: number
  grossCents: number
  byReason: { reason: string; label: string; cents: number; count: number }[]
}

/**
 * Descuentos de un conjunto de ventas, por motivo. `count` = ventas con ese
 * motivo (una venta con dos platos «cortesía» cuenta una vez). Solo ventas
 * con descuento suman a `grossCents`. Orden: mayor importe primero.
 */
export function summarizeDiscountsByReason(orders: readonly DiscountSummaryInput[]): DiscountSummary | null {
  const byReason = new Map<string, { cents: number; orders: Set<number> }>()
  let totalCents = 0
  let orderCount = 0
  let grossCents = 0
  orders.forEach((order, idx) => {
    const lines = order.lines.filter((l) => Number.isInteger(l.cents) && l.cents > 0)
    if (lines.length === 0) return
    orderCount++
    grossCents += order.grossCents
    for (const l of lines) {
      totalCents += l.cents
      const cur = byReason.get(l.reason) ?? { cents: 0, orders: new Set<number>() }
      cur.cents += l.cents
      cur.orders.add(idx)
      byReason.set(l.reason, cur)
    }
  })
  if (orderCount === 0) return null
  return {
    totalCents,
    orderCount,
    grossCents,
    byReason: Array.from(byReason.entries())
      .map(([reason, v]) => ({
        reason,
        label: isDiscountReason(reason) ? DISCOUNT_REASONS[reason] : reason,
        cents: v.cents,
        count: v.orders.size,
      }))
      .sort((a, b) => b.cents - a.cents || a.label.localeCompare(b.label)),
  }
}
