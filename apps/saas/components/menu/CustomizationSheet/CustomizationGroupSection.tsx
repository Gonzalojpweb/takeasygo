'use client'

import OptionChip from './OptionChip'
import OptionPhotoCard from './OptionPhotoCard'

interface CustomizationOption {
  _id?: string
  name: string
  extraPrice: number
  imageUrl?: string
  description?: string
  subGroups?: any[]
}

interface CustomizationGroup {
  _id: string
  name: string
  type: 'single' | 'multiple'
  required: boolean
  options: CustomizationOption[]
  priceRule?: 'sum' | 'max' | 'average'
}

interface CustomizationGroupSectionProps {
  group: CustomizationGroup
  selectedNames: string[]
  optionImageRegistry?: Record<string, string>
  primaryColor: string
  textColor: string
  onToggle: (groupName: string, optionName: string) => void
  /** Recursive renderer for sub-groups */
  renderSubGroup?: (group: CustomizationGroup, selectedNames: string[]) => React.ReactNode
}

export default function CustomizationGroupSection({
  group,
  selectedNames,
  optionImageRegistry,
  primaryColor,
  textColor,
  onToggle,
  renderSubGroup,
}: CustomizationGroupSectionProps) {
  const hasPhotos = group.options.some((opt) => opt.imageUrl || optionImageRegistry?.[opt.name])
  const useGridLayout = hasPhotos && group.options.length <= 6
  const useHorizontalScroll = hasPhotos && group.options.length > 6

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-zinc-900">{group.name}</span>
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={
            group.required
              ? { backgroundColor: `${primaryColor}15`, color: primaryColor }
              : { backgroundColor: '#f4f4f5', color: '#71717a' }
          }
        >
          {group.required ? 'Obligatorio' : 'Opcional'}
        </span>
        {group.type === 'multiple' && (
          <span className="text-[10px] text-zinc-400">(podés elegir varias)</span>
        )}
        {useHorizontalScroll && (
          <span className="text-[10px] text-zinc-400 ml-auto">{group.options.length} opciones →</span>
        )}
      </div>

      {/* Layout: grid 4-col for photos ≤6 */}
      {useGridLayout && (
        <div className="grid grid-cols-4 gap-2">
          {group.options.map((opt) => {
            const img = opt.imageUrl || optionImageRegistry?.[opt.name]
            return (
              <OptionPhotoCard
                key={opt.name}
                name={opt.name}
                extraPrice={opt.extraPrice}
                imageUrl={img}
                isSelected={selectedNames.includes(opt.name)}
                primaryColor={primaryColor}
                onClick={() => onToggle(group.name, opt.name)}
              />
            )
          })}
        </div>
      )}

      {/* Layout: horizontal scroll for photos 7+ */}
      {useHorizontalScroll && (
        <div
          className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1"
          style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
        >
          {group.options.map((opt) => {
            const img = opt.imageUrl || optionImageRegistry?.[opt.name]
            return (
              <OptionPhotoCard
                key={opt.name}
                name={opt.name}
                extraPrice={opt.extraPrice}
                imageUrl={img}
                isSelected={selectedNames.includes(opt.name)}
                primaryColor={primaryColor}
                compact
                onClick={() => onToggle(group.name, opt.name)}
              />
            )
          })}
        </div>
      )}

      {/* Layout: text chips (no photos) */}
      {!hasPhotos && (
        <div className="flex flex-wrap gap-2">
          {group.options.map((opt) => (
            <OptionChip
              key={opt.name}
              name={opt.name}
              extraPrice={opt.extraPrice}
              isSelected={selectedNames.includes(opt.name)}
              primaryColor={primaryColor}
              textColor={textColor}
              onClick={() => onToggle(group.name, opt.name)}
            />
          ))}
        </div>
      )}

      {/* Recursive sub-groups */}
      {group.options.map((opt) => {
        if (!opt.subGroups?.length || !selectedNames.includes(opt.name)) return null
        if (!renderSubGroup) return null
        return (
          <div key={`sub-${opt.name}`} className="ml-4 mt-2 space-y-3 border-l-2 border-zinc-100 pl-3">
            {opt.subGroups.map((subGroup: CustomizationGroup) => (
              <div key={subGroup._id}>
                {renderSubGroup(subGroup, [])}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
