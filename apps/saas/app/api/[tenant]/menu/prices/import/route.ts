import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import Menu from '@/models/Menu'
import { guardLocations, priceContext, priceErrorResponse, priceImportDenied } from '@/lib/menu/price-http'
import { readPriceSheet } from '@/lib/menu/price-sheet'
import { flattenMenus } from '@/lib/menu/price-engine'

const MAX_BYTES = 5 * 1024 * 1024

// POST /api/[tenant]/menu/prices/import (multipart: file, locationId)
// Lee la planilla y devuelve los precios nuevos como ajustes a mano para la
// vista previa. No escribe nada.
export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const c = await priceContext(request, (await params).tenant)
  if (!c.ok) return c.response
  const planDenied = priceImportDenied(c.ctx)
  if (planDenied) return planDenied
  try {
    const form = await request.formData()
    const file = form.get('file')
    const locationId = String(form.get('locationId') ?? '')
    if (!mongoose.Types.ObjectId.isValid(locationId)) return NextResponse.json({ error: 'Elegí una sede' }, { status: 400 })
    const denied = await guardLocations(request, [locationId])
    if (denied) return denied
    if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ error: 'Subí la planilla (.xlsx).' }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'La planilla pesa más de 5 MB.' }, { status: 400 })
    const menu = await Menu.findOne({ tenantId: c.ctx.tenantId, locationId }).lean()
    if (!menu) return NextResponse.json({ error: 'La sede no tiene carta' }, { status: 404 })
    const keys = new Set(flattenMenus([menu as never]).map(f => f.key))
    const result = await readPriceSheet(Buffer.from(await file.arrayBuffer()), keys).catch((e: Error) => {
      throw Object.assign(new Error(e.message), { userFacing: true })
    })
    return NextResponse.json(result)
  } catch (err) {
    if ((err as { userFacing?: boolean }).userFacing) return NextResponse.json({ error: (err as Error).message }, { status: 400 })
    return priceErrorResponse(err, 'import')
  }
}
