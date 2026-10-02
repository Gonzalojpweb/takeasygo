'use client'

import { toPesos } from '@takeasygo/business/browser'

/**
 * Render SOLO LECTURA de grupos de personalización de un plato.
 * Usado por el modal de detalle del menú dine-in (en dine-in no se compra):
 * lista variantes/grupos/opciones con sus precios extra y sub-grupos
 * anidados, sin selects, sin botones de compra.
 */

interface ReadOnlyOption {
  _id?: unknown
  name: string
  extraPrice: number
  imageUrl?: string
  subGroups?: ReadOnlyGroup[]
}

interface ReadOnlyGroup {
  _id?: unknown
  name: string
  type: 'single' | 'multiple' | 'fixed'
  fixedCount?: number
  required: boolean
  options: ReadOnlyOption[]
  priceRule?: 'sum' | 'max' | 'average'
}

interface Props {
  groups: ReadOnlyGroup[]
  disabledGroupIds?: string[]
  disabledOptionIds?: string[]
  primaryColor: string
  textColor: string
  mutedText: string
  optionImageRegistry?: Record<string, string>
}

function isDisabledGroup(group: ReadOnlyGroup, disabledGroupIds: string[]): boolean {
  const id = group._id != null ? String(group._id) : ''
  return disabledGroupIds.includes(id) || disabledGroupIds.includes(group.name)
}

function isDisabledOption(opt: ReadOnlyOption, disabledOptionIds: string[]): boolean {
  const id = opt._id != null ? String(opt._id) : ''
  return disabledOptionIds.includes(id) || disabledOptionIds.includes(opt.name)
}

function filterDisabled(
  groups: ReadOnlyGroup[],
  disabledGroupIds: string[],
  disabledOptionIds: string[]
): ReadOnlyGroup[] {
  const result: ReadOnlyGroup[] = []
  for (const group of groups ?? []) {
    if (isDisabledGroup(group, disabledGroupIds)) continue
    const options = (group.options ?? [])
      .filter(opt => !isDisabledOption(opt, disabledOptionIds))
      .map(opt =>
        opt.subGroups?.length
          ? { ...opt, subGroups: filterDisabled(opt.subGroups, disabledGroupIds, disabledOptionIds) }
          : opt
      )
    result.push({ ...group, options })
  }
  return result
}

export default function ReadOnlyCustomizationGroups({
  groups,
  disabledGroupIds = [],
  disabledOptionIds = [],
  primaryColor,
  textColor,
  mutedText,
  optionImageRegistry,
}: Props) {
  const visibleGroups = filterDisabled(groups, disabledGroupIds, disabledOptionIds)
  if (visibleGroups.length === 0) return null

  return (
    <div className="space-y-4">
      {visibleGroups.map((group, gi) => {
        const groupKey = group._id != null ? String(group._id) : `${group.name}-${gi}`
        return (
          <div key={groupKey} className="space-y-2">
            {/* Header del grupo */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold" style={{ color: textColor }}>
                {group.name}
              </span>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={
                  group.required
                    ? { backgroundColor: `${primaryColor}15`, color: primaryColor }
                    : { backgroundColor: 'rgba(148,163,184,0.18)', color: mutedText }
                }
              >
                {group.required ? 'Obligatorio' : 'Opcional'}
              </span>
              {group.type === 'multiple' && (
                <span className="text-[10px]" style={{ color: mutedText }}>
                  (podés elegir varias)
                </span>
              )}
              {group.type === 'fixed' && (
                <span className="text-[10px] font-bold" style={{ color: '#d97706' }}>
                  (elegí {group.fixedCount ?? 1} {group.fixedCount === 1 ? 'opción' : 'opciones'})
                </span>
              )}
            </div>

            {/* Opciones (solo lectura) */}
            <div className="flex flex-wrap gap-1.5">
              {group.options.map((opt, oi) => {
                const optKey = opt._id != null ? String(opt._id) : `${opt.name}-${oi}`
                const img = opt.imageUrl || optionImageRegistry?.[opt.name]
                return (
                  <span
                    key={optKey}
                    className="inline-flex items-center gap-1.5 rounded-full pl-1.5 pr-3 py-1.5 text-sm border"
                    style={{
                      backgroundColor: `${primaryColor}0D`,
                      borderColor: `${primaryColor}30`,
                      color: textColor,
                    }}
                  >
                    {img && <img src={img} alt="" className="w-5 h-5 rounded-full object-cover" />}
                    <span className="font-medium">{opt.name}</span>
                    {opt.extraPrice > 0 && (
                      <span className="text-xs" style={{ color: mutedText }}>
                        +${toPesos(opt.extraPrice).toLocaleString('es-AR')}
                      </span>
                    )}
                  </span>
                )
              })}
            </div>

            {/* Sub-grupos anidados bajo cada opción que los tenga */}
            {group.options.map((opt, oi) => {
              if (!opt.subGroups?.length) return null
              const subKey = `sub-${opt._id != null ? String(opt._id) : `${opt.name}-${oi}`}`
              return (
                <div
                  key={subKey}
                  className="ml-3 pl-3 border-l-2 space-y-2"
                  style={{ borderColor: `${primaryColor}30` }}
                >
                  <p className="text-[11px] font-semibold" style={{ color: mutedText }}>
                    {opt.name}
                  </p>
                  <ReadOnlyCustomizationGroups
                    groups={opt.subGroups}
                    disabledGroupIds={disabledGroupIds}
                    disabledOptionIds={disabledOptionIds}
                    primaryColor={primaryColor}
                    textColor={textColor}
                    mutedText={mutedText}
                    optionImageRegistry={optionImageRegistry}
                  />
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
