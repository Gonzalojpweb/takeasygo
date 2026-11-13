/**
 * lib/organizations/staff-counters.ts — contadores de actividad del personal
 * (F6) y señales para revisar. Puro (sin DB): lo usan staff-activity.ts y los
 * tests.
 */

/** Lo que hizo una persona en UNA sede. Montos en centavos. */
export interface StaffCounters {
  payments: { count: number; amount: number }
  voidsRequested: { count: number; amount: number }
  voidsApproved: number
  itemVoids: { count: number; amount: number; wasted: number }
  registersOpened: number
  registersClosed: number
  /** Suma de diferencias del arqueo (positivo = sobró, negativo = faltó). */
  cashDifference: number
  /** Cierres con diferencia distinta de cero. */
  closesWithDifference: number
  expenses: { count: number; amount: number }
  withdrawals: { count: number; amount: number }
  deposits: { count: number; amount: number }
}

export function emptyCounters(): StaffCounters {
  return {
    payments: { count: 0, amount: 0 },
    voidsRequested: { count: 0, amount: 0 },
    voidsApproved: 0,
    itemVoids: { count: 0, amount: 0, wasted: 0 },
    registersOpened: 0,
    registersClosed: 0,
    cashDifference: 0,
    closesWithDifference: 0,
    expenses: { count: 0, amount: 0 },
    withdrawals: { count: 0, amount: 0 },
    deposits: { count: 0, amount: 0 },
  }
}

export function addCounters(a: StaffCounters, b: StaffCounters): StaffCounters {
  return {
    payments: { count: a.payments.count + b.payments.count, amount: a.payments.amount + b.payments.amount },
    voidsRequested: { count: a.voidsRequested.count + b.voidsRequested.count, amount: a.voidsRequested.amount + b.voidsRequested.amount },
    voidsApproved: a.voidsApproved + b.voidsApproved,
    itemVoids: { count: a.itemVoids.count + b.itemVoids.count, amount: a.itemVoids.amount + b.itemVoids.amount, wasted: a.itemVoids.wasted + b.itemVoids.wasted },
    registersOpened: a.registersOpened + b.registersOpened,
    registersClosed: a.registersClosed + b.registersClosed,
    cashDifference: a.cashDifference + b.cashDifference,
    closesWithDifference: a.closesWithDifference + b.closesWithDifference,
    expenses: { count: a.expenses.count + b.expenses.count, amount: a.expenses.amount + b.expenses.amount },
    withdrawals: { count: a.withdrawals.count + b.withdrawals.count, amount: a.withdrawals.amount + b.withdrawals.amount },
    deposits: { count: a.deposits.count + b.deposits.count, amount: a.deposits.amount + b.deposits.amount },
  }
}

export function hasActivity(c: StaffCounters): boolean {
  return c.payments.count + c.voidsRequested.count + c.voidsApproved + c.itemVoids.count + c.registersOpened + c.registersClosed + c.expenses.count + c.withdrawals.count + c.deposits.count > 0
}

/**
 * Señales para revisar (no acusan: invitan a mirar). Puro.
 *  · anula mucho: ventas anuladas > 5% de lo que cobró (con al menos 2);
 *  · platos anulados > 5% de lo cobrado (con al menos 3);
 *  · cierres con diferencia de caja.
 * Que un encargado anule sin pedir aprobación (by = approvedBy) es lo normal,
 * así que no se marca.
 */
export type StaffFlag = 'many_voids' | 'many_item_voids' | 'cash_difference'
export function staffFlags(c: StaffCounters): StaffFlag[] {
  const out: StaffFlag[] = []
  const base = c.payments.amount
  if (c.voidsRequested.count >= 2 && (base === 0 || c.voidsRequested.amount > base * 0.05)) out.push('many_voids')
  if (c.itemVoids.count >= 3 && (base === 0 || c.itemVoids.amount > base * 0.05)) out.push('many_item_voids')
  if (c.closesWithDifference > 0) out.push('cash_difference')
  return out
}
