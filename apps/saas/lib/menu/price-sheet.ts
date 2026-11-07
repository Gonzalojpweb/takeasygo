/**
 * lib/menu/price-sheet.ts — planilla de precios (Excel) de «Actualizar precios».
 *
 * Descarga: una fila por plato con su precio actual y columnas vacías para el
 * precio nuevo. Subida: las filas con precio nuevo se convierten en ajustes a
 * mano (overrides) y pasan por la MISMA vista previa que el asistente: nada se
 * aplica sin revisar. La columna «Clave» identifica el plato aunque se cambie
 * el orden de las filas.
 */
import ExcelJS from 'exceljs'
import { flattenMenus, type MenuLike, type PriceOverride } from './price-engine'

const HEADERS = ['Categoría', 'Subcategoría', 'Plato', 'Precio actual', 'Precio nuevo', 'Para llevar actual', 'Para llevar nuevo', 'Clave']

export async function buildPriceSheet(menu: MenuLike, tenantName: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'TakeasyGO'
  const ws = wb.addWorksheet('Precios')
  ws.addRow([`Precios de ${tenantName}: completá «Precio nuevo» solo en los platos que cambian y subí el archivo en «Actualizar precios».`])
  ws.mergeCells(1, 1, 1, HEADERS.length)
  ws.getRow(1).font = { italic: true, color: { argb: 'FF666666' } }
  const head = ws.addRow(HEADERS)
  head.font = { bold: true }
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
  for (const f of flattenMenus([menu])) {
    const r = ws.addRow([
      f.categoryName,
      f.subcategoryName ?? '',
      f.item.name,
      Number(f.item.price ?? 0) / 100,
      null,
      f.item.takeawayPrice != null ? Number(f.item.takeawayPrice) / 100 : null,
      null,
      f.key,
    ])
    r.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7E0' } }
    r.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7E0' } }
  }
  ws.columns.forEach((c, i) => { c.width = [22, 18, 36, 14, 14, 18, 18, 10][i] })
  for (const col of [4, 5, 6, 7]) ws.getColumn(col).numFmt = '"$"#,##0'
  ws.getColumn(8).hidden = true
  ws.views = [{ state: 'frozen', ySplit: 2 }]
  return Buffer.from(await wb.xlsx.writeBuffer())
}

const toCents = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const raw = typeof v === 'object' && v !== null && 'result' in v ? (v as { result: unknown }).result : v
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null
}

export interface SheetImport {
  overrides: Record<string, PriceOverride>
  rows: number
  unknown: string[]
}

/** Lee la planilla subida. `validKeys`: claves de platos de la carta (las demás se informan). */
export async function readPriceSheet(buffer: Buffer, validKeys: Set<string>): Promise<SheetImport> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ArrayBuffer)
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('La planilla está vacía.')
  let headerRow = 0
  ws.eachRow((row, n) => { if (!headerRow && String(row.getCell(1).value ?? '').trim() === 'Categoría') headerRow = n })
  if (!headerRow) throw new Error('No encontré la fila de títulos («Categoría»…). Usá la planilla descargada desde TakeasyGO.')
  const overrides: Record<string, PriceOverride> = {}
  const unknown: string[] = []
  let rows = 0
  ws.eachRow((row, n) => {
    if (n <= headerRow) return
    const price = toCents(row.getCell(5).value)
    const takeaway = toCents(row.getCell(7).value)
    if (price == null && takeaway == null) return
    const key = String(row.getCell(8).value ?? '').trim()
    const name = String(row.getCell(3).value ?? '').trim()
    if (!validKeys.has(key)) { unknown.push(name || key || `fila ${n}`); return }
    const current = toCents(row.getCell(4).value)
    const base = price ?? current
    if (base == null) return
    overrides[key] = { price: base, ...(takeaway != null ? { takeawayPrice: takeaway } : {}) }
    rows++
  })
  return { overrides, rows, unknown }
}
