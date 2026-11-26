// Schema de la secuencia de marca (sin dependencias: lo importan templates.ts y el panel).
import { z } from 'zod'

const OID = /^[a-f\d]{24}$/i
export const SEQUENCE_TRANSITIONS = ['fade', 'wipe', 'scale', 'slide'] as const
export type SequenceTransition = (typeof SEQUENCE_TRANSITIONS)[number]

export const sequenceConfigSchema = z.object({
  orientation: z.enum(['landscape', 'portrait']),
  /** Veces que se repite la secuencia en su turno. */
  loops: z.number().int().min(1).max(3).default(1),
  steps: z.array(z.object({
    pieceId: z.string().regex(OID, 'Paso inválido'),
    durationS: z.number().int().min(3).max(30).default(6),
    transition: z.enum(SEQUENCE_TRANSITIONS).default('fade'),
  })).min(2, 'Una secuencia tiene de 2 a 5 pasos').max(5, 'Una secuencia tiene de 2 a 5 pasos'),
}).superRefine((c, ctx) => {
  if (new Set(c.steps.map((s) => s.pieceId)).size !== c.steps.length) ctx.addIssue({ code: 'custom', path: ['steps'], message: 'Un mismo paso no puede repetirse' })
})
export type SequenceConfig = z.infer<typeof sequenceConfigSchema>

export function parseSequenceConfig(raw: unknown): SequenceConfig | null {
  const r = sequenceConfigSchema.safeParse(raw ?? {})
  return r.success ? r.data : null
}

