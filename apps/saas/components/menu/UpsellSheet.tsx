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
  es: { 
    title: '¿Completamos tu pedido?', 
    subtitle: 'Otros clientes también agregaron...',
    skip: 'No, gracias' 
  },
  en: { 
    title: 'Complete your order?', 
    subtitle: 'Customers also added...',
    skip: 'No thanks' 
  },
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
    const hasVariants = (item.variants ?? []).length > 0
    if (hasVariants || (item.customizationGroups ?? []).length > 0) {
      onOpenModal(item)
    } else {
      onAddPlain(item)
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      <div 
        className="relative rounded-t-3xl overflow-hidden max-h-[85dvh] flex flex-col"
        style={{ backgroundColor: bg }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-2xl font-bold" style={{ color: text }}>
              {L.title}
            </h3>
            <button 
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-black/10"
            >
              <X size={20} style={{ color: text }} />
            </button>
          </div>
          
          <p className="text-base opacity-70" style={{ color: text }}>
            {L.subtitle}
          </p>
        </div>

        {/* Suggestions List */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
          {suggestions.map((item: any) => {
            const hasCustomization = (item.variants ?? []).length > 0 || 
                                   (item.customizationGroups ?? []).length > 0

            return (
              <div
                key={item._id}
                className="flex gap-4 bg-white/90 dark:bg-zinc-900 rounded-3xl p-4 active:scale-[0.985] transition-all shadow-sm border"
                style={{ 
                  borderColor: primary + '20',
                  backgroundColor: bg 
                }}
              >
                {/* Image */}
                {item.imageUrl && (
                  <div className="flex-shrink-0">
                    <img
                      src={item.imageUrl}
                      alt={tn(item, 'name', locale)}
                      className="w-24 h-24 object-cover rounded-2xl"
                    />
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="flex-1">
                    <p className="font-bold text-lg leading-tight" style={{ color: text }}>
                      {tn(item, 'name', locale)}
                    </p>
                    
                    {item.description && (
                      <p className="text-sm mt-1.5 line-clamp-2 opacity-70" style={{ color: text }}>
                        {tn(item, 'description', locale)}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-3">
                    <p className="font-bold text-xl" style={{ color: primary }}>
                      ${item.price.toLocaleString('es-AR')}
                    </p>

                    <button
                      onClick={() => handleAdd(item)}
                      className="flex items-center gap-2 px-6 py-3 rounded-2xl font-semibold text-sm active:scale-95 transition-all"
                      style={{ 
                        backgroundColor: primary, 
                        color: bg 
                      }}
                    >
                      <Plus size={18} />
                      Agregar
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Skip Button */}
        <div className="px-6 py-5 border-t" style={{ borderColor: text + '15' }}>
          <button
            onClick={onClose}
            className="w-full py-4 text-base font-medium transition-opacity hover:opacity-70"
            style={{ color: text }}
          >
            {L.skip}
          </button>
        </div>
      </div>
    </div>
  )
}