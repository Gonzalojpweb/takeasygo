'use client'

// ── CategoryChip ────────────────────────────────────────────────────────────
//
// Chip de categoría uniforme.
// Doc 02 §1.3: Un solo tratamiento de color, sin paleta arcoíris.
//
// Estados:
//   - Default: fondo --tgo-surface-1, texto --tgo-text-secondary
//   - Selected: fondo --tgo-brand, texto --tgo-text-inverse

import { useHaptic } from '@/components/tgo/useHaptic'

interface CategoryChipProps {
  name: string
  isSelected: boolean
  onSelect: (name: string) => void
}

export default function CategoryChip({
  name,
  isSelected,
  onSelect,
}: CategoryChipProps) {
  const haptic = useHaptic()

  return (
    <button
      onClick={() => {
        haptic.selection()
        onSelect(name)
      }}
      className="shrink-0 px-4 py-2 rounded-full font-semibold transition-all active:scale-95"
      style={{
        backgroundColor: isSelected ? 'var(--tgo-brand)' : 'var(--tgo-surface-1)',
        color: isSelected ? 'var(--tgo-text-inverse)' : 'var(--tgo-text-secondary)',
        fontSize: 'var(--tgo-type-caption)',
        border: `1px solid ${isSelected ? 'var(--tgo-brand)' : 'var(--tgo-border)'}`,
      }}
    >
      {name}
    </button>
  )
}
