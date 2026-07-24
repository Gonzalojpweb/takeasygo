'use client'

interface SlotData {
  name: string
  categoryIds: string[]
  itemIds: string[]
  requiredQuantity: number
  customizationMode?: 'none' | 'variant' | 'full'
  allowedExtraGroupIds?: string[]
  resolvedItems?: Array<{
    _id: string
    name: string
    categoryName: string
    variants: any[]
    customizationGroups: any[]
  }>
}

interface Props {
  slots: SlotData[]
  promoTitle: string
}

export default function PromoPickerPreview({ slots, promoTitle }: Props) {
  if (slots.length === 0) {
    return (
      <div className="border border-dashed border-border rounded-2xl p-8 text-center text-sm text-muted-foreground">
        Agregá al menos un slot para ver la preview
      </div>
    )
  }

  return (
    <div className="pointer-events-none">
      <div className="rounded-3xl border border-border bg-background w-full max-w-sm max-h-[400px] overflow-y-auto p-5">
        <div className="mb-3">
          <h3 className="font-bold text-lg">{promoTitle || 'Promoción'}</h3>
        </div>

        <p className="text-xs text-muted-foreground mb-3 font-medium">
          Elegí un producto de cada categoría:
        </p>

        <div className="space-y-3">
          {slots.map((slot, idx) => {
            const items = slot.resolvedItems ?? Array.from(
              { length: slot.requiredQuantity },
              (_, i) => ({
                _id: `placeholder-${idx}-${i}`,
                name: `${slot.name || 'Slot sin nombre'} ${i + 1}`,
                categoryName: slot.name || 'Slot sin nombre',
                variants: [],
                customizationGroups: [],
              })
            )

            return (
              <div key={idx}>
                <div className="flex items-center gap-2 mb-1.5">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                    {slot.name || 'Slot sin nombre'} — elegí {slot.requiredQuantity}
                  </p>
                  {slot.customizationMode && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                      slot.customizationMode === 'none' ? 'bg-muted text-muted-foreground'
                        : slot.customizationMode === 'variant' ? 'bg-blue-100 text-blue-700'
                        : 'bg-primary/10 text-primary'
                    }`}>
                      {slot.customizationMode === 'none' ? 'Sin pers.'
                        : slot.customizationMode === 'variant' ? 'Solo variante'
                        : 'Personalización'}
                    </span>
                  )}
                  {(slot.allowedExtraGroupIds ?? []).length > 0 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                      Whitelist
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  {items.map((item) => (
                    <div
                      key={item._id}
                      className="w-full text-left p-3 rounded-xl border border-border opacity-60"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold flex-1">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {item.variants?.length > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            {item.variants.length} var
                          </span>
                        )}
                        {item.customizationGroups?.length > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            {item.customizationGroups.length} pers
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-1.5 text-xs text-muted-foreground">
                  <span className="text-emerald-600 font-medium">
                    0 de {slot.requiredQuantity} elegidas
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        <button
          type="button"
          disabled
          className="w-full mt-4 py-2.5 rounded-xl bg-muted text-muted-foreground font-bold text-sm cursor-not-allowed opacity-50"
        >
          Continuar
        </button>
      </div>
    </div>
  )
}
