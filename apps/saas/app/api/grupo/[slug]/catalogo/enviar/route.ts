import { NextRequest, NextResponse } from 'next/server'
import { catalogRoute } from '@/lib/organizations/catalog-http'
import { pushCatalog, pushSchema } from '@/lib/organizations/catalog'
import { readJson } from '@/lib/organizations/http'

// ============================================================================
// POST /api/grupo/[slug]/catalogo/enviar — enviar platos de la carta central
// a las cartas de las sedes.
// Body: { itemKeys, targets: [{ tenantId, locationId }], fields: ['info' |
//         'prices' | 'options'], linkByName?, overrideLocalPrices?, dryRun? }
// dryRun (por defecto true) = vista previa sin guardar. Solo sedes que tu
// membresía cubre (otra → 404). Cada sede se guarda por separado: si alguien
// cambió su carta en el medio, queda «conflict» y no se pisa.
// ============================================================================

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return catalogRoute(request, (await params).slug, async (ctx) => {
    const input = pushSchema.parse(await readJson(request))
    return NextResponse.json(await pushCatalog(ctx, input))
  })
}
