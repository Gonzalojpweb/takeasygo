// ── TGO Primitive Library ─────────────────────────────────────────────────────
//
// Ladrillos base del Design System.
// Cada componente consume --tgo-* tokens.
// No son componentes de negocio — son las piezas atómicas.
//
// shadcn cubre: Button, Input, Badge, Avatar, Card, Dialog, Sheet, Skeleton, etc.
// TGO agrega: Chip, EmptyState, HorizontalScroller, Section, SearchBar, MapPin
//
// Para componentes de negocio (RestaurantCard, ExperienceCard, etc.)
// van en components/explore/tgo-business/

export { Chip, chipVariants } from './Chip'
export type { ChipProps } from './Chip'

export { default as EmptyState } from './EmptyState'

export { default as HorizontalScroller } from './HorizontalScroller'

export { default as Section } from './Section'

export { default as SearchBar } from './SearchBar'

export { default as MapPin } from './MapPin'
