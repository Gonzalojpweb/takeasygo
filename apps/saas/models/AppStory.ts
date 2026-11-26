import mongoose, { Schema, Document } from 'mongoose'

export type AppStoryType = 'feature' | 'tutorial' | 'promotion' | 'announcement'

// CP2 (20/11/2026): dueño y superficies. Valores por defecto y SIN migración:
// las stories viejas no tienen estos campos y cuentan como plataforma +
// menu_story (ver lib/app-story-owner.ts → effectiveOwner/effectiveSurfaces).
// 21/11/2026: 'screen' = pantallas del comercio (solo contenido propio; nunca story del menú).
export type AppStorySurface = 'menu_story' | 'app_story' | 'home_banner' | 'screen'
/** Plantillas de pantalla (lib/display/templates). Lista abierta: se suman por entrega. */
export type ScreenTemplateKind = 'menu' | 'promos' | 'featured' | 'composition' | 'studio' | 'sequence'

export interface AppStoryOwner {
  kind: 'platform' | 'tenant'
  tenantId: mongoose.Types.ObjectId | null
  locationId: mongoose.Types.ObjectId | null
}

export interface IAppStory {
  title: string
  description: string
  shortDescription?: string
  imageUrl?: string
  videoUrl?: string
  /** CP3: portada del video y duración real (ms, tope 15 s). */
  videoPosterUrl?: string
  videoDurationMs?: number | null
  type: AppStoryType
  ctaText?: string
  ctaLink?: string
  isActive: boolean
  sortOrder: number
  scheduledStart?: Date
  scheduledEnd?: Date
  customStyles?: {
    backgroundColor?: string
    textColor?: string
    accentColor?: string
  }
  owner?: AppStoryOwner
  surfaces?: AppStorySurface[]
  /** Pantallas: tiempo en pantalla de una imagen (ms, 5–60 s). */
  displayDurationMs?: number | null
  /** Pantallas: franja horaria (días 0–6 y «HH:MM»; from > to cruza la medianoche). */
  daypart?: { days?: number[]; from?: string | null; to?: string | null } | null
  /** Pantallas: datos del archivo verificado (orientación, peso, variante 720p). */
  media?: { publicId?: string; width?: number; height?: number; bytes?: number; orientation?: 'landscape' | 'portrait' } | null
  /**
   * Pantallas (22/11/2026): pieza AUTOMÁTICA armada con los datos del comercio
   * (carta, promos, club…). Sin archivo: el contenido se resuelve al armar el
   * manifiesto (lib/display/templates). null = pieza subida (imagen o video).
   */
  screenTemplate?: { kind: ScreenTemplateKind; config: Record<string, unknown> } | null
  /** Pantallas: solo para estos grupos de pantallas (vacío o ausente = todas). */
  screenGroups?: string[]
  createdAt: Date
  updatedAt: Date
}

const AppStorySchema = new Schema<IAppStory>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    shortDescription: {
      type: String,
      default: '',
      trim: true,
    },
    imageUrl: {
      type: String,
      default: '',
    },
    videoUrl: {
      type: String,
      default: '',
    },
    videoPosterUrl: { type: String, default: '' },
    // Historias: 15 s (lo topean sus rutas). Pantallas: hasta 60 s. El esquema admite el mayor de los dos.
    videoDurationMs: { type: Number, default: null, min: 0, max: 60_000 },
    type: {
      type: String,
      enum: ['feature', 'tutorial', 'promotion', 'announcement'],
      default: 'feature',
    },
    ctaText: {
      type: String,
      default: '',
    },
    ctaLink: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    scheduledStart: {
      type: Date,
      default: null,
    },
    scheduledEnd: {
      type: Date,
      default: null,
    },
    customStyles: {
      backgroundColor: { type: String, default: '' },
      textColor: { type: String, default: '' },
      accentColor: { type: String, default: '' },
    },
    owner: {
      kind: { type: String, enum: ['platform', 'tenant'], default: 'platform' },
      tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null },
      locationId: { type: Schema.Types.ObjectId, ref: 'Location', default: null },
    },
    // Lista abierta: sumar una superficie = agregar el valor acá y en lib/app-story-owner.ts.
    surfaces: {
      type: [{ type: String, enum: ['menu_story', 'app_story', 'home_banner', 'screen'] }],
      default: ['menu_story'],
    },
    displayDurationMs: { type: Number, default: null, min: 5_000, max: 60_000 },
    daypart: {
      type: new Schema({
        days: { type: [Number], default: undefined, validate: { validator: (v: number[]) => v.every((d) => Number.isInteger(d) && d >= 0 && d <= 6), message: 'Días inválidos' } },
        from: { type: String, default: null, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
        to: { type: String, default: null, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
      }, { _id: false }),
      default: null,
    },
    media: {
      type: new Schema({
        publicId: { type: String, maxlength: 200 },
        width: { type: Number, min: 0 },
        height: { type: Number, min: 0 },
        bytes: { type: Number, min: 0 },
        orientation: { type: String, enum: ['landscape', 'portrait'] },
      }, { _id: false }),
      default: null,
    },
    screenGroups: { type: [{ type: String, trim: true, maxlength: 30 }], default: undefined },
    screenTemplate: {
      type: new Schema({
        kind: { type: String, enum: ['menu', 'promos', 'featured', 'composition', 'studio', 'sequence'], required: true },
        config: { type: Schema.Types.Mixed, default: {} },
      }, { _id: false }),
      default: null,
    },
  },
  {
    timestamps: true,
  }
)

AppStorySchema.index({ isActive: 1, sortOrder: 1 })
AppStorySchema.index({ 'owner.tenantId': 1, isActive: 1 }, { partialFilterExpression: { 'owner.kind': 'tenant' } })

if (process.env.NODE_ENV !== 'production') {
  delete (mongoose.models as any).AppStory
}

const AppStory = mongoose.models.AppStory || mongoose.model<IAppStory>('AppStory', AppStorySchema)
export default AppStory
