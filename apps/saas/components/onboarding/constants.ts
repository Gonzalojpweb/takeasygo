// ── Onboarding Constants ─────────────────────────────────────────────
// Barrios de CABA, categorías de comida y experiencias para el onboarding TGO v2

// ── Barrios CABA (Capital Federal) ──────────────────────────────────
export const BARRIOS_CABA = [
  'Puerto Madero',
  'Retiro',
  'San Nicolás',
  'San Telmo',
  'Montserrat',
  'Constitución',
  'Barracas',
  'La Boca',
  'San Cristóbal',
  'Balvanera',
  'Once',
  'Villa Crespo',
  'Chacarita',
  'Palermo',
  'Recoleta',
  'Belgrano',
  'Núñez',
  'Villa Urquiza',
  'Villa Pueyrredón',
  'Caballito',
  'Villa Luro',
  'Vélez Sársfield',
  'Flores',
  'Floresta',
  'Villa Luro',
  'Liniers',
  'Mataderos',
  'Parque Avellaneda',
  'Floresta',
  'Villa Santa Rita',
  'Coghlan',
  'Saavedra',
  'Villa del Parque',
  'Villa Devoto',
  'Villa General Mitre',
  'Villa Lugano',
  'Villa Riachuelo',
  'Villa Soldati',
  'Villa Esperanza',
] as const

export type BarrioCABA = (typeof BARRIOS_CABA)[number]

// ── Categorías de comida ────────────────────────────────────────────
export interface CuisineOption {
  id: string
  label: string
  emoji: string
}

export const CUISINE_OPTIONS: CuisineOption[] = [
  { id: 'hamburguesas', label: 'Hamburguesas', emoji: '🍔' },
  { id: 'pizza', label: 'Pizza', emoji: '🍕' },
  { id: 'parrillas', label: 'Parrillas', emoji: '🥩' },
  { id: 'sushi', label: 'Sushi', emoji: '🍣' },
  { id: 'saludable', label: 'Saludable', emoji: '🥗' },
  { id: 'cafeterias', label: 'Cafeterías', emoji: '☕' },
  { id: 'helados', label: 'Helados', emoji: '🍦' },
  { id: 'empanadas', label: 'Empanadas', emoji: '🥟' },
  { id: 'pasteleria', label: 'Pastelería', emoji: '🥐' },
  { id: 'mexicana', label: 'Comida mexicana', emoji: '🌮' },
  { id: 'china', label: 'Comida china', emoji: '🍜' },
  { id: 'rostiseria', label: 'Rosticería', emoji: '🍗' },
  { id: 'italiana', label: 'Italiana', emoji: '🍝' },
  { id: 'india', label: 'India', emoji: '🥘' },
  { id: 'otras', label: 'Otras', emoji: '✨' },
]

// ── Experiencias ────────────────────────────────────────────────────
export interface ExperienceOption {
  id: string
  label: string
}

export const EXPERIENCE_OPTIONS: ExperienceOption[] = [
  { id: 'desayunar', label: 'Desayunar' },
  { id: 'brunch', label: 'Brunch' },
  { id: 'cafe', label: 'Café' },
  { id: 'almorzar', label: 'Almorzar' },
  { id: 'cenar', label: 'Cenar' },
  { id: 'salidas_nocturnas', label: 'Salidas nocturnas' },
  { id: 'take_away', label: 'Take Away' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'promociones', label: 'Promociones' },
  { id: 'lugares_tranquilos', label: 'Lugares tranquilos' },
  { id: 'lugares_nuevos', label: 'Lugares nuevos' },
  { id: 'restaurantes_premium', label: 'Restaurantes premium' },
  { id: 'clubes_beneficios', label: 'Clubes de beneficios' },
]

// ── Onboarding Steps ────────────────────────────────────────────────
export type OnboardingStep =
  | 'welcome'
  | 'conocerte'
  | 'auth'
  | 'greeting'
  | 'notifications'
  | 'manifest'

// ── Conocerte sub-steps ─────────────────────────────────────────────
export type ConocerteStep = 'name' | 'age' | 'zone' | 'cuisine' | 'experience' | 'privacy'

// ── Onboarding Data (accumulated across steps) ──────────────────────
export interface OnboardingData {
  name: string
  age: number | null
  zone: string
  cuisinePreferences: string[]
  experiencePreferences: string[]
}

export const INITIAL_ONBOARDING_DATA: OnboardingData = {
  name: '',
  age: null,
  zone: '',
  cuisinePreferences: [],
  experiencePreferences: [],
}
