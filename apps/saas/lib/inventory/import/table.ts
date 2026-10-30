// ============================================================================
// Importador de inventario — lectura de archivos (30/10/2026)
// ============================================================================
// Convierte lo que exporta otro sistema (Fudo, Maxirest, Bistrosoft, Núcleo,
// una planilla propia) en tablas simples: hojas → encabezados → filas de
// celdas (texto, número o vacío). No interpreta nada: eso es mapping.ts.
//
// Formatos: .xlsx (ExcelJS) y .csv (separador ; , o tab; UTF-8 o Latin-1,
// típico de sistemas argentinos). El .xls binario viejo no se lee: se pide
// guardarlo como .xlsx.
//
// Seguridad: tope de tamaño y de filas; las fórmulas no se evalúan (se usa
// el resultado guardado) y el texto que empieza con = + - @ nunca vuelve a
// una planilla (se muestra y se guarda como texto plano).
// ============================================================================

import ExcelJS from 'exceljs'

export type Cell = string | number | null

export interface ImportSheet {
  name: string
  headers: string[]
  rows: Cell[][]
}

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024
export const MAX_IMPORT_ROWS = 1000

export class ImportFileError extends Error {}

function cellValue(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') return v.trim() === '' ? null : v.trim()
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') {
    if ('result' in v) return cellValue((v as { result?: ExcelJS.CellValue }).result ?? null)
    if ('richText' in v) return cellValue((v as { richText: { text: string }[] }).richText.map((t) => t.text).join(''))
    if ('text' in v) return cellValue(String((v as { text: unknown }).text))
    if ('error' in v) return null
  }
  return String(v)
}

async function readXlsx(buffer: Buffer): Promise<ImportSheet[]> {
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer)
  } catch {
    throw new ImportFileError('No se pudo leer el Excel. Si es un .xls viejo, abrilo y guardalo como .xlsx.')
  }
  const sheets: ImportSheet[] = []
  for (const ws of wb.worksheets) {
    const width = ws.columnCount
    const all: Cell[][] = []
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r)
      const cells: Cell[] = []
      for (let c = 1; c <= width; c++) cells.push(cellValue(row.getCell(c).value))
      all.push(cells)
    }
    pushSheet(sheets, ws.name, all)
  }
  return sheets
}

/** La primera fila con al menos dos celdas de texto es el encabezado. */
function pushSheet(out: ImportSheet[], name: string, all: Cell[][]): void {
  const headerAt = all.findIndex((r) => r.filter((c) => typeof c === 'string').length >= 2)
  if (headerAt < 0) return
  const headers = all[headerAt].map((c) => (c === null ? '' : String(c)))
  const rows = all.slice(headerAt + 1).filter((r) => r.some((c) => c !== null))
  if (rows.length === 0) return
  out.push({ name, headers, rows })
}

function decodeText(buffer: Buffer): string {
  const utf8 = buffer.toString('utf8')
  // U+FFFD = bytes que no son UTF-8 válido ⇒ el archivo viene en Latin-1.
  const text = utf8.includes('�') ? buffer.toString('latin1') : utf8
  return text.replace(/^﻿/, '')
}

/** CSV con comillas ("a;b" y "" escapado); el separador se detecta. */
export function parseCsv(text: string): Cell[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const counts = [';', ',', '\t'].map((d) => [d, firstLine.split(d).length - 1] as const)
  const delimiter = counts.sort((a, b) => b[1] - a[1])[0][1] > 0 ? counts[0][0] : ','
  const rows: Cell[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') quoted = false
      else field += ch
      continue
    }
    if (ch === '"') quoted = true
    else if (ch === delimiter) { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row.map((c) => (c.trim() === '' ? null : c.trim()))); row = []; field = ''
    } else field += ch
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row.map((c) => (c.trim() === '' ? null : c.trim()))) }
  return rows
}

export async function readImportFile(fileName: string, buffer: Buffer): Promise<ImportSheet[]> {
  if (buffer.length > MAX_IMPORT_BYTES) throw new ImportFileError('El archivo supera los 2 MB. Exportá solo el inventario (sin ventas ni movimientos).')
  const lower = fileName.toLowerCase()
  let sheets: ImportSheet[]
  if (lower.endsWith('.xlsx')) sheets = await readXlsx(buffer)
  else if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    sheets = []
    pushSheet(sheets, fileName.replace(/\.[^.]+$/, ''), parseCsv(decodeText(buffer)))
  } else if (lower.endsWith('.xls')) {
    throw new ImportFileError('Los .xls viejos no se pueden leer. Abrilo en Excel y guardalo como .xlsx (o exportalo como CSV).')
  } else {
    throw new ImportFileError('Subí un Excel (.xlsx) o un CSV.')
  }
  const total = sheets.reduce((n, s) => n + s.rows.length, 0)
  if (total === 0) throw new ImportFileError('El archivo no tiene filas con datos.')
  if (total > MAX_IMPORT_ROWS) throw new ImportFileError(`El archivo tiene ${total} filas; el máximo por importación es ${MAX_IMPORT_ROWS}. Dividilo por categoría.`)
  return sheets
}
