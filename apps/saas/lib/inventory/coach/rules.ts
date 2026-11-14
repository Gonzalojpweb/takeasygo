// ============================================================================
// Guía en vivo del inventario — reglas (lógica pura, sin base de datos)
// ============================================================================
// Pedido del dueño (13/11/2026): «ningún dueño de resto tiene tiempo para
// leer la documentación». La guía mira los datos REALES de la sede y dice,
// en idioma de cocina:
//   · en qué etapa está (recorrido de 5 etapas) y qué le toca ahora,
//   · qué vio raro en sus datos, con los números («la receta pide 20 y tenés
//     12»), por qué importa y cómo se arregla, con un botón que lo resuelve,
//   · y lo que ya hizo bien (para que se note el avance).
// Nació del caso La Pescería: receta de 20 mejillones por plato, venta antes
// del primer conteo (stock en -20), la misma compra registrada dos veces y un
// conteo que no coincidía. Cada uno de esos tropiezos es una regla de acá.
//
// Todo es determinista y testeable: el cargador (load.ts) junta los datos y
// esta función decide. Nada de costos en pesos: solo «tiene o no precio».
// ============================================================================

export type CoachStatus = 'off' | 'preparing' | 'active'
export type CoachUnit = 'kg' | 'g' | 'l' | 'ml' | 'unit'

export interface CoachRecipeItem {
  skuId: string
  skuName: string
  /** Cantidad por porción, en `unit`. */
  quantity: number
  unit: CoachUnit
}

export interface CoachDish {
  menuItemId: string
  name: string
  soldLast30d: number
  coverage: 'controlled' | 'needs_counts' | 'variants_pending' | 'no_recipe'
  pendingVariants: string[]
  /** Receta base vigente (null = sin receta). */
  recipe: CoachRecipeItem[] | null
  isAvailable: boolean
  pausedReason: string | null
  stockPortions: number | null
}

export interface CoachSku {
  id: string
  name: string
  category: string
  /** Unidad con la que se lleva el stock. */
  unit: CoachUnit
  hasCost: boolean
  isActive: boolean
  usedInRecipes: boolean
  /** Stock en el depósito de consumo de la sede (null = nunca se movió). */
  stock: { qty: number; counted: boolean } | null
}

export interface CoachReceipt {
  skuId: string
  /** En la unidad del insumo. */
  quantity: number
  at: string
}

export interface CoachCount {
  skuId: string
  observed: number
  /** Lo que el sistema esperaba al momento de contar (null = primer conteo sin datos). */
  expected: number | null
  at: string
}

export interface CoachInput {
  locationName: string
  status: CoachStatus
  dishes: CoachDish[]
  skus: CoachSku[]
  /** Recepciones de los últimos 14 días, más nuevas primero. */
  receipts: CoachReceipt[]
  /** Conteos de los últimos 14 días, más nuevos primero. */
  counts: CoachCount[]
  /** Porciones vendidas en 7 días que no descontaron (plato sin receta / variante sin confirmar). */
  unmappedPortions: number
  /** Movimientos totales de la sede (para saber si ya «arrancó»). */
  totals: { receipts: number; counts: number; wastes: number }
  can: { recipes: boolean; capture: boolean; manage: boolean }
}

// ── Salida ───────────────────────────────────────────────────────────────────

export type StageId = 'prepare' | 'recipes' | 'count' | 'activate' | 'daily'
export type StageState = 'done' | 'current' | 'todo'

export interface CoachStage {
  id: StageId
  state: StageState
  /** Avance de la etapa, 0–100. */
  pct: number
  /** Línea con los números reales («3 de 5 platos estrella con receta»). */
  progressLabel: string
}

export type CoachAction =
  | { type: 'recipe'; menuItemId: string; variantName: string | null }
  | { type: 'count'; skuId: string }
  | { type: 'receive'; skuId: string | null }
  | { type: 'sku'; skuId: string }
  | { type: 'view'; view: 'recetas' | 'productos' | 'actividad' | 'ahora' }
  | { type: 'setup' }
  | { type: 'help'; topic: string }

export type FindingLevel = 'stop' | 'warn' | 'tip' | 'win'

