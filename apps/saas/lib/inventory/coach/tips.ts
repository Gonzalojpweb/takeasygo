// ============================================================================
// Guía en vivo — consejos mientras se completa un formulario (lógica pura)
// ============================================================================
// · guessCategory: sugiere la categoría por el nombre («mejillones» → mariscos).
// · UNIT_CHOICES: cómo se cuenta un insumo, con ejemplos de cocina.
// · recipeLiveTips: mientras se arma una receta, avisa cantidades raras y
//   para cuántos platos alcanza lo que hay (antes de guardar, no después).
// · duplicateReceipt: la misma compra registrada hace minutos.
// ============================================================================

import { convert, qtyText, suspiciousPortion, type CoachUnit } from './rules'

const CATEGORY_WORDS: Array<[string, string[]]> = [
  ['fish_seafood', ['mejillon', 'boqueron', 'merluza', 'salmon', 'langostino', 'camaron', 'calamar', 'pulpo', 'atun', 'abadejo', 'lenguado', 'trucha', 'almeja', 'vieira', 'rabas', 'pescado', 'marisco', 'anchoa', 'sardina', 'cornalito', 'pejerrey', 'mero', 'brotola', 'gamba', 'kani']],
  ['meat_poultry', ['carne', 'pollo', 'cerdo', 'bondiola', 'vacio', 'asado', 'lomo', 'bife', 'nalga', 'peceto', 'cuadril', 'matambre', 'chorizo', 'morcilla', 'jamon', 'panceta', 'bacon', 'hamburguesa', 'pechuga', 'muslo', 'milanesa', 'molida', 'salchicha', 'cordero', 'pato', 'osobuco', 'entraña', 'mollej', 'riñon', 'salame', 'mechada']],
  ['vegetables', ['papa', 'cebolla', 'tomate', 'lechuga', 'zanahoria', 'morron', 'pimiento', 'ajo', 'zapallo', 'calabaza', 'berenjena', 'zucchini', 'espinaca', 'acelga', 'rucula', 'puerro', 'verdeo', 'perejil', 'albahaca', 'champiñon', 'hongo', 'choclo', 'arveja', 'brocoli', 'repollo', 'batata', 'palta', 'pepino', 'apio', 'remolacha', 'cilantro', 'jengibre', 'verdura']],
  ['fruits', ['limon', 'naranja', 'manzana', 'banana', 'frutilla', 'durazno', 'pera', 'kiwi', 'anana', 'mango', 'uva', 'arandano', 'maracuya', 'lima', 'pomelo', 'fruta', 'cereza', 'sandia', 'melon']],
  ['dairy', ['leche', 'queso', 'muzzarella', 'mozzarella', 'crema', 'manteca', 'yogur', 'ricota', 'parmesano', 'roquefort', 'provolone', 'cheddar', 'dulce de leche', 'huevo', 'reggianito', 'sardo', 'tybo', 'fontina']],
  ['dry_goods', ['harina', 'arroz', 'fideo', 'azucar', 'sal', 'aceite', 'vinagre', 'pan', 'rebozador', 'pan rallado', 'polenta', 'lenteja', 'garbanzo', 'poroto', 'especia', 'pimienta', 'oregano', 'pimenton', 'comino', 'levadura', 'cacao', 'chocolate', 'mayonesa', 'ketchup', 'mostaza', 'salsa', 'pure', 'lata', 'tapa', 'masa', 'pasta', 'cafe', 'te ', 'yerba', 'galletita']],
  ['beverages', ['gaseosa', 'agua', 'cerveza', 'vino', 'jugo', 'soda', 'coca', 'sprite', 'fanta', 'pepsi', 'tonica', 'fernet', 'gin', 'vodka', 'whisky', 'ron', 'aperitivo', 'espumante', 'champagne', 'energizante', 'licor']],
  ['packaging', ['caja', 'bolsa', 'servilleta', 'vaso', 'sorbete', 'bandeja', 'film', 'papel', 'aluminio', 'descartable', 'envase', 'tapa', 'cubierto', 'pote', 'contenedor', 'etiqueta']],
]

