import type { NextRequest } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { getSessionUser } from '@/lib/apiAuth'
import { PosError } from './errors'

// ============================================================================
// PosContext — tenant + sesión + sede, resueltos ANTES de leer el body
// ============================================================================
// Orden de operación (M1, §3.2): tenant → auth → sede → body.
// Nunca se devuelve un 400 de validación a un caller no autenticado.
//
// Regla de sede:
//   1. El token trae `locationId` (multi-sede) → es el alcance. Si la
//      petición declara otra sede, es 403: un token atado a una sede no
//      puede escribir en otra.
//   2. Token sin sede (tenant single-sede legacy) → la sede la declara la
//      petición (`X-Location-Id` o `?locationId=`) y se valida contra
//      Location.
//   3. Ni token ni declaración → si el tenant tiene UNA sola sede activa se
//      resuelve sola (así el POS legacy sigue funcionando). Con varias o con
//      ninguna, error tipado: el server no inventa una sede.
// ============================================================================

export interface PosContext {
  request: NextRequest
  user: { id: string; role: string }
  tenantId: string
  tenantSlug: string
  /** Sede sobre la que opera la petición. Nunca null: Order lo exige. */
  locationId: string
  /** true cuando el alcance vino fijado en el token. */
  scopedByToken: boolean
}

const SLUG_RE = /^[a-z0-9-]{2,50}$/
const OBJECT_ID_RE = /^[0-9a-f]{24}$/i

function readDeclaredLocation(request: NextRequest): string | null {
  const header = request.headers.get('x-location-id')
  if (header && header.trim()) return header.trim()

  // `request.url` en vez de `request.nextUrl`: los tests pasan un Request
  // plano, y `nextUrl` solo existe en NextRequest.
  try {
    const fromQuery = new URL(request.url).searchParams.get('locationId')
    if (fromQuery && fromQuery.trim()) return fromQuery.trim()
  } catch {
    // URL inválida: no hay sede declarada.
  }
  return null
}

async function assertActiveLocation(locationId: string, tenantId: string): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(locationId)) {
    throw PosError.validation('locationId inválido')
  }
  const location = await Location.findOne({ _id: locationId, tenantId, isActive: true })
    .select('_id')
    .lean()
  if (!location) {
    // No distinguir "no existe" de "no es tuya": eso filtraría tenancy.
    throw PosError.forbidden('La sede indicada no está disponible para este tenant')
  }
}

export async function resolvePosContext(
  request: NextRequest,
  tenantKey: string
): Promise<PosContext> {
  // El segmento [tenant] acepta DOS formas a propósito:
  //   · slug  — la URL legible que usa el panel.
  //   · ObjectId — lo único que el POS tiene a mano: lo decodifica del JWT
  //     que emite apps/sync (`{ sub, tenantId, role, deviceType, locationId }`)
  //     y en modo PIN lo tipea el operador. Si exigiera slug, ningún POS
  //     podría llamar a esta superficie.
  // Desempate: si la clave es 24 hex se prueba `_id` primero y recién después
  // `slug`. El POS manda ids, así que nunca lo puede desplazar un slug raro;
  // si el id no existe se cae al slug. Sea cual sea el resultado, sigue
  // mandando el token: un tenant que no coincide con el claim ⇒ 403 (más
  // abajo), y 404 no filtra existencia.
  const isObjectId = OBJECT_ID_RE.test(tenantKey)
  const isSlug = SLUG_RE.test(tenantKey)
  if (!isObjectId && !isSlug) {
    throw PosError.notFound('Tenant no encontrado')
  }

  await connectDB()

  let tenant = isObjectId
    ? await Tenant.findOne({ _id: tenantKey, isActive: true }).select('_id slug').lean()
    : null
  if (!tenant) {
    tenant = await Tenant.findOne({ slug: tenantKey, isActive: true })
      .select('_id slug')
      .lean()
  }
  if (!tenant) {
    throw PosError.notFound('Tenant no encontrado')
  }
  const tenantId = (tenant._id as mongoose.Types.ObjectId).toString()

  const user = await getSessionUser(request)
  if (!user || !user.role) {
    throw PosError.unauthorized()
  }
  if (user.role !== 'superadmin' && user.tenantId !== tenantId) {
    throw PosError.forbidden('Acceso denegado')
  }

  const tokenLocations = (user.assignedLocations ?? []).filter(
    (id): id is string => typeof id === 'string' && id.length > 0
  )
  const declared = readDeclaredLocation(request)

  let locationId: string
  let scopedByToken = false

  if (tokenLocations.length > 0) {
    const claim = tokenLocations[0]
    if (declared && declared !== claim) {
      throw PosError.forbidden('El token está atado a otra sede')
    }
    await assertActiveLocation(claim, tenantId)
    locationId = claim
    scopedByToken = true
  } else if (declared) {
    await assertActiveLocation(declared, tenantId)
    locationId = declared
  } else {
    const locations = await Location.find({ tenantId, isActive: true })
      .select('_id')
      .limit(2)
      .lean()
    if (locations.length === 1) {
      locationId = locations[0]._id.toString()
    } else if (locations.length === 0) {
      throw PosError.validation(
        'El tenant no tiene sedes activas. Vinculá el POS de nuevo.',
        'No active locations for tenant'
      )
    } else {
      throw PosError.validation(
        'Este tenant tiene varias sedes: indicá locationId (header X-Location-Id o query).',
        'Ambiguous location: multiple active locations'
      )
    }
  }

  return {
    request,
    user: { id: user.id, role: user.role },
    tenantId,
    tenantSlug: tenant.slug,
    locationId,
    scopedByToken,
  }
}
