import { NextResponse } from 'next/server'
import InventorySKU from '@/models/InventorySKU'
import { normalizeName } from '@takeasygo/business/inventory'
import { InventoryError, inventoryRoute } from '@/lib/inventory/route'
import { ImportFileError, MAX_IMPORT_BYTES, readImportFile } from '@/lib/inventory/import/table'
import { mapSheet, sameDimension } from '@/lib/inventory/import/mapping'

/**
 * POST /api/[tenant]/inventory/import/preview (manage)
 * multipart/form-data con `file` (.xlsx o .csv exportado de otro sistema).
 * Lee y mapea el archivo SIN escribir nada: devuelve cada hoja con sus filas
 * normalizadas, el diagnóstico (ok · revisar · error · omitida) y si el
 * insumo ya existe en el comercio. El archivo no se guarda.
 */
export const POST = inventoryRoute('manage', async (ctx) => {
  const form = await ctx.request.formData().catch(() => null)
  const file = form?.get('file')
  if (!file || typeof file === 'string') throw InventoryError.validation('Subí un archivo')
  if (file.size > MAX_IMPORT_BYTES) throw InventoryError.validation('El archivo supera los 2 MB')

  let sheets
  try {
    sheets = await readImportFile(file.name, Buffer.from(await file.arrayBuffer()))
  } catch (err) {
    if (err instanceof ImportFileError) throw InventoryError.validation(err.message)
    throw err
  }
  const mapped = sheets.map((s) => mapSheet(s))

  // ¿Ya existe? (mismo nombre normalizado en el comercio)
  const keys = Array.from(new Set<string>(mapped.flatMap((s) => s.rows.map((r) => normalizeName(r.name))).filter(Boolean)))
  const existing = await InventorySKU.find({ tenantId: ctx.tenantObjectId, nameKey: { $in: keys } })
    .select('_id name nameKey canonicalUnit')
    .lean<{ _id: unknown; name: string; nameKey: string; canonicalUnit: string }[]>()
  const byKey = new Map(existing.map((s) => [s.nameKey, s]))
  for (const sheet of mapped) {
    for (const row of sheet.rows) {
      const sku = byKey.get(normalizeName(row.name))
      if (!sku) continue
      row.match = { skuId: String(sku._id), name: sku.name, unit: sku.canonicalUnit }
      if (row.include && !sameDimension(sku.canonicalUnit, row.unit)) {
        row.status = 'error'
        row.include = false
        row.messages.push(`Ya existe «${sku.name}» medido en ${sku.canonicalUnit}; acá viene en ${row.unit}.`)
      }
    }
  }

  return NextResponse.json({ fileName: file.name, sheets: mapped })
})