function plain(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Categoría probable por el nombre (null si no hay pista clara). */
export function guessCategory(name: string): string | null {
  const n = ` ${plain(name)} `
  for (const [category, words] of CATEGORY_WORDS) {
    if (words.some((w) => n.includes(plain(w)))) return category
  }
  return null
}

export const UNIT_CHOICES: Array<{ value: 'kg' | 'l' | 'unit'; title: string; examples: string; how: string }> = [
  { value: 'kg', title: 'Por peso', examples: 'Carnes, pescado, verduras, harina, queso', how: 'Lo pesás en la balanza (kg o g).' },
  { value: 'l', title: 'Por volumen', examples: 'Aceite, leche, crema, salsas, vino de cocina', how: 'Lo medís en litros o ml.' },
  { value: 'unit', title: 'Por unidad', examples: 'Huevos, panes, latas, botellas, mejillones si los contás de a uno', how: 'Lo contás de a uno.' },
]

export interface LiveTip {
  key: string
  tone: 'warn' | 'ok' | 'stop' | 'info'
  text: string
}

export interface LiveRow {
  skuId: string
  skuName: string
  canonicalUnit: CoachUnit
  quantity: number | null
  unit: CoachUnit
  /** Stock de la sede (null = nunca se contó). */
  stock: { qty: number; counted: boolean } | null
}

/** Consejos mientras se arma la receta de un plato (antes de guardar). */
export function recipeLiveTips(rows: LiveRow[]): LiveTip[] {
  const tips: LiveTip[] = []
  let min = Infinity
  let limiting: LiveRow | null = null
  let unknown = 0
  for (const r of rows) {
    if (r.quantity === null || !(r.quantity > 0)) continue
    const odd = suspiciousPortion({ quantity: r.quantity, unit: r.unit })
    if (odd) tips.push({ key: `odd:${r.skuId}`, tone: 'warn', text: `${r.skuName}: ${odd.text} Acordate: es lo que lleva UN plato, no la tanda entera.` })
    if (!r.stock || !r.stock.counted) {
      unknown++
      continue
    }
    const per = convert(r.quantity, r.unit, r.canonicalUnit)
    if (per === null || per <= 0) continue
    const p = Math.floor(Math.max(0, r.stock.qty) / per + 1e-9)
    if (p < min) {
      min = p
      limiting = r
    }
  }
  if (limiting && Number.isFinite(min)) {
    const have = qtyText(Math.max(0, limiting.stock!.qty), limiting.canonicalUnit)
    if (min < 1) {
      tips.push({
        key: 'portions',
        tone: 'stop',
        text: `Con lo que hay hoy no alcanza ni para un plato: ${limiting.skuName} tiene ${have} y la receta pide ${qtyText(limiting.quantity!, limiting.unit)}. Si activás así, el plato va a aparecer «Sin inventario» hasta que registres una compra.`,
      })
    } else {
      tips.push({
        key: 'portions',
        tone: min <= 5 ? 'warn' : 'ok',
        text: `Con lo que hay hoy alcanza para ${min} ${min === 1 ? 'plato' : 'platos'}${min <= 5 ? `: ${limiting.skuName} (${have}) es lo primero que se termina.` : '.'}`,
      })
    }
  }
  if (unknown > 0 && rows.length > 0) {
    tips.push({
      key: 'unknown',
      tone: 'info',
      text: `${unknown === 1 ? 'Un ingrediente todavía no se contó' : `${unknown} ingredientes todavía no se contaron`}: después de guardar, contalos para saber para cuántos platos alcanza.`,
    })
  }
  return tips
}

/** ¿La misma compra (insumo y cantidad) ya se registró hace poco en este navegador? */
export function duplicateReceipt(
  recent: Array<{ skuId: string; quantity: number; unit: string; at: number }>,
  next: { skuId: string; quantity: number; unit: string },
  now: number,
  windowMs = 15 * 60_000,
): { minutes: number } | null {
  const hit = recent.find((r) => r.skuId === next.skuId && r.unit === next.unit && Math.abs(r.quantity - next.quantity) < 1e-9 && now - r.at <= windowMs)
  return hit ? { minutes: Math.max(1, Math.round((now - hit.at) / 60_000)) } : null
}
