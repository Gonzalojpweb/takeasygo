// ============================================================================
// Display Studio — secuencias de marca (Proximo_Nivel §3)
// ============================================================================
// Una pieza que encadena de 2 a 5 piezas de Studio ya armadas (por ejemplo:
// producto estrella → combo con precio → QR), cada una con su duración y su
// transición de salida (fundido, barrido, zoom o deslizar). La pantalla las
// pasa en orden; se puede repetir la secuencia hasta 3 veces por vuelta.
// Cada paso se resuelve igual que una pieza de Studio (carta vinculada,
// Premium desbloqueada): si un paso no se puede mostrar, se saltea; con menos
// de 1 paso válido la secuencia no se manda.
// ============================================================================

import mongoose from 'mongoose'
import AppStory from '@/models/AppStory'
import { parseStudioConfig, studioFontFamilies } from '@/lib/display/studio/catalog'
import { buildStudioBoard, studioAssets, type StudioBindingCtx, type StudioBoard } from '@/lib/display/studio/board'
import type { AnyDoc } from '@/lib/display/templates'

import { SEQUENCE_TRANSITIONS, parseSequenceConfig, sequenceConfigSchema, type SequenceConfig, type SequenceTransition } from '@/lib/display/studio/sequence-schema'
export { SEQUENCE_TRANSITIONS, parseSequenceConfig, sequenceConfigSchema, type SequenceConfig, type SequenceTransition }

export interface SequenceStep { pieceId: string; durationMs: number; transition: SequenceTransition; board: StudioBoard }
export interface SequenceBoard {
  kind: 'sequence'
  orientation: 'landscape' | 'portrait'
  loops: number
  style: 'brand'
  showQr: boolean
  brand: StudioBoard['brand']
  steps: SequenceStep[]
}

/** Piezas de Studio referenciadas por las secuencias (también las pausadas: un paso no necesita estar activo solo). */
export async function loadSequenceRefs(tenantId: unknown, docs: AnyDoc[]): Promise<Map<string, AnyDoc>> {
  const ids = new Set<string>()
  for (const d of docs) {
    if (d.screenTemplate?.kind !== 'sequence') continue
    for (const s of parseSequenceConfig(d.screenTemplate.config)?.steps ?? []) ids.add(s.pieceId)
  }
  if (!ids.size) return new Map()
  const rows = await AppStory.find({
    _id: { $in: [...ids].map((x) => new mongoose.Types.ObjectId(x)) },
    'owner.kind': 'tenant',
    'owner.tenantId': new mongoose.Types.ObjectId(String(tenantId)),
    surfaces: 'screen',
    'screenTemplate.kind': 'studio',
  }).select('screenTemplate owner').lean<AnyDoc[]>()
  return new Map(rows.map((r) => [String(r._id), r]))
}

/** Fuentes de Google que usan los pasos (para resolverlas junto con el resto). */
export function sequenceFontFamilies(refs: Map<string, AnyDoc>): string[] {
  return [...refs.values()].flatMap((r) => { const c = parseStudioConfig(r.screenTemplate?.config); return c ? studioFontFamilies(c) : [] })
}

export function buildSequenceBoard(
  config: SequenceConfig,
  refs: Map<string, AnyDoc>,
  tenant: AnyDoc,
  fonts: Record<string, string | null>,
  binding: StudioBindingCtx,
  unlocked: Set<string>,
): { board: SequenceBoard; assets: string[]; durationMs: number } | null {
  const steps: SequenceStep[] = []
  const assets = new Set<string>()
  for (const s of config.steps) {
    const ref = refs.get(s.pieceId)
    const cfg = ref ? parseStudioConfig(ref.screenTemplate?.config) : null
    if (!cfg || cfg.orientation !== config.orientation) continue
    const b = buildStudioBoard(cfg, tenant, fonts, binding)
    if (b.tier === 'premium' && !unlocked.has(b.templateId)) continue
    // Dentro de una secuencia cada paso es una sola pantalla con su duración.
    b.pageMs = s.durationS * 1000
    b.pages = 1
    steps.push({ pieceId: s.pieceId, durationMs: s.durationS * 1000, transition: s.transition, board: b })
    for (const a of studioAssets(b)) assets.add(a)
  }
  if (!steps.length) return null
  const durationMs = steps.reduce((n, s) => n + s.durationMs, 0) * config.loops
  return {
    board: { kind: 'sequence', orientation: config.orientation, loops: config.loops, style: 'brand', showQr: steps.some((s) => s.board.showQr), brand: steps[0].board.brand, steps },
    assets: [...assets],
    durationMs,
  }
}

/** Al guardar: cada paso tiene que ser una pieza de Studio del comercio con la misma orientación. */
export async function sequenceError(config: SequenceConfig, tenantId: string): Promise<string | null> {
  const refs = await loadSequenceRefs(tenantId, [{ screenTemplate: { kind: 'sequence', config } }])
  for (const s of config.steps) {
    const ref = refs.get(s.pieceId)
    if (!ref) return 'Un paso de la secuencia no es una pieza de Studio de tu comercio'
    const cfg = parseStudioConfig(ref.screenTemplate?.config)
    if (!cfg || cfg.orientation !== config.orientation) return 'Todos los pasos tienen que tener la misma orientación que la secuencia'
  }
  return null
}
