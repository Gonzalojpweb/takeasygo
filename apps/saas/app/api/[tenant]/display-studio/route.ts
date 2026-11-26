/**
 * GET /api/[tenant]/display-studio — biblioteca de Display Studio: plantillas
 * Free y Premium, cuáles tiene desbloqueadas el comercio (se hereda a todas sus
 * sedes) y el precio de las Premium en pesos al cambio del momento.
 * Plan Élite + rol de gestión (mismo contexto que las piezas de pantalla).
 */
import { NextRequest, NextResponse } from 'next/server'
import { screenPiecesContext } from '@/lib/display/pieces-route'
import { STUDIO_TEMPLATES, STUDIO_FONTS, STUDIO_COLLECTIONS } from '@/lib/display/studio/catalog'
import { unlockedTemplateIds, purchasedIds } from '@/models/DisplayTemplatePurchase'
import { priceArsCents, usdArsRate } from '@/lib/display/studio/purchase'
import { studioEnabled, bgRemovalMode } from '@/lib/display/studio/flags'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const ctx = await screenPiecesContext(request, params)
  if ('error' in ctx) return ctx.error
  if (!studioEnabled()) return NextResponse.json({ error: 'No disponible' }, { status: 404 })
  const [unlocked, bought, rate] = await Promise.all([unlockedTemplateIds(ctx.tenantId), purchasedIds(ctx.tenantId), usdArsRate()])
  return NextResponse.json({
    fonts: STUDIO_FONTS,
    bgRemoval: bgRemovalMode(),
    rate,
    templates: STUDIO_TEMPLATES.map((t) => ({
      ...t,
      unlocked: t.tier === 'free' || unlocked.has(t.id),
      priceArs: t.tier === 'premium' && t.priceUsd && rate ? priceArsCents(t.priceUsd, rate) / 100 : null,
    })),
    // Colecciones: precio del día y cuánto ahorran contra comprar las plantillas sueltas.
    collections: STUDIO_COLLECTIONS.map((c) => {
      const loose = c.templateIds.reduce((n, id) => n + (STUDIO_TEMPLATES.find((t) => t.id === id)?.priceUsd ?? 0), 0)
      return {
        ...c,
        owned: bought.has(c.id) || c.templateIds.every((id) => unlocked.has(id)),
        missing: c.templateIds.filter((id) => !unlocked.has(id)).length,
        looseUsd: loose,
        priceArs: rate ? priceArsCents(c.priceUsd, rate) / 100 : null,
      }
    }),
  })
}
