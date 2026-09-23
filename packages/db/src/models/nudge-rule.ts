import mongoose, { Schema, type Document } from "mongoose"

export interface INudgeCondition {
  checkType:
    | "field_missing"
    | "field_empty"
    | "no_activity_days"
    | "day_of_week_hour"
    | "feature_unused"
    | "feature_not_configured"
  targetField?: string
  thresholdDays?: number
  dayOfWeek?: number
  hourOfDay?: number
  featureKey?: string
}

export interface INudgeContent {
  title: string
  description: string
  icon: string
  ctaLabel?: string
  ctaHref?: string
}

export type NudgeChannel = "banner" | "sidebar_badge" | "feed"
export type NudgeFrequency = "once" | "daily" | "weekly" | "cooldown_days"

export interface INudgeRuleDocument extends Document {
  tenantId: mongoose.Types.ObjectId | null
  slug: string
  type: string
  condition: INudgeCondition
  content: INudgeContent
  channel: NudgeChannel
  frequency: NudgeFrequency
  frequencyValue?: number
  lastTriggeredAt: Date | null
  active: boolean
  /** Si es true, se evalúa en nudge-time-sensitive, no en nudge-evaluate */
  timeSensitive: boolean
  planRequired?: string
  createdAt: Date
  updatedAt: Date
}

const NudgeConditionSchema = new Schema<INudgeCondition>(
  {
    checkType: {
      type: String,
      required: true,
      enum: [
        "field_missing",
        "field_empty",
        "no_activity_days",
        "day_of_week_hour",
        "feature_unused",
        "feature_not_configured",
      ],
    },
    targetField: { type: String },
    thresholdDays: { type: Number },
    dayOfWeek: { type: Number, min: 0, max: 6 },
    hourOfDay: { type: Number, min: 0, max: 23 },
    featureKey: { type: String },
  },
  { _id: false }
)

const NudgeContentSchema = new Schema<INudgeContent>(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    icon: { type: String, required: true },
    ctaLabel: { type: String },
    ctaHref: { type: String },
  },
  { _id: false }
)

export const NudgeRuleSchema = new Schema<INudgeRuleDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
    },
    slug: { type: String, required: true },
    type: { type: String, required: true },
    condition: { type: NudgeConditionSchema, required: true },
    content: { type: NudgeContentSchema, required: true },
    channel: {
      type: String,
      required: true,
      enum: ["banner", "sidebar_badge", "feed"],
      default: "feed",
    },
    frequency: {
      type: String,
      required: true,
      enum: ["once", "daily", "weekly", "cooldown_days"],
      default: "once",
    },
    frequencyValue: { type: Number },
    lastTriggeredAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
    timeSensitive: { type: Boolean, default: false },
    planRequired: { type: String },
  },
  { timestamps: true }
)

NudgeRuleSchema.index({ tenantId: 1, active: 1 })
NudgeRuleSchema.index({ tenantId: 1, slug: 1 }, { unique: true, sparse: true })
NudgeRuleSchema.index({ active: 1, timeSensitive: 1 })

export const NudgeRuleModel = mongoose.model<INudgeRuleDocument>(
  "NudgeRule",
  NudgeRuleSchema,
  "nudge_rules"
)

/** Nudges globales de plataforma (tenantId = null) */
export const DEFAULT_NUDGE_RULES: Array<{
  slug: string
  type: string
  condition: INudgeCondition
  content: INudgeContent
  channel: NudgeChannel
  frequency: NudgeFrequency
  frequencyValue?: number
  timeSensitive: boolean
}> = [
  {
    slug: "service-hours-missing",
    type: "config_incomplete",
    condition: { checkType: "field_missing", targetField: "serviceHours" },
    content: {
      title: "Cargá tus horarios de atención",
      description: "Sin horarios configurados, tu sede no puede recibir pedidos fuera del horario habitual.",
      icon: "Clock",
      ctaLabel: "Configurar horarios",
      ctaHref: "/admin/settings",
    },
    channel: "feed",
    frequency: "cooldown_days",
    frequencyValue: 7,
    timeSensitive: false,
  },
  {
    slug: "bank-data-stale",
    type: "bank_data",
    condition: { checkType: "no_activity_days", targetField: "transferAccounts", thresholdDays: 30 },
    content: {
      title: "Actualizá tus datos bancarios",
      description: "Los datos de transferencia no se actualizaron en los últimos 30 días. Verificalos para evitar problemas con los cobros.",
      icon: "Building2",
      ctaLabel: "Revisar datos",
      ctaHref: "/admin/settings",
    },
    channel: "feed",
    frequency: "weekly",
    timeSensitive: false,
  },
  {
    slug: "recommended-dishes-unused",
    type: "menu_rotation",
    condition: { checkType: "feature_not_configured", featureKey: "recommendedDishes" },
    content: {
      title: "Activá los platos recomendados",
      description: "Los platos recomendados aumentan la rotación y las ventas. Configuralos para que tus clientes descubran tus mejores opciones.",
      icon: "UtensilsCrossed",
      ctaLabel: "Configurar platos",
      ctaHref: "/admin/menu",
    },
    channel: "feed",
    frequency: "cooldown_days",
    frequencyValue: 14,
    timeSensitive: false,
  },
  {
    slug: "weekend-briefing",
    type: "weekend_briefing",
    condition: { checkType: "day_of_week_hour", dayOfWeek: 5, hourOfDay: 8 },
    content: {
      title: "Briefing del fin de semana",
      description: "Revisá: horarios ok, platos destacados actualizados, stock revisado. Todo listo para el fin de semana.",
      icon: "ClipboardCheck",
      ctaLabel: "Ir al menú",
      ctaHref: "/admin/menu",
    },
    channel: "banner",
    frequency: "weekly",
    timeSensitive: true,
  },
  {
    slug: "club-inactive",
    type: "club_reminder",
    condition: { checkType: "feature_unused", featureKey: "club", thresholdDays: 14 },
    content: {
      title: "Tu Club está inactivo",
      description: "Hace más de 14 días que no enviaste una campaña por el Club. Reactivalo para fidelizar a tus clientes.",
      icon: "Users",
      ctaLabel: "Ir al Club",
      ctaHref: "/admin/club",
    },
    channel: "feed",
    frequency: "weekly",
    timeSensitive: false,
  },
  {
    slug: "hidden-rewards-not-configured",
    type: "hidden_rewards",
    condition: { checkType: "feature_not_configured", featureKey: "hiddenRewards" },
    content: {
      title: "Configurá las Recompensas Escondidas",
      description: "Las Recompensas Escondidas sorprenden a tus clientes con descuentos surprise. Activalas para aumentar la adherencia.",
      icon: "Gift",
      ctaLabel: "Configurar",
      ctaHref: "/admin/hidden-rewards",
    },
    channel: "feed",
    frequency: "once",
    timeSensitive: false,
  },
]