export interface CoachFinding {
  /** Estable por problema: sirve para «ya lo vi». */
  id: string
  /** Cambia si cambian los números: un «ya lo vi» viejo no oculta un problema nuevo. */
  fingerprint: string
  level: FindingLevel
  /** Ícono sugerido (nombre de lucide). */
  icon: 'pause' | 'scale' | 'minus' | 'copy' | 'clipboard' | 'tag' | 'chef' | 'trophy' | 'alert' | 'receipt'
  title: string
  /** Qué pasó, con los números. */
  what: string
  /** Por qué importa (consecuencia en la cocina o en la caja). */
  why: string
  /** Cómo se arregla, paso a paso. */
  fix: string[]
  actions: Array<{ label: string; action: CoachAction }>
}

export interface CoachResult {
  stages: CoachStage[]
  current: StageId
  /** Avance general, 0–100. */
  pct: number
  next: { title: string; detail: string; action: CoachAction | null; actionLabel: string | null }
  findings: CoachFinding[]
  /** Platos estrella: los que más se venden (los primeros que conviene cargar). */
  starDishes: Array<{ menuItemId: string; name: string; soldLast30d: number; hasRecipe: boolean }>
  counts: { stop: number; warn: number; tip: number; win: number }
}

// ── Utilidades ───────────────────────────────────────────────────────────────

const UNIT_LABEL: Record<CoachUnit, [string, string]> = {
  kg: ['kg', 'kg'],
  g: ['g', 'g'],
  l: ['litro', 'litros'],
  ml: ['ml', 'ml'],
  unit: ['unidad', 'unidades'],
}

export function qtyText(q: number, unit: CoachUnit): string {
  const n = Math.round(q * 1000) / 1000
  const label = UNIT_LABEL[unit][Math.abs(n) === 1 ? 0 : 1]
  return `${n.toLocaleString('es-AR', { maximumFractionDigits: 3 })} ${label}`
}

const FACTOR: Record<CoachUnit, { dim: 'mass' | 'volume' | 'count'; toBase: number }> = {
  kg: { dim: 'mass', toBase: 1000 },
  g: { dim: 'mass', toBase: 1 },
  l: { dim: 'volume', toBase: 1000 },
  ml: { dim: 'volume', toBase: 1 },
  unit: { dim: 'count', toBase: 1 },
}

/** Convierte entre unidades de la misma familia (null si no se puede). */
export function convert(q: number, from: CoachUnit, to: CoachUnit): number | null {
  if (from === to) return q
  if (FACTOR[from].dim !== FACTOR[to].dim) return null
  return (q * FACTOR[from].toBase) / FACTOR[to].toBase
}

/** Platos enteros que alcanzan con el stock (null = no se sabe). */
export function portionsFor(recipe: CoachRecipeItem[], skus: Map<string, CoachSku>): { portions: number | null; limiting: { item: CoachRecipeItem; sku: CoachSku; perPortion: number } | null } {
  let min = Infinity
  let limiting: { item: CoachRecipeItem; sku: CoachSku; perPortion: number } | null = null
  for (const item of recipe) {
    const sku = skus.get(item.skuId)
    if (!sku || !sku.isActive || item.quantity <= 0) continue
    if (!sku.stock || !sku.stock.counted) return { portions: null, limiting: null }
    const perPortion = convert(item.quantity, item.unit, sku.unit)
    if (perPortion === null || perPortion <= 0) continue
    const p = Math.floor(Math.max(0, sku.stock.qty) / perPortion + 1e-9)
    if (p < min) {
      min = p
      limiting = { item, sku, perPortion }
    }
  }
  return Number.isFinite(min) ? { portions: min, limiting } : { portions: null, limiting: null }
}

/**
 * ¿La cantidad por porción parece un error de tipeo o de unidad?
 * Umbrales pensados para una porción de restaurante, no para una olla.
 */
export function suspiciousPortion(item: Pick<CoachRecipeItem, 'quantity' | 'unit'>): null | { kind: 'too_many_units' | 'too_heavy' | 'too_much_liquid' | 'too_light'; text: string } {
  const { quantity: q, unit } = item
  if (unit === 'unit' && q >= 12) return { kind: 'too_many_units', text: `${qtyText(q, 'unit')} por plato es mucho para una porción.` }
  const grams = convert(q, unit, 'g')
  if (grams !== null && grams > 800) return { kind: 'too_heavy', text: `${qtyText(q, unit)} por plato es casi un kilo o más para una sola porción.` }
  if (grams !== null && grams > 0 && grams < 1) return { kind: 'too_light', text: `${qtyText(q, unit)} por plato es menos de un gramo: ¿quisiste poner gramos y quedó en kilos?` }
  const ml = convert(q, unit, 'ml')
  if (ml !== null && ml > 1000) return { kind: 'too_much_liquid', text: `${qtyText(q, unit)} por plato es más de un litro para una sola porción.` }
  return null
}

