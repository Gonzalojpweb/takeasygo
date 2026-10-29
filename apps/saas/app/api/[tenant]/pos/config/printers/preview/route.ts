import { NextResponse } from 'next/server'
import { isPrinterDocument } from '@takeasygo/business'
import Location from '@/models/Location'
import { posRoute } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { previewLines } from '@/lib/pos-online/configPrinters'

// ============================================================================
// GET /api/[tenant]/pos/config/printers/preview?doc=precuenta&width=80
//     [&header=…&footer=…] — vista previa de un documento con datos de ejemplo
// ============================================================================
// Usa los mismos renderers que la impresión real (precuenta, Z, factura con
// sus columnas de 32 o 48). No imprime nada.
// ============================================================================

export const GET = posRoute('config.manage', async (ctx) => {
  const p = new URL(ctx.request.url).searchParams
  const doc = p.get('doc')
  if (!isPrinterDocument(doc)) throw PosError.validation('Documento inválido')
  const width = Number(p.get('width') ?? 80)
  if (width !== 58 && width !== 80) throw PosError.validation('Ancho de papel: 58 u 80 mm')
  const header = (p.get('header') ?? '').slice(0, 200)
  const footer = (p.get('footer') ?? '').slice(0, 200)
  const location = await Location.findOne({ _id: ctx.locationId, tenantId: ctx.tenantId }).select('name').lean<{ name?: string }>()
  const lines = previewLines(doc, width, { header, footer, locationName: location?.name })
  return NextResponse.json({ doc, width, columns: width === 58 ? 32 : 48, lines })
})
