// Archivos de la cuenta ads usados en algún documento (para el cron de limpieza).
import AppStory from '@/models/AppStory'
import Promotion from '@/models/Promotion'
import StoreItem from '@/models/StoreItem'
import QrPromo from '@/models/QrPromo'

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** public_ids (de la lista) que aparecen en alguna URL guardada. */
export async function referencedPublicIds(publicIds: string[]): Promise<Set<string>> {
  const used = new Set<string>()
  if (publicIds.length === 0) return used
  const re = new RegExp(publicIds.map(escapeRe).join('|'))
  const sources: Array<{ model: { find: (q: object) => { select: (s: string) => { lean: () => Promise<Array<Record<string, unknown>>> } } }; fields: string[] }> = [
    { model: AppStory as never, fields: ['imageUrl', 'videoUrl', 'videoPosterUrl'] },
    { model: Promotion as never, fields: ['imageUrl'] },
    { model: StoreItem as never, fields: ['imageUrl'] },
    { model: QrPromo as never, fields: ['imageUrl'] },
  ]
  for (const { model, fields } of sources) {
    const docs = await model.find({ $or: fields.map((f) => ({ [f]: re })) }).select(fields.join(' ')).lean()
    for (const d of docs) {
      for (const f of fields) {
        const v = d[f]
        if (typeof v !== 'string') continue
        for (const pid of publicIds) if (v.includes(pid)) used.add(pid)
      }
    }
  }
  return used
}

