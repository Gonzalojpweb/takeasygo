import { NextResponse } from 'next/server'
import { posRoute } from '@/lib/pos-online/route'
import { loadSectors } from '@/lib/pos-online/sectors'

// ============================================================================
// GET /api/[tenant]/pos/sectors — sectores del salón (obs. 24/10)
// ============================================================================
// Los espacios de la sede definidos en el SaaS (Location.spaces). El POS los
// usa para ubicar cada mesa; no los crea ni los edita (fuente única).
// ============================================================================

export const GET = posRoute('tables.read', async (ctx) => {
  return NextResponse.json({ sectors: await loadSectors(ctx.tenantId, ctx.locationId) })
})
