// ── Money utilities ────────────────────────────────────────────────
// All monetary values in the codebase are stored as INTEGER CENTS.
// These helpers make the conversion explicit and avoid float drift.

/** Convert a peso amount (e.g. 19300) to cents (1930000). Uses Math.round to avoid float drift. */
export const toCents = (pesos: number): number => Math.round(pesos * 100)

/** Convert cents (e.g. 1930000) to pesos (19300). Used for display and MP unit_price. */
export const toPesos = (cents: number): number => cents / 100

/** Format cents as Argentine peso string: 1930000 → "$19.300,00" */
export const formatCents = (cents: number): string =>
  `$${(cents / 100).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
