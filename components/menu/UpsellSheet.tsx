'use client'

import { X, Plus } from 'lucide-react'

function tn(obj: any, field: 'name' | 'description', locale: 'es' | 'en'): string {
  if (locale === 'en') {
    const trans = field === 'name' ? obj.nameTranslations : obj.descriptionTranslations
    if (trans?.en) return trans.en
  }
  return obj[field] || ''
}

const LABELS = {
  es: { title: '¿Le sumás algo más?', skip: 'No, gracias' },
  en: { title: 'Add something?', skip: 'No, thanks' },
}

interface Props {
  suggestions: any[]
  onAddPlain: (item: any) => void
  onOpenModal: (item: any) => void
  onClose: () => void
  primary: string
  bg: string
  text: string
  locale: 'es' | 'en'
}

export default function UpsellSheet({
  suggestions,
  onAddPlain,
  onOpenModal,
  onClose,
  primary,
  bg,
  text,
  locale,
}: Props) {
  if (suggestions.length === 0) return null

  const L = LABELS[locale]

  function handleAdd(item: any) {
    if ((item.customizationGroups ?? []).length > 0) {
      onOpenModal(item)
    } else {
      onAddPlain(item)
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative rounded-t-3xl p-6" style={{ backgroundColor: bg }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-base" style={{ color: text }}>
            {L.title}
          </h3>
          <button onClick={onClose} className="opacity-40 hover:opacity-70">
            <X size={18} style={{ color: text }} />
          </button>
        </div>

        <div className="space-y-3 mb-5">
          {suggestions.map((item: any) => (
            <div
              key={item._id}
              className="flex items-center gap-3 p-3 rounded-2xl border"
              style={{ borderColor: primary + '25' }}
            >
              {item.imageUrl && (
                <img
                  src={item.imageUrl}
                  alt={tn(item, 'name', locale)}
                  className="w-14 h-14 object-cover rounded-xl flex-shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm" style={{ color: text }}>
                  {tn(item, 'name', locale)}
                </p>
                {item.description && (
                  <p className="text-xs opacity-50 line-clamp-1 mt-0.5">
                    {tn(item, 'description', locale)}
                  </p>
                )}
                <p className="font-bold text-sm mt-1" style={{ color: primary }}>
                  ${item.price.toLocaleString('es-AR')}
                </p>
              </div>
              <button
                onClick={() => handleAdd(item)}
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: primary, color: bg }}
              >
                <Plus size={16} />
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 text-sm font-medium opacity-50 hover:opacity-70 transition-opacity"
          style={{ color: text }}
        >
          {L.skip}
        </button>
      </div>
    </div>
  )
}
