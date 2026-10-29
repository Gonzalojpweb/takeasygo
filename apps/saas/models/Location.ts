import mongoose, { Schema, Document } from 'mongoose'

export interface ILocation extends Document {
  tenantId: mongoose.Types.ObjectId
  name: string
  slug: string
  /** Prefijo corto para numeración por sede (2-4 chars alfanuméricos mayúsculas).
   *  Único dentro del tenant. Autogenerado del nombre si no se setea. */
  prefix?: string
  address: string
  phone: string
  hours: string
  mapsUrl: string
  googleBusiness?: {
    reviewUrl?: string | null
    placeId?: string | null
    updatedAt?: Date | null
  }
  isActive: boolean
  // ── Red TakeasyGO ──────────────────────────────────────────────────────────
  geo?: {
    type: 'Point'
    coordinates: [number, number] // [longitude, latitude] — GeoJSON estándar
  }
  networkVisible: boolean // true = aparece en el mapa público de consumidores
  // ──────────────────────────────────────────────────────────────────────────
  settings: {
    acceptsOrders: boolean
    orderModes: ('takeaway' | 'dine-in' | 'business' | 'delivery')[]
    estimatedPickupTime: number
    /** Anuncio de demora por modo de pedido (solo UX, no afecta ICO) */
    delayAnnouncement?: {
      takeaway?: { enabled: boolean; extraMinutes: number; message: string; updatedAt: Date | null }
      delivery?: { enabled: boolean; extraMinutes: number; message: string; updatedAt: Date | null }
      'dine-in'?: { enabled: boolean; extraMinutes: number; message: string; updatedAt: Date | null }
      business?: { enabled: boolean; extraMinutes: number; message: string; updatedAt: Date | null }
    }
    /** Historial de ajustes automáticos del tiempo estimado (anti-gaming audit) */
    adjustmentHistory?: Array<{
      previousValue: number
      newValue: number
      reason: string
      icoScore: number | null
      sampleSize: number
      triggeredBy: 'cron' | 'order_completed' | 'admin_request' | 'system_init'
      timestamp: Date
    }>
    /** Override de pago en efectivo por sede (opcional). null = usa Tenant.cash */
    cash?: {
      enabled?: boolean
      /** Descuento por pago en efectivo en %. Si falta, hereda el del tenant. @storedAs percent */
      discountPercent?: number
    } | null
    /** Override de cuenta MP por sede (opcional). ObjectId de mpAccounts[], null = usa tenant default */
    mpAccountId?: string | null
    /** Posnet MercadoPago Point de la caja de la sede (id del dispositivo, modo PDV). Fase 6. */
    mpPointDeviceId?: string | null
    /** WhatsApp de notificaciones admin por sede (opcional). null/vacío = usa Tenant.notifications.whatsappPhone */
    whatsappPhone?: string | null
    /** Cuenta de transferencia por sede (opcional). ObjectId de Tenant.transferAccounts[], null = cuenta activa del tenant */
    transferAccountId?: string | null
    /** Override de notifyOnOrder por sede (opcional). null = hereda el global */
    notifyOnOrder?: boolean | null
    /** Override de notifyOnReservation por sede (opcional). null = hereda el global */
    notifyOnReservation?: boolean | null
    /**
     * Recargo propio por medio de pago en la sede. feePercent null/ausente =
     * hereda Tenant.paymentSurcharges. @storedAs percent
     */
    paymentSurcharges?: {
      mercadopago?: { feePercent?: number | null } | null
      kripton?: { feePercent?: number | null } | null
      transfer?: { feePercent?: number | null } | null
    } | null
    /** Kripton en la sede: null = hereda la visibilidad del tenant; false = deshabilitado en esta sede. */
    kriptonEnabled?: boolean | null
    /** Descuento del club en la sede: null = hereda; false = no aplica en esta sede. */
    clubDiscountEnabled?: boolean | null
  }
  deliveryConfig?: {
    enabled: boolean
    ranges: Array<{ fromKm: number; toKm: number; /** Precio del rango de delivery en centavos. @storedAs cents */ price: number }>
    maxRangeKm: number
  }
  rapiboyConfig?: {
    enabled: boolean
    /** Token de API de Rapiboy, cifrado con AES-256-GCM. @storedAs encrypted */
    apiToken: string
    environment: 'production' | 'uat'
    /** Porcentaje de margen que TakeasyGO cobra sobre la diferencia entre el costo real de Rapiboy y lo que se le cobra al cliente. Dinámico, sin mínimo ni máximo en código. @storedAs percent */
    margen: number
    /** Código fijo de TakeasyGO en la plataforma de Rapiboy */
    codigoPlataforma: string
    /** Secret para validar webhooks de Rapiboy, cifrado con AES-256-GCM. @storedAs encrypted */
    webhookSecret: string
    /** Porcentaje de colchón para pagos por transferencia (ej: 1.5 = 1.5%). Default 1.5. @storedAs percent */
    transferBufferPercentage: number
  }
  reservationConfig: {
    enabled: boolean
    /** Pago mínimo para reservar en centavos. @storedAs cents */
    minPayment: number
    /**
     * Cobrar la seña online (Mercado Pago, en la misma cuenta que los pedidos).
     * false = las reservas no se cobran aunque haya seña cargada. Ausente = true.
     */
    paymentsEnabled?: boolean
    timeSlots: string[]
    /** Ausente o null = sin límite de comensales. */
    maxPartySize?: number | null
    /** Minutos de antelación mínima para reservar. Ausente = DEFAULT_MIN_ADVANCE_MINUTES. */
    minAdvanceMinutes?: number | null
    /** Días hacia adelante que se puede reservar. Ausente o null = sin límite. */
    maxAdvanceDays?: number | null
    /** Minutos después del horario para marcar no-show automático. null = apagado. */
    autoNoShowMinutes?: number | null
    slotConfig?: {
      enabled: boolean
      operatingHours: Array<{ days: number[]; open: string; close: string }>
      slotIntervalMinutes: number
      blockDurationMinutes: number
      maxReservationsPerSlot: number
    }
  }
  /**
   * Espacios/sectores de la sede para el aforo de reservas.
   * Vacío o ausente = sin espacios: manda maxReservationsPerSlot (modo clásico).
   * Con espacios cargados el cliente elige uno al reservar (obligatorio).
   */
  spaces?: Array<{
    /** Nombre libre: Salón, Terraza, Coworking, Interior, Exterior... */
    name: string
    /** Comensales/sillas. Entero >= 1. */
    capacity: number
    enabled: boolean
    /** Días 'YYYY-MM-DD' con el espacio fuera de servicio. */
    blockedDates: string[]
    order: number
  }>
  /**
   * Turnos de caja de la sede (Fase 2, 29/10): los define el admin.
   * Un turno = una caja por día (business/shifts).
   */
  cashShifts?: Array<{ id: string; name: string; start: string; end: string; active: boolean }>
  hero: {
    mediaType: 'none' | 'image' | 'video'
    url: string
    showLogo: boolean
  }
  gallery: string[]
  cuisineTypes: string[]
  timezone: string
  /** Índice de color para identificación visual de sede en el admin (0-7) */
  colorIndex: number
  serviceHours?: {
    takeaway: Array<{ days: number[]; open: string; close: string }>
    dineIn: Array<{ days: number[]; open: string; close: string }>
    delivery: Array<{ days: number[]; open: string; close: string }>
  }
  status: 'active' | 'paused'
  pausedAt: Date | null
  pausedReason: string | null
  /** Estado del POS en esta sede (E gate: gateway por dispositivo POS activo) */
  pos?: {
    /** Última vez que un dispositivo POS de la sede reportó heartbeat */
    lastSeenAt?: Date | null
  }
  /** Agente de impresión (printer-agent) de esta sede */
  printerAgent?: {
    /** SHA-256 del token del agente (token solo se ve al generar/rotar) */
    secretHash?: string | null
    lastSeenAt?: Date | null
    version?: string | null
    tokenPresent?: boolean
  }
  scheduledOrdersConfig?: {
    enabled: boolean
    maxAdvanceHours: number
    minAdvanceMinutes: number
    slotDurationMinutes: number
    maxOrdersPerSlot: number
    gracePeriodMinutes: number
    /** Minutos antes del retiro en que se libera la impresión (T-lead). Default 30. */
    printBeforePickupMinutes?: number
  }
  createdAt: Date
  updatedAt: Date
}

