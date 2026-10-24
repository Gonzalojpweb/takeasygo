import mongoose from 'mongoose'
import Location from '@/models/Location'
import { PosError } from './errors'

// ============================================================================
// Sectores del salón = espacios de la sede (observación 24/10)
// ============================================================================
// Fuente única: `Location.spaces` (los mismos espacios que el cliente elige
// al reservar, con su capacidad para el aforo). El POS NO crea sectores: los
// lista desde acá y asigna cada mesa a uno (`Table.spaceId`). Si en el SaaS
// se renombra un espacio, el POS lo ve con el nombre nuevo (se resuelve al
// listar mesas). Sede sin espacios ⇒ lista vacía y el POS usa «Sala
// principal» hasta que se carguen en el panel.
// ============================================================================

export interface PosSector {
  id: string
  name: string
  capacity: number
  enabled: boolean
  order: number
}

interface SpaceDoc {
  _id: mongoose.Types.ObjectId
  name: string
  capacity: number
  enabled?: boolean
  order?: number
}

export async function loadSectors(tenantId: string, locationId: string): Promise<PosSector[]> {
  const location = await Location.findOne({ _id: locationId, tenantId })
    .select('spaces')
    .lean<{ spaces?: SpaceDoc[] }>()
  return (location?.spaces ?? [])
    .map((s) => ({ id: String(s._id), name: s.name, capacity: s.capacity, enabled: s.enabled !== false, order: s.order ?? 0 }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
}

/** El sector elegido tiene que existir en la sede (400 si no). */
export function resolveSector(sectors: PosSector[], spaceId: unknown): PosSector {
  if (typeof spaceId !== 'string' || !mongoose.isValidObjectId(spaceId)) {
    throw PosError.validation('spaceId inválido')
  }
  const sector = sectors.find((s) => s.id === spaceId)
  if (!sector) throw PosError.validation('Ese sector no existe en la sede (se administran en el panel)')
  return sector
}

/** Nombre vigente del sector de cada mesa (el SaaS pudo renombrarlo). */
export function withSectorNames<T extends { spaceId?: unknown; section?: string | null }>(tables: T[], sectors: PosSector[]): T[] {
  if (sectors.length === 0) return tables
  const byId = new Map(sectors.map((s) => [s.id, s.name]))
  return tables.map((t) => {
    const name = t.spaceId ? byId.get(String(t.spaceId)) : undefined
    return name ? { ...t, section: name } : t
  })
}
