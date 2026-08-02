// ── Location Color Coding ─────────────────────────────────────────────────────
//
// Cada sede tiene un color asignado que la identifica en toda la UI admin.
// Asignación por orden de creación (colorIndex = 0, 1, 2, ...).
//
// Paleta pensada para contraste sobre fondo oscuro (sidebar) y claro (contenido).

export const LOCATION_COLORS = [
  { bg: '#3B82F6', text: '#FFFFFF', soft: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.35)', label: 'Azul' },
  { bg: '#10B981', text: '#FFFFFF', soft: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.35)', label: 'Verde' },
  { bg: '#F59E0B', text: '#1A1A1A', soft: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.35)', label: 'Ámbar' },
  { bg: '#EF4444', text: '#FFFFFF', soft: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.35)', label: 'Rojo' },
  { bg: '#8B5CF6', text: '#FFFFFF', soft: 'rgba(139, 92, 246, 0.12)', border: 'rgba(139, 92, 246, 0.35)', label: 'Violeta' },
  { bg: '#EC4899', text: '#FFFFFF', soft: 'rgba(236, 72, 153, 0.12)', border: 'rgba(236, 72, 153, 0.35)', label: 'Rosa' },
  { bg: '#06B6D4', text: '#FFFFFF', soft: 'rgba(6, 182, 212, 0.12)', border: 'rgba(6, 182, 212, 0.35)', label: 'Cyan' },
  { bg: '#84CC16', text: '#1A1A1A', soft: 'rgba(132, 204, 22, 0.12)', border: 'rgba(132, 204, 22, 0.35)', label: 'Lima' },
] as const

export type LocationColor = (typeof LOCATION_COLORS)[number]

export function getLocationColor(colorIndex: number | undefined | null): LocationColor {
  const idx = (colorIndex ?? 0) % LOCATION_COLORS.length
  return LOCATION_COLORS[idx]
}

export function getLocationColorIndex(totalLocations: number, locationId: string): number {
  // Deterministic: use the locationId string to generate a consistent index
  // Simple hash for distribution
  let hash = 0
  for (let i = 0; i < locationId.length; i++) {
    hash = ((hash << 5) - hash + locationId.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % LOCATION_COLORS.length
}
