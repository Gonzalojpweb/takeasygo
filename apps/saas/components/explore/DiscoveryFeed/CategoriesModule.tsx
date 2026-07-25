'use client'

import { CategoryCard } from '@/components/tgo-business'
import { useHaptic } from '@/components/tgo/useHaptic'

const CATEGORY_CONFIG: Record<
  string,
  { icon: string; color: string; bg: string }
> = {
  Pizza: { icon: '🍕', color: '#E03A0E', bg: 'rgba(224, 58, 14, 0.08)' },
  Sushi: { icon: '🍣', color: '#D94A3D', bg: 'rgba(217, 74, 61, 0.08)' },
  Hamburguesa: { icon: '🍔', color: '#F4B42D', bg: 'rgba(244, 180, 45, 0.08)' },
  Ensalada: { icon: '🥗', color: '#16A34A', bg: 'rgba(22, 163, 74, 0.08)' },
  Thai: { icon: '🍜', color: '#F74211', bg: 'rgba(247, 66, 17, 0.08)' },
  Mexicana: { icon: '🌮', color: '#E03A0E', bg: 'rgba(224, 58, 14, 0.08)' },
  Italiana: { icon: '🍝', color: '#D94A3D', bg: 'rgba(217, 74, 61, 0.08)' },
  Café: { icon: '☕', color: '#065D63', bg: 'rgba(6, 93, 99, 0.08)' },
  Parrilla: { icon: '🥩', color: '#C2410C', bg: 'rgba(194, 65, 12, 0.08)' },
  Japonesa: { icon: '🍱', color: '#DC2626', bg: 'rgba(220, 38, 38, 0.08)' },
  China: { icon: '🥡', color: '#B91C1C', bg: 'rgba(185, 28, 28, 0.08)' },
  India: { icon: '🍛', color: '#D97706', bg: 'rgba(217, 119, 6, 0.08)' },
  Arabe: { icon: '🧆', color: '#92400E', bg: 'rgba(146, 64, 14, 0.08)' },
  Peruana: { icon: '🥘', color: '#DC2626', bg: 'rgba(220, 38, 38, 0.08)' },
  Vegana: { icon: '🌱', color: '#15803D', bg: 'rgba(21, 128, 61, 0.08)' },
  Postres: { icon: '🍰', color: '#DB2777', bg: 'rgba(219, 39, 119, 0.08)' },
  Cervecería: { icon: '🍺', color: '#CA8A04', bg: 'rgba(202, 138, 4, 0.08)' },
  Bagels: { icon: '🥯', color: '#A16207', bg: 'rgba(161, 98, 7, 0.08)' },
  Empanadas: { icon: '🥟', color: '#C2410C', bg: 'rgba(194, 65, 12, 0.08)' },
  Milanesas: { icon: '🍳', color: '#B45309', bg: 'rgba(180, 83, 9, 0.08)' },
  Mariscos: { icon: '🦐', color: '#0891B2', bg: 'rgba(8, 145, 178, 0.08)' },
  Heladería: { icon: '🍦', color: '#E11D48', bg: 'rgba(225, 29, 72, 0.08)' },
  Pollo: { icon: '🍗', color: '#EA580C', bg: 'rgba(234, 88, 12, 0.08)' },
  Sandwich: { icon: '🥪', color: '#92400E', bg: 'rgba(146, 64, 14, 0.08)' },
  Rostisería: { icon: '🍗', color: '#EA580C', bg: 'rgba(234, 88, 12, 0.08)' },
  Pastelería: { icon: '🥐', color: '#DB2777', bg: 'rgba(219, 39, 119, 0.08)' },
  Saludable: { icon: '🥗', color: '#16A34A', bg: 'rgba(22, 163, 74, 0.08)' },
  Cafetería: { icon: '☕', color: '#065D63', bg: 'rgba(6, 93, 99, 0.08)' },
  Helados: { icon: '🍦', color: '#E11D48', bg: 'rgba(225, 29, 72, 0.08)' },
  'Comida Casera': { icon: '🍲', color: '#92400E', bg: 'rgba(146, 64, 14, 0.08)' },
}

function getCategoryConfig(name: string) {
  const key = Object.keys(CATEGORY_CONFIG).find(
    (k) => k.toLowerCase() === name.toLowerCase()
  )
  return key
    ? CATEGORY_CONFIG[key]
    : { icon: '🍽', color: 'var(--tgo-text-secondary)', bg: 'var(--tgo-surface-2)' }
}

export { CATEGORY_CONFIG, getCategoryConfig }

interface Props {
  categories: string[]
  showAll: boolean
  onToggleShowAll: () => void
  onSelect: (name: string) => void
}

export function CategoriesModule({
  categories,
  showAll,
  onToggleShowAll,
  onSelect,
}: Props) {
  const haptic = useHaptic()
  const visible = showAll ? categories.slice(0, 12) : categories.slice(0, 8)
  const hasMore = categories.length > 8

  return (
    <div>
      <div
        className="grid grid-cols-4 gap-4"
        style={{ paddingInline: 'var(--tgo-page-padding)' }}
      >
        {visible.map((cat) => {
          const config = getCategoryConfig(cat)
          return (
            <CategoryCard
              key={cat}
              name={cat}
              icon={config.icon}
              color={config.color}
              bg={config.bg}
              onClick={() => { haptic.selection(); onSelect(cat) }}
            />
          )
        })}
      </div>
      {hasMore && (
        <button
          onClick={() => { haptic.impact('light'); onToggleShowAll() }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            margin: '16px var(--tgo-page-padding) 0',
            padding: '10px',
            borderRadius: 'var(--tgo-radius-lg)',
            border: '1px dashed var(--tgo-border)',
            background: 'transparent',
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'var(--tgo-state-interactive)',
            cursor: 'pointer',
            width: 'calc(100% - 40px)',
          }}
        >
          {showAll ? 'Ver menos' : 'Ver más categorías'}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: showAll ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s',
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      )}
    </div>
  )
}
