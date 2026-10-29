import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'
import spec from '@/lib/openapi/openapi.generated.json'

// ============================================================================
// GET /api/superadmin/openapi — spec OpenAPI 3.1 de TakeasyGO (solo superadmin)
// ============================================================================
// Lo consume Swagger UI en /superadmin/api-docs. El spec se genera del código
// (scripts/build-openapi.mjs) y un test falla si quedó desactualizado.
// No se publica: describe rutas internas server-to-server.
// ============================================================================

export async function GET() {
  const authError = await requireSuperAdmin()
  if (authError) return authError
  return NextResponse.json(spec, { headers: { 'Cache-Control': 'private, no-store' } })
}
