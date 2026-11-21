import mongoose, { Schema } from 'mongoose'

// ============================================================================
// PlacementDailyStat — métricas diarias de piezas de marketing (20/11/2026)
// ============================================================================
// Contadores por día (hora de Argentina), superficie y pieza. Sin eventos
// crudos y SIN datos personales: ni IP, ni user agent, ni sesión, ni teléfono.
// La deduplicación por sesión vive en PlacementSeen (hash con pepper, TTL 48 h).
//
// Superficies: lista abierta. Sumar una = agregar el valor a PLACEMENTS.
// ============================================================================

export const PLACEMENTS = [
  'menu_story',          // círculo «TGO APP» + visor de stories, dentro del menú
  'app_story',           // reservada: stories en la app
  'home_banner',         // reservada: banner del inicio de la app
  'menu_promo_card',     // PromotionCard / PromotionCarousel del menú
  'menu_promo_story',    // círculo «Promociones» + PromotionStories del menú
  'explore_promo_card',  // ExplorePromoCard en Descubrí (/app)
  'screen',              // pantallas del comercio (solo vía /api/display/stats con token del equipo)
] as const
export type Placement = (typeof PLACEMENTS)[number]

/** Superficies con visor de stories (vista, completada, salida). */
export const STORY_PLACEMENTS: readonly Placement[] = ['menu_story', 'app_story', 'menu_promo_story']
/** Superficies que se muestran dentro del menú de un comercio. */
export const MENU_PLACEMENTS: readonly Placement[] = ['menu_story', 'menu_promo_card', 'menu_promo_story']

export const PIECE_KINDS = ['app_story', 'promotion', 'entry'] as const
export type PieceKind = (typeof PIECE_KINDS)[number]

export const TAP_ACTIONS = ['add', 'detail', 'loyalty', 'link', 'card', 'open'] as const
export type TapAction = (typeof TAP_ACTIONS)[number]

export const EXIT_REASONS = ['close', 'skip', 'swipe', 'background'] as const
export type ExitReason = (typeof EXIT_REASONS)[number]

export interface PlacementCounters {
  impressions?: number
  impressionsUnique?: number
  opens?: number
  views?: number
  completes?: number
  ctaTaps?: number
  ctaTapsUnique?: number
  taps?: Partial<Record<TapAction, number>>
  exits?: Partial<Record<ExitReason, number>>
  /** Índice de la pieza donde se salió del visor: { '0': n, '1': n, … } */
  exitsAt?: Record<string, number>
  /** Pantallas: reproducciones completas, milisegundos en pantalla y errores. */
  plays?: number
  playMs?: number
  errors?: number
}

export interface IPlacementDailyStat {
  /** 'YYYY-MM-DD' en hora de Argentina, calculado en el servidor. */
  day: string
  placement: Placement
  kind: PieceKind
  /** null solo para kind 'entry' (el círculo de stories en sí). */
  pieceId: mongoose.Types.ObjectId | null
  /** Comercio donde se mostró (menú) o dueño de la promo (Descubrí); null = plataforma. */
  tenantId: mongoose.Types.ObjectId | null
  locationId: mongoose.Types.ObjectId | null
  c: PlacementCounters
  createdAt: Date
  updatedAt: Date
}

const PlacementDailyStatSchema = new Schema<IPlacementDailyStat>(
  {
    day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    placement: { type: String, required: true, enum: PLACEMENTS },
    kind: { type: String, required: true, enum: PIECE_KINDS },
    pieceId: { type: Schema.Types.ObjectId, default: null },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', default: null },
    c: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, minimize: false }
)

PlacementDailyStatSchema.index(
  { day: 1, placement: 1, kind: 1, pieceId: 1, tenantId: 1, locationId: 1 },
  { unique: true, name: 'placement_day_unique' }
)
PlacementDailyStatSchema.index({ tenantId: 1, day: -1 })
PlacementDailyStatSchema.index({ pieceId: 1, day: -1 })

const PlacementDailyStat =
  (mongoose.models.PlacementDailyStat as mongoose.Model<IPlacementDailyStat>) ||
  mongoose.model<IPlacementDailyStat>('PlacementDailyStat', PlacementDailyStatSchema)
export default PlacementDailyStat
