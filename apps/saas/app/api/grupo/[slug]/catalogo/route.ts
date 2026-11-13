import { NextRequest, NextResponse } from 'next/server'
import { catalogRoute } from '@/lib/organizations/catalog-http'
import { catalogEditSchema, catalogView, editCatalog } from '@/lib/organizations/catalog'
import { readJson } from '@/lib/organizations/http'

// ============================================================================
// /api/grupo/[slug]/catalogo — carta central del grupo (F3)
//   GET  → carta central, sedes a las que podés enviar y últimos envíos.
//          Propietario, administrador general y gerente de marca.
//   POST → editar: { action: upsertCategory | deleteCategory | upsertItem |
//          archiveItem | importFromMenu, ... }. Propietario y administrador
//          general. 409 si otro la cambió en el medio.
// ============================================================================

type Ctx = { params: Promise<{ slug: string }> }

export async function GET(request: NextRequest, { params }: Ctx) {
  return catalogRoute(request, (await params).slug, async (ctx) => NextResponse.json(await catalogView(ctx)))
}

export async function POST(request: NextRequest, { params }: Ctx) {
  return catalogRoute(request, (await params).slug, async (ctx) => {
    const input = catalogEditSchema.parse(await readJson(request))
    // La carta completa no viaja dos veces: va en `view`.
    const result: Record<string, unknown> = { ...(await editCatalog(ctx, input)) }
    delete result.catalog
    return NextResponse.json({ ok: true, ...result, view: await catalogView(ctx) })
  })
}
