'use client'

import OptionChip from './OptionChip'

interface HalfAndHalfStepProps {
  /** Current selection: 'un_sabor' | 'mitad_y_mitad' | null */
  halfTypeSelection: string | null
  /** Auto-selected first half name */
  firstHalfSelection: string | null
  /** Available pizza flavors for first half (with halfPrice > 0) */
  halfFirstItems: Array<{ name: string; extraPrice: number }>
  /** Available pizza flavors for second half (excluding first selection) */
  halfSecondItems: Array<{ name: string; extraPrice: number }>
  /** Current second half selection */
  secondHalfSelection: string | null
  primaryColor: string
  textColor: string
  onToggleType: (type: 'Un sabor' | 'Mitad y mitad') => void
  onSelectFirstHalf: (name: string) => void
  onSelectSecondHalf: (name: string) => void
}

export default function HalfAndHalfStep({
  halfTypeSelection,
  firstHalfSelection,
  halfFirstItems,
  halfSecondItems,
  secondHalfSelection,
  primaryColor,
  textColor,
  onToggleType,
  onSelectFirstHalf,
  onSelectSecondHalf,
}: HalfAndHalfStepProps) {
  return (
    <div>
      {/* Toggle: Un sabor / Mitad y mitad */}
      <div className="mb-4">
        <span className="text-sm font-semibold text-zinc-900 mb-2 block">Tipo de pizza</span>
        <div className="flex rounded-full bg-zinc-100 p-0.5">
          {(['Un sabor', 'Mitad y mitad'] as const).map((label) => {
            const isActive = halfTypeSelection === label
            return (
              <button
                key={label}
                onClick={() => onToggleType(label)}
                className="flex-1 py-2 rounded-full text-sm font-semibold transition-all"
                style={{
                  backgroundColor: isActive ? primaryColor : 'transparent',
                  color: isActive ? 'white' : '#71717a',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Mitad y mitad: two mini-steps */}
      {halfTypeSelection === 'Mitad y mitad' && (
        <div className="space-y-3">
          {/* Step 1: Primera mitad */}
          <div className="rounded-xl p-3" style={{ backgroundColor: `${primaryColor}08` }}>
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                style={{ backgroundColor: primaryColor }}
              >
                1
              </div>
              <span className="text-xs font-semibold text-zinc-700">Primera mitad</span>
            </div>
            {firstHalfSelection ? (
              <div className="flex flex-wrap gap-1.5">
                {halfFirstItems.map((opt) => (
                  <OptionChip
                    key={opt.name}
                    name={opt.name}
                    extraPrice={opt.extraPrice}
                    isSelected={opt.name === firstHalfSelection}
                    primaryColor={primaryColor}
                    textColor={textColor}
                    onClick={() => onSelectFirstHalf(opt.name)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-400">Elegí el primer sabor</p>
            )}
          </div>

          {/* Step 2: Segunda mitad */}
          <div className="rounded-xl p-3 bg-zinc-50">
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                style={{
                  backgroundColor: secondHalfSelection ? primaryColor : '#d4d4d8',
                  color: secondHalfSelection ? 'white' : '#a1a1aa',
                }}
              >
                2
              </div>
              <span className="text-xs font-semibold text-zinc-700">Segunda mitad</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {halfSecondItems.map((opt) => (
                <OptionChip
                  key={opt.name}
                  name={opt.name}
                  extraPrice={opt.extraPrice}
                  isSelected={opt.name === secondHalfSelection}
                  primaryColor={primaryColor}
                  textColor={textColor}
                  onClick={() => onSelectSecondHalf(opt.name)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
