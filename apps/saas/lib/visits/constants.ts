// Fecha desde la que el origen de las visitas al menú se mide bien (corrección
// de atribución del 20/11/2026, lib/visits/attribution.ts). Antes casi todo
// quedaba como «Otro». El panel de tráfico avisa si el rango elegido la cruza.
// Archivo sin dependencias: se usa también en el cliente.
export const VISIT_SOURCE_FIX_DATE = new Date('2026-11-20T03:00:00Z') // 20/11/2026 00:00 (Argentina)