const LocationSchema = new Schema<ILocation>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'El nombre es obligatorio'],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, 'El slug es obligatorio'],
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9-]+$/, 'El slug solo puede contener letras minúsculas, números y guiones'],
    },
    /** Prefijo corto para numeración por sede (2-4 chars alfanuméricos mayúsculas).
     *  Único dentro del tenant. Se usa en orderNumber/reservationNumber
     *  cuando el flag numbering.perLocation está ON.
     *  Si no se setea al crear, se autogenera del nombre. */
    prefix: {
      type: String,
      trim: true,
      uppercase: true,
      match: [/^[A-Z0-9]{2,4}$/, 'El prefijo debe tener 2-4 caracteres alfanuméricos mayúsculas'],
    },
    address: {
      type: String,
      required: [true, 'La dirección es obligatoria'],
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    mapsUrl: {
      type: String,
      trim: true,
      default: '',
    },
    googleBusiness: {
      reviewUrl: { type: String, default: null },
      placeId: { type: String, default: null },
      updatedAt: { type: Date, default: null },
    },
    // ── Red TakeasyGO ────────────────────────────────────────────────────────
    geo: {
      type: {
        type: String,
        enum: ['Point'],
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: undefined,
      },
    },
    networkVisible: {
      type: Boolean,
      default: true,
    },
    // ─────────────────────────────────────────────────────────────────────────
    hours: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
settings: {
        acceptsOrders: { type: Boolean, default: true },
        orderModes: {
          type: [String],
          enum: ['takeaway', 'dine-in', 'business', 'delivery'] as const,
          default: ['takeaway'],
        },
        estimatedPickupTime: { type: Number, default: 20 },
        delayAnnouncement: {
          type: {
            takeaway: {
              type: {
                enabled: { type: Boolean, default: false },
                extraMinutes: { type: Number, default: 0, min: 0 },
                message: { type: String, default: '' },
                updatedAt: { type: Date, default: null },
              },
              default: { enabled: false, extraMinutes: 0, message: '', updatedAt: null },
            },
            delivery: {
              type: {
                enabled: { type: Boolean, default: false },
                extraMinutes: { type: Number, default: 0, min: 0 },
                message: { type: String, default: '' },
                updatedAt: { type: Date, default: null },
              },
              default: { enabled: false, extraMinutes: 0, message: '', updatedAt: null },
            },
            'dine-in': {
              type: {
                enabled: { type: Boolean, default: false },
                extraMinutes: { type: Number, default: 0, min: 0 },
                message: { type: String, default: '' },
                updatedAt: { type: Date, default: null },
              },
              default: { enabled: false, extraMinutes: 0, message: '', updatedAt: null },
            },
            business: {
              type: {
                enabled: { type: Boolean, default: false },
                extraMinutes: { type: Number, default: 0, min: 0 },
                message: { type: String, default: '' },
                updatedAt: { type: Date, default: null },
              },
              default: { enabled: false, extraMinutes: 0, message: '', updatedAt: null },
            },
          },
          default: {},
        },
        adjustmentHistory: {
          type: [{
            previousValue: { type: Number, required: true },
            newValue: { type: Number, required: true },
            reason: { type: String, required: true },
            icoScore: { type: Number, default: null },
            sampleSize: { type: Number, required: true },
            triggeredBy: {
              type: String,
              enum: ['cron', 'order_completed', 'admin_request', 'system_init'],
              required: true
            },
            timestamp: { type: Date, default: Date.now }
          }],
          default: []
        },
        cash: {
          type: {
            enabled: { type: Boolean, default: undefined },
            discountPercent: { type: Number, min: 0, max: 100, default: undefined },
          },
          default: null,
        },
        /** Override de cuenta MP por sede. ObjectId de mpAccounts[], null = usa tenant default */
        mpAccountId: { type: String, default: null },
        /** Posnet MercadoPago Point de la caja (modo PDV). null = cobro manual. Fase 6. */
        mpPointDeviceId: { type: String, default: null, maxlength: 120 },
        /** WhatsApp de notificaciones admin por sede. null/vacío = usa el global del tenant */
        whatsappPhone: { type: String, default: null },
        /** Cuenta de transferencia por sede. ObjectId de Tenant.transferAccounts[], null = cuenta activa del tenant */
        transferAccountId: { type: String, default: null },
        /** Override de notifyOnOrder por sede. null = hereda el global */
        notifyOnOrder: { type: Boolean, default: null },
        /** Override de notifyOnReservation por sede. null = hereda el global */
        notifyOnReservation: { type: Boolean, default: null },
        /** Recargo propio por medio de pago en la sede. null = hereda del tenant. @storedAs percent */
        paymentSurcharges: {
          type: {
            mercadopago: { feePercent: { type: Number, min: 0, max: 100, default: null } },
            kripton: { feePercent: { type: Number, min: 0, max: 100, default: null } },
            transfer: { feePercent: { type: Number, min: 0, max: 100, default: null } },
          },
          default: null,
        },
        /** Kripton en la sede. null = hereda; false = deshabilitado en esta sede */
        kriptonEnabled: { type: Boolean, default: null },
        /** Descuento del club en la sede. null = hereda; false = no aplica en esta sede */
        clubDiscountEnabled: { type: Boolean, default: null },
    },
    reservationConfig: {
      enabled: { type: Boolean, default: false },
      minPayment: { type: Number, default: 0 },
      paymentsEnabled: { type: Boolean, default: true },
      timeSlots: { type: [String], default: [] },
      maxPartySize: { type: Number, default: 10 },
      minAdvanceMinutes: { type: Number, default: 30, min: 0, max: 720 },
      maxAdvanceDays: { type: Number, default: null, min: 1, max: 365 },
      autoNoShowMinutes: { type: Number, default: null, min: 5, max: 240 },
      slotConfig: {
        enabled: { type: Boolean, default: false },
        operatingHours: { type: [{ days: [Number], open: String, close: String }], default: [] },
        slotIntervalMinutes: { type: Number, default: 30 },
        blockDurationMinutes: { type: Number, default: 90 },
        maxReservationsPerSlot: { type: Number, default: 1 },
      },
    },
    spaces: {
      type: [{
        name: { type: String, required: true, trim: true },
        capacity: { type: Number, required: true, min: 1 },
        enabled: { type: Boolean, default: true },
        blockedDates: { type: [String], default: [] },
        order: { type: Number, default: 0 },
      }],
      default: [],
    },
    cashShifts: {
      type: [{
        _id: false,
        id: { type: String, required: true },
        name: { type: String, required: true, trim: true, maxlength: 30 },
        start: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
        end: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
        active: { type: Boolean, default: true },
      }],
      default: [],
    },
    hero: {
      mediaType: { type: String, enum: ['none', 'image', 'video'], default: 'none' },
      url: { type: String, default: '' },
      showLogo: { type: Boolean, default: true },
    },
    gallery: { type: [String], default: [], validate: { validator: (v: string[]) => v.length <= 8, message: 'Gallery max 8 images' } },
    cuisineTypes: { type: [String], default: [] },
    timezone: { type: String, required: true, default: 'America/Argentina/Buenos_Aires' },
    colorIndex: { type: Number, default: 0, min: 0, max: 7 },
    serviceHours: {
      takeaway: { type: [{ days: [Number], open: String, close: String }], default: [] },
      dineIn: { type: [{ days: [Number], open: String, close: String }], default: [] },
      delivery: { type: [{ days: [Number], open: String, close: String }], default: [] },
    },
    status: { type: String, enum: ['active', 'paused'], default: 'active' },
    pausedAt: { type: Date, default: null },
    pausedReason: { type: String, default: null },
    pos: {
      lastSeenAt: { type: Date, default: null },
    },
    printerAgent: {
      type: {
        secretHash:   { type: String, default: null },
        lastSeenAt:   { type: Date, default: null },
        version:      { type: String, default: null },
        tokenPresent: { type: Boolean, default: false },
      },
      default: { secretHash: null, lastSeenAt: null, version: null, tokenPresent: false },
    },
    scheduledOrdersConfig: {
      enabled: { type: Boolean, default: false },
      maxAdvanceHours: { type: Number, default: 24 },
      minAdvanceMinutes: { type: Number, default: 30 },
      slotDurationMinutes: { type: Number, default: 15 },
      maxOrdersPerSlot: { type: Number, default: 10 },
      gracePeriodMinutes: { type: Number, default: 15 },
      printBeforePickupMinutes: { type: Number, default: 30 },
    },
    deliveryConfig: {
      type: {
        enabled: { type: Boolean, default: false },
        ranges: {
          type: [{
            fromKm: { type: Number, required: true, min: 0 },
            toKm:   { type: Number, required: true, min: 0 },
            price:  { type: Number, required: true, min: 0 },
          }],
          default: [],
        },
        maxRangeKm: { type: Number, default: 0 },
      },
      default: { enabled: false, ranges: [], maxRangeKm: 0 },
    },
    rapiboyConfig: {
      type: {
        enabled:          { type: Boolean, default: false },
        apiToken:         { type: String, default: '' },
        environment:      { type: String, enum: ['production', 'uat'], default: 'uat' },
        margen:           { type: Number, default: 0 },
        codigoPlataforma: { type: String, default: '' },
        webhookSecret:    { type: String, default: '' },
        transferBufferPercentage: { type: Number, default: 1.5 },
      },
      default: { enabled: false, apiToken: '', environment: 'uat', margen: 0, codigoPlataforma: '', webhookSecret: '', transferBufferPercentage: 1.5 },
    },
  },
  {
    timestamps: true,
  }
)

// El slug debe ser único dentro del mismo tenant
LocationSchema.index({ tenantId: 1, slug: 1 }, { unique: true })

// El prefijo de numeración debe ser único dentro del mismo tenant
LocationSchema.index(
  { tenantId: 1, prefix: 1 },
  { unique: true, partialFilterExpression: { prefix: { $type: 'string' } } }
)

// Índice geoespacial para consultas de proximidad (sparse: solo indexa docs con geo)
LocationSchema.index({ geo: '2dsphere' }, { sparse: true })

// In development, always recreate to pick up schema changes across hot-reloads
if (process.env.NODE_ENV !== 'production') {
  delete (mongoose.models as any).Location
}

const Location = mongoose.models.Location as mongoose.Model<ILocation> || mongoose.model<ILocation>('Location', LocationSchema)
export default Location