const STAR_DISHES = 5
const DUPLICATE_WINDOW_MS = 15 * 60_000
const COUNT_GAP_RATIO = 0.3

// ── Motor ────────────────────────────────────────────────────────────────────

export function buildCoach(input: CoachInput): CoachResult {
  const skuMap = new Map(input.skus.map((s) => [s.id, s]))
  const findings: CoachFinding[] = []
  const push = (f: CoachFinding) => {
    if (!findings.some((x) => x.id === f.id)) findings.push(f)
  }

  // Platos estrella: los más vendidos; si nada se vendió todavía, los primeros de la carta.
  const sorted = [...input.dishes].sort((a, b) => b.soldLast30d - a.soldLast30d)
  const stars = sorted.slice(0, Math.min(STAR_DISHES, sorted.length))
  const starsWithRecipe = stars.filter((d) => d.recipe).length
  const withRecipe = input.dishes.filter((d) => d.recipe)
  const recipeSkuIds = new Set(withRecipe.flatMap((d) => d.recipe!.map((i) => i.skuId)))
  const recipeSkus = [...recipeSkuIds].map((id) => skuMap.get(id)).filter((s): s is CoachSku => Boolean(s && s.isActive))
  const uncounted = recipeSkus.filter((s) => !s.stock?.counted)

  // ── 1. Receta que pide más de lo que hay → el plato se pausa ──────────────
  for (const d of withRecipe) {
    const { portions, limiting } = portionsFor(d.recipe!, skuMap)
    const paused = !d.isAvailable && d.pausedReason === 'stock'
    if (portions === null || !limiting) continue
    if (portions >= 1 && !paused) continue
    const odd = suspiciousPortion(limiting.item)
    const have = Math.max(0, limiting.sku.stock!.qty)
    push({
      id: `short:${d.menuItemId}`,
      fingerprint: `${limiting.sku.id}:${limiting.perPortion}:${have}`,
      level: input.status === 'active' ? 'stop' : 'warn',
      icon: 'pause',
      title: `${d.name} aparece «Sin inventario»`,
      what: `La receta pide ${qtyText(limiting.item.quantity, limiting.item.unit)} de ${limiting.sku.name} por plato y en la cocina hay ${qtyText(have, limiting.sku.unit)}. No alcanza para un plato entero, así que el sistema lo pausó para que no se venda algo que no podés servir.`,
      why: input.status === 'active'
        ? 'Mientras siga así, el plato no se puede pedir en la carta, el POS ni el delivery.'
        : 'Cuando actives el inventario, este plato va a salir pausado desde el primer momento.',
      fix: [
        odd
          ? `Revisá la receta: ${odd.text} Una receta es lo que lleva UN plato, no la preparación entera.`
          : `Si ${qtyText(limiting.item.quantity, limiting.item.unit)} es lo que lleva un plato, la receta está bien: falta mercadería.`,
        `Si llegó ${limiting.sku.name} y no lo registraste, cargalo en «Registrar mercadería»: el plato vuelve solo a la carta.`,
        'Si en la cocina hay más de lo que dice el sistema, contalo de nuevo: el conteo manda.',
      ],
      actions: [
        ...(input.can.recipes ? [{ label: 'Revisar la receta', action: { type: 'recipe', menuItemId: d.menuItemId, variantName: null } as CoachAction }] : []),
        ...(input.can.capture ? [{ label: 'Registrar mercadería', action: { type: 'receive', skuId: limiting.sku.id } as CoachAction }] : []),
        ...(input.can.capture ? [{ label: `Contar ${limiting.sku.name}`, action: { type: 'count', skuId: limiting.sku.id } as CoachAction }] : []),
      ],
    })
  }

  // ── 1b. Pausado «por stock» pero ya sin receta (no debería pasar) ─────────
  for (const d of input.dishes) {
    if (d.recipe || d.isAvailable || d.pausedReason !== 'stock') continue
    push({
      id: `orphan-pause:${d.menuItemId}`,
      fingerprint: d.menuItemId,
      level: 'stop',
      icon: 'pause',
      title: `${d.name} quedó pausado sin receta`,
      what: 'El inventario lo pausó por falta de stock, pero el plato ya no tiene receta: nada lo va a reanudar solo.',
      why: 'Los clientes no lo pueden pedir aunque lo tengas.',
      fix: ['Volvé a cargarle la receta (se recalcula al guardar), o reanudalo a mano desde el menú.'],
      actions: input.can.recipes ? [{ label: 'Cargar receta', action: { type: 'recipe', menuItemId: d.menuItemId, variantName: null } }] : [],
    })
  }

  // ── 2. Cantidades por porción que parecen error ───────────────────────────
  for (const d of withRecipe) {
    for (const item of d.recipe!) {
      const odd = suspiciousPortion(item)
      if (!odd || findings.some((f) => f.id === `short:${d.menuItemId}`)) continue
      push({
        id: `odd:${d.menuItemId}:${item.skuId}`,
        fingerprint: `${item.quantity}${item.unit}`,
        level: 'warn',
        icon: 'scale',
        title: `¿${qtyText(item.quantity, item.unit)} de ${item.skuName} en un ${d.name}?`,
        what: odd.text,
        why: 'Con cada venta se descuenta esa cantidad. Si es un error, el stock va a bajar de golpe y el plato se va a pausar antes de tiempo.',
        fix: [
          'La receta es UNA porción, tal como sale al salón.',
          'Si preparás en tanda (una olla de salsa, una bandeja de rebozados), dividí lo que usás por la cantidad de platos que salen.',
          'Fijate la unidad: 200 g no es lo mismo que 200 kg.',
        ],
        actions: input.can.recipes ? [{ label: 'Revisar la receta', action: { type: 'recipe', menuItemId: d.menuItemId, variantName: null } }] : [],
      })
    }
  }

  // ── 3. Stock negativo: se vendió antes de cargar lo que había ─────────────
  for (const s of input.skus) {
    if (!s.isActive || !s.stock || s.stock.qty >= 0) continue
    push({
      id: `neg:${s.id}`,
      fingerprint: String(Math.round(s.stock.qty * 1000)),
      level: 'stop',
      icon: 'minus',
      title: `${s.name} está en negativo (${qtyText(s.stock.qty, s.unit)})`,
      what: s.stock.counted
        ? `Se vendió más ${s.name} del que el sistema tenía anotado.`
        : `Hubo ventas que descontaron ${s.name} antes de contarlo o de registrar la compra. El sistema descuenta igual, por eso quedó por debajo de cero.`,
      why: 'Con un número negativo no podés saber cuánto te queda ni cuándo reponer.',
      fix: [
        `Contá ${s.name} hoy: el conteo reemplaza el número y desde ahí el sistema sigue bien.`,
        'Para que no vuelva a pasar: registrá cada compra el día que llega, y contá antes de activar.',
      ],
      actions: input.can.capture ? [{ label: `Contar ${s.name}`, action: { type: 'count', skuId: s.id } }] : [],
    })
  }

  // ── 4. Inventario activo con insumos que nunca se contaron ────────────────
  if (input.status === 'active' && uncounted.length > 0) {
    const names = uncounted.slice(0, 3).map((s) => s.name).join(', ')
    push({
      id: 'active-uncounted',
      fingerprint: uncounted.map((s) => s.id).sort().join(','),
      level: 'warn',
      icon: 'clipboard',
      title: `${uncounted.length === 1 ? 'Un insumo' : `${uncounted.length} insumos`} de tus recetas nunca se ${uncounted.length === 1 ? 'contó' : 'contaron'}`,
      what: `${names}${uncounted.length > 3 ? ' y otros' : ''}: las ventas los descuentan, pero el sistema no sabe con cuánto arrancaste.`,
      why: 'Sin un primer conteo, el stock arranca de cero y enseguida queda en negativo. Tampoco te puede avisar cuándo se termina.',
      fix: ['Contá cada uno una sola vez. Lleva unos minutos, y después el sistema los sigue solo con cada venta y compra.'],
      actions: input.can.capture ? uncounted.slice(0, 2).map((s) => ({ label: `Contar ${s.name}`, action: { type: 'count', skuId: s.id } as CoachAction })) : [],
    })
  }

  // ── 5. Misma compra registrada dos veces ──────────────────────────────────
  for (let i = 0; i < input.receipts.length; i++) {
    const a = input.receipts[i]
    const b = input.receipts.slice(i + 1).find((r) => r.skuId === a.skuId && Math.abs(r.quantity - a.quantity) < 1e-9 && Math.abs(Date.parse(a.at) - Date.parse(r.at)) <= DUPLICATE_WINDOW_MS)
    if (!b) continue
    const sku = skuMap.get(a.skuId)
    if (!sku) continue
    const minutes = Math.max(1, Math.round(Math.abs(Date.parse(a.at) - Date.parse(b.at)) / 60_000))
    push({
      id: `dup:${a.skuId}:${b.at}`,
      fingerprint: `${a.at}`,
      level: 'warn',
      icon: 'copy',
      title: `¿Registraste dos veces la misma compra de ${sku.name}?`,
      what: `Hay dos recepciones iguales de ${qtyText(a.quantity, sku.unit)} con ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'} de diferencia.`,
      why: 'Si fue una sola entrega, el sistema cree que tenés el doble.',
      fix: [
        'Si de verdad llegaron dos entregas, está todo bien: marcá «Ya lo vi».',
        `Si fue una sola, contá ${sku.name}: el conteo corrige el stock al número real.`,
        'Tip: después de guardar, esperá el cartel verde «Registrado» antes de volver a tocar el botón.',
      ],
      actions: input.can.capture ? [{ label: `Contar ${sku.name}`, action: { type: 'count', skuId: sku.id } }, { label: 'Ver actividad', action: { type: 'view', view: 'actividad' } }] : [],
    })
  }

  // ── 6. Conteo que no coincide con lo esperado ─────────────────────────────
  for (const c of input.counts) {
    if (c.expected === null || c.expected <= 0) continue
    const diff = c.observed - c.expected
    if (Math.abs(diff) / c.expected < COUNT_GAP_RATIO) continue
    const sku = skuMap.get(c.skuId)
    if (!sku) continue
    const hadDuplicate = findings.some((f) => f.id.startsWith(`dup:${c.skuId}:`))
    push({
      id: `gap:${c.skuId}:${c.at}`,
      fingerprint: c.at,
      level: 'tip',
      icon: 'receipt',
      title: `Contaste ${qtyText(c.observed, sku.unit)} de ${sku.name} y el sistema esperaba ${qtyText(c.expected, sku.unit)}`,
      what: diff < 0
        ? `Faltaban ${qtyText(-diff, sku.unit)}. Ya quedó corregido con tu conteo: el número que manda es el que contaste.`
        : `Sobraban ${qtyText(diff, sku.unit)}. Ya quedó corregido con tu conteo.`,
      why: 'Una diferencia grande casi siempre tiene una causa que se repite. Encontrarla evita que vuelva a pasar.',
      fix: diff < 0
        ? [
            ...(hadDuplicate ? ['Lo más probable: la compra quedó registrada dos veces (ver el aviso de arriba).'] : []),
            '¿Hubo merma (se venció, se cayó, se usó para el personal) y no se anotó? Anotala en «Merma».',
            '¿La receta lleva menos de lo que se usa de verdad? Pesá una porción real y ajustala.',
          ]
        : ['¿Llegó mercadería que no se registró? Cargala la próxima vez en «Registrar mercadería».', '¿La receta pide más de lo que se sirve? Pesá una porción real y ajustala.'],
      actions: input.can.capture ? [{ label: 'Ver actividad', action: { type: 'view', view: 'actividad' } }] : [],
    })
  }

  // ── 7. Insumos de recetas sin precio ──────────────────────────────────────
  const noCost = recipeSkus.filter((s) => !s.hasCost)
  if (noCost.length > 0 && input.status !== 'off') {
    push({
      id: 'no-cost',
      fingerprint: noCost.map((s) => s.id).sort().join(','),
      level: 'tip',
      icon: 'tag',
      title: `${noCost.length === 1 ? `${noCost[0].name} no tiene` : `${noCost.length} insumos no tienen`} precio de compra`,
      what: 'Sin el precio no podemos calcular cuánto te cuesta cada plato ni cuánto ganás.',
      why: 'El costo por plato (food cost) es lo que te dice si un plato te deja plata o te la come.',
      fix: ['La forma más fácil: cuando registres la próxima compra, cargá el total de la factura. El precio se calcula solo.'],
      actions: input.can.capture ? [{ label: 'Registrar una compra', action: { type: 'receive', skuId: noCost[0].id } }] : [],
    })
  }

  // ── 8. Ventas que no descuentan ───────────────────────────────────────────
  if (input.status === 'active' && input.unmappedPortions > 0) {
    push({
      id: 'unmapped',
      fingerprint: String(input.unmappedPortions),
      level: 'tip',
      icon: 'chef',
      title: `Esta semana salieron ${input.unmappedPortions} ${input.unmappedPortions === 1 ? 'porción' : 'porciones'} sin descontar`,
      what: 'Son platos (o variantes, como el tamaño) que todavía no tienen receta. Se venden normal, pero no bajan el stock.',
      why: 'Lo que usan esos platos no se descuenta, así que el stock que ves es más alto que el real.',
      fix: ['Andá a Recetas: arriba están ordenados por lo que más se vende. Con los 5 primeros ya cubrís la mayoría.'],
      actions: input.can.recipes ? [{ label: 'Ir a Recetas', action: { type: 'view', view: 'recetas' } }] : [],
    })
  }

  // ── 9. Lo que ya está bien (para que se note el avance) ───────────────────
  const controlled = input.dishes.filter((d) => d.coverage === 'controlled').length
  if (controlled > 0 && !findings.some((f) => f.level === 'stop')) {
    push({
      id: 'win-controlled',
      fingerprint: String(controlled),
      level: 'win',
      icon: 'trophy',
      title: `${controlled === 1 ? 'Un plato ya está' : `${controlled} platos ya están`} bajo control`,
      what: input.status === 'active'
        ? 'Tienen receta y sus insumos están contados: cada venta descuenta sola.'
        : 'Tienen receta y sus insumos están contados: van a descontar solos apenas actives.',
      why: 'Así sabés cuánto te queda sin ir a la cámara a mirar.',
      fix: [],
      actions: [],
    })
  }

  // ── Etapas ────────────────────────────────────────────────────────────────
  const starTarget = stars.length
  const recipesPct = starTarget === 0 ? 0 : Math.round((starsWithRecipe / starTarget) * 100)
  const recipesDone = withRecipe.length > 0 && (starsWithRecipe >= Math.min(3, starTarget) || recipesPct >= 60)
  const countedRecipeSkus = recipeSkus.length - uncounted.length
  const countPct = recipeSkus.length === 0 ? 0 : Math.round((countedRecipeSkus / recipeSkus.length) * 100)
  const countDone = recipeSkus.length > 0 && uncounted.length === 0
  const dailyChecks = [input.totals.receipts > 0, input.totals.counts > 1, input.totals.wastes > 0]
  const dailyPct = Math.round((dailyChecks.filter(Boolean).length / dailyChecks.length) * 100)

  const raw: Array<{ id: StageId; done: boolean; pct: number; label: string }> = [
    { id: 'prepare', done: input.status !== 'off', pct: input.status !== 'off' ? 100 : 0, label: input.status !== 'off' ? 'Cocina preparada' : 'Falta empezar' },
    {
      id: 'recipes',
      done: recipesDone || input.status === 'active',
      pct: recipesDone ? 100 : recipesPct,
      label: starTarget === 0 ? 'Tu carta todavía no tiene platos' : `${starsWithRecipe} de ${starTarget} platos estrella con receta · ${withRecipe.length} en total`,
    },
    {
      id: 'count',
      done: countDone,
      pct: countPct,
      label: recipeSkus.length === 0 ? 'Primero cargá una receta' : `${countedRecipeSkus} de ${recipeSkus.length} insumos contados`,
    },
    { id: 'activate', done: input.status === 'active', pct: input.status === 'active' ? 100 : 0, label: input.status === 'active' ? 'Las ventas descuentan solas' : 'Todavía no descuenta' },
    {
      id: 'daily',
      done: input.status === 'active' && dailyChecks.every(Boolean),
      pct: input.status === 'active' ? dailyPct : 0,
      label: `Compras ${dailyChecks[0] ? '✓' : '·'}  Conteos ${dailyChecks[1] ? '✓' : '·'}  Mermas ${dailyChecks[2] ? '✓' : '·'}`,
    },
  ]
  // La etapa actual es la primera sin terminar (el conteo puede quedar pendiente tras activar).
  const currentIdx = Math.max(0, raw.findIndex((s) => !s.done))
  const allDone = raw.every((s) => s.done)
  const stages: CoachStage[] = raw.map((s, i) => ({
    id: s.id,
    state: s.done ? 'done' : !allDone && i === currentIdx ? 'current' : 'todo',
    pct: s.pct,
    progressLabel: s.label,
  }))
  const current = allDone ? 'daily' : raw[currentIdx].id
  const pct = Math.round(raw.reduce((sum, s) => sum + (s.done ? 100 : s.pct), 0) / raw.length)

  // ── Próximo paso concreto ─────────────────────────────────────────────────
  const firstStop = findings.find((f) => f.level === 'stop')
  let next: CoachResult['next']
  if (firstStop) {
    next = { title: 'Primero, resolvé esto', detail: firstStop.title, action: firstStop.actions[0]?.action ?? null, actionLabel: firstStop.actions[0]?.label ?? null }
  } else if (current === 'prepare') {
    next = {
      title: 'Prepará la cocina',
      detail: 'Es un clic. Mientras esté «en preparación», las ventas no descuentan nada: podés probar tranquilo.',
      action: input.can.manage ? { type: 'setup' } : null,
      actionLabel: input.can.manage ? 'Empezar la preparación' : null,
    }
  } else if (current === 'recipes') {
    const target = stars.find((d) => !d.recipe)
    next = target
      ? {
          title: `Cargá la receta de ${target.name}`,
          detail: target.soldLast30d > 0 ? `Es de lo que más vendés: ${target.soldLast30d} en los últimos 30 días.` : 'Empezá por los platos que más salen.',
          action: input.can.recipes ? { type: 'recipe', menuItemId: target.menuItemId, variantName: null } : null,
          actionLabel: input.can.recipes ? 'Cargar receta' : null,
        }
      : { title: 'Cargá las recetas de tus platos', detail: 'Empezá por los que más salen.', action: { type: 'view', view: 'recetas' }, actionLabel: 'Ir a Recetas' }
  } else if (current === 'count') {
    const s = uncounted[0]
    next = s
      ? {
          title: `Contá ${s.name}`,
          detail: `Faltan ${uncounted.length} ${uncounted.length === 1 ? 'insumo' : 'insumos'} por contar. Contá lo que hay hoy en la cocina y la cámara.`,
          action: input.can.capture ? { type: 'count', skuId: s.id } : null,
          actionLabel: input.can.capture ? 'Contar ahora' : null,
        }
      : { title: 'Contá tus insumos', detail: 'Lo que hay hoy en la cocina.', action: null, actionLabel: null }
  } else if (current === 'activate') {
    next = {
      title: 'Ya podés activar',
      detail: `${input.dishes.filter((d) => d.recipe).length} platos van a descontar solos con cada venta. Antes, pegale una mirada a los avisos de abajo.`,
      action: input.can.manage ? { type: 'setup' } : null,
      actionLabel: input.can.manage ? 'Ir a activar' : null,
    }
  } else {
    const missing = !dailyChecks[0] ? 'Registrá la próxima compra el día que llega' : !dailyChecks[1] ? 'Hacé un conteo rápido de lo que más se mueve' : !dailyChecks[2] ? 'Cuando algo se tire o se venza, anotalo como merma' : null
    next = missing
      ? { title: 'El día a día', detail: missing, action: !dailyChecks[0] ? { type: 'receive', skuId: null } : { type: 'view', view: 'ahora' }, actionLabel: !dailyChecks[0] ? 'Registrar mercadería' : 'Ver tareas de hoy' }
      : { title: '¡Todo en marcha!', detail: 'Seguí con el ritmo: compras el día que llegan, mermas en el momento y conteos cuando la app te los pida.', action: null, actionLabel: null }
  }

  const order: Record<FindingLevel, number> = { stop: 0, warn: 1, tip: 2, win: 3 }
  findings.sort((a, b) => order[a.level] - order[b.level])
  const counts = { stop: 0, warn: 0, tip: 0, win: 0 }
  for (const f of findings) counts[f.level]++

  return {
    stages,
    current,
    pct,
    next,
    findings,
    starDishes: stars.map((d) => ({ menuItemId: d.menuItemId, name: d.name, soldLast30d: d.soldLast30d, hasRecipe: Boolean(d.recipe) })),
    counts,
  }
}
