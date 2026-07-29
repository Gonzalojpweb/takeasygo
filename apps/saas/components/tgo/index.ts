// ── TGO Primitive Library ─────────────────────────────────────────────────────
//
// Ladrillos base del Design System.
// Cada componente consume --tgo-* tokens.
// No son componentes de negocio — son las piezas atómicas.
//
// shadcn cubre: Button, Input, Badge, Avatar, Card, Dialog, Sheet, Skeleton, etc.
// TGO agrega: Chip, EmptyState, HorizontalScroller, Section, SearchBar,
//             SmartGreeting, AnimatedNumber, LiveCityMetrics, DiscoveryContinuo,
//             PageTransition
//
// Para componentes de negocio (RestaurantCard, ExperienceCard, etc.)
// van en components/explore/tgo-business/
export { Chip } from './Chip'

export type { ChipProps } from './Chip'

export { SolidIconPill } from './SolidIconPill'

export type { SolidIconPillProps } from './SolidIconPill'

export { default as EmptyState } from './EmptyState'

export { default as HorizontalScroller } from './HorizontalScroller'

export { default as Section } from './Section'

export { default as SearchBar } from './SearchBar'

export { default as SmartGreeting } from './SmartGreeting'

export { default as AnimatedNumber } from './AnimatedNumber'

export { default as LiveCityMetrics } from './LiveCityMetrics'

export { useCityState } from './useCityState'
export type { CityMetrics, CityState } from './useCityState'

export { default as DiscoveryContinuo } from './DiscoveryContinuo'

export { default as PageTransition } from './PageTransition'
