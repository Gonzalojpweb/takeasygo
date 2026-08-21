import mongoose, { Schema, Document, Types } from 'mongoose'

export interface IBusinessConfig {
  enabled: boolean
  activatedAt: Date | null
  activatedBy: Types.ObjectId | null
}

export interface ITransferConfig {
  enabled: boolean
  alias: string | null
  cbu: string | null
  cvu: string | null
  bankName: string | null
  holderName: string | null
  /** Comisión de plataforma por transferencia (null = usar global) */
  commissionPercent?: number | null
}

export interface IPaymentSurcharge {
  /** Porcentaje de recargo (ej: 10 = 10%). Not a cents value. */
  feePercent: number
}

export interface IPaymentMethodsVisibility {
  mercadopago: boolean
  kripton: boolean
  transfer: boolean
}

export interface ITenant extends Document {
  name: string
  slug: string
  plan: 'trial' | 'try' | 'buy' | 'full' | 'anfitrion'
  status: 'active' | 'paused' | 'deleted'
  isActive: boolean  // Computed: status === 'active' || status === 'paused'
  isOperational: boolean // Si el local ya está aceptando pedidos o está en modo catálogo
  /** true = aparece en explore sin importar distancia del usuario */
  alwaysVisible: boolean
  pausedAt?: Date | null
  pausedReason?: string
  subscription: {
    preapprovalId: string | null
    status: 'authorized' | 'pending' | 'cancelled' | 'paused' | null
    plan: 'try' | 'buy' | 'full' | null
    nextBillingDate: Date | null
    lastUpdated: Date | null
  }
  // ── Transferencia bancaria ──────────────────────────────────────
  transfer: ITransferConfig
  // ── Recargos por método de pago ────────────────────────────────
  paymentSurcharges: {
    mercadopago: IPaymentSurcharge
    kripton: IPaymentSurcharge
    transfer: IPaymentSurcharge
  }
  // ── Visibilidad de métodos de pago ────────────────────────────
  paymentMethodsVisibility: IPaymentMethodsVisibility
  branding: {
    primaryColor: string
    secondaryColor: string
    backgroundColor: string
    textColor: string
    logoUrl: string
    fontFamily: string
    borderRadius: 'sharp' | 'rounded' | 'pill'
    menuLayout: 'grid' | 'list'
    menuLayoutApplyTo: 'both' | 'takeaway' | 'dine-in'
    darkMode: boolean
    fonts: {
      heading: { source: string; family: string; weight?: string; files?: { woff2?: string; woff?: string; ttf?: string }; adobeFamily?: string }
      body: { source: string; family: string; weight?: string; files?: { woff2?: string; woff?: string; ttf?: string }; adobeFamily?: string }
      display: { source: string; family: string; weight?: string; files?: { woff2?: string; woff?: string; ttf?: string }; adobeFamily?: string }
      tag: { source: string; family: string; weight?: string; files?: { woff2?: string; woff?: string; ttf?: string }; adobeFamily?: string }
    }
    bestSellers?: {
      showSection?: boolean
      sectionTitle?: string
      sectionSubtitle?: string
      accentColor?: string
      cardBgColor?: string
      badgeBgColor?: string
    }
  }
  profile: {
    menuDescription: string
    about: string
    social: {
      instagram: string
      facebook: string
      twitter: string
    }
    branding: {
      behance: string
    }
  }
  features: {
    reservations: boolean
    crm: { enabled: boolean }
    tgoGrowthPushEnabled: boolean
  }
  business: {
    enabled: boolean
    activatedAt: Date | null
    activatedBy: Types.ObjectId | null
  }
  loyalty: {
    enabled:        boolean
    clubName:       string   // nombre del club (por defecto 'Club [nombre restaurante]')
    welcomeMessage: string   // mensaje de bienvenida editable
    /** Per-location club: cuando es true, cada sede tiene su propio club, puntos y config independiente */
    perLocation:    boolean
    createdAt:      Date | null
    /** Límite SOS configurable por el admin (perilla deslizadora). 0 = desactivado */
    sosLimit:       number
    /** Límite máximo SOS fijado por el superadmin por-tenant. El admin no puede superarlo. */
    sosMaxLimit:    number
  }
  /** Configuración de Wallet Digital (Google & Apple) */
  wallet: {
    enabled: boolean
    /** Colores de la tarjeta digital */
    cardColor: string       // Color de fondo de la tarjeta (hex)
    labelColor: string      // Color de texto/labels (hex)
    logoUrl: string         // Logo del restaurante en la tarjeta
    heroImageUrl: string    // Imagen hero de la tarjeta
    /** Configuración Apple Wallet (opcional, para tenants premium) */
    applePassTypeIdentifier?: string  // pass.com.tenantname.loyalty
    appleTeamIdentifier?: string      // Team ID de Apple Developer
    /** Configuración Google Wallet */
    googleIssuerId?: string             // Issuer ID de Google Cloud
    /** Geofencing */
    geofenceRadius?: number     // Radio en metros para notificaciones de proximidad
    geofenceMessage?: string    // Mensaje personalizado de proximidad
  }
  mercadopago: {
    accessToken: string | null
    publicKey: string | null
    webhookSecret: string | null
    isConfigured: boolean
  }
  /** OAuth credentials for Marketplace Split Payments (marketplace_fee) */
  mpOAuth: {
    accessToken: string | null     // OAuth access_token (encrypted AES-256-GCM)
    refreshToken: string | null    // OAuth refresh_token (encrypted)
    expiresAt: Date | null         // When the access token expires
    authorizedAt: Date | null      // When the tenant authorized
    isConnected: boolean
    /** Per-tenant commission override (null = use global platformFeePercent) */
    commissionPercent?: number | null
  }
  // ── Integración Kripton ─────────────────────────────────────────────────
  kripton: {
    apiKey: string | null          // Token de API (cifrado AES-256-GCM)
    isConfigured: boolean          // Si el tenant configuró Kripton
    cryptoNetworkId: number | null // Red crypto por defecto (para Payments, no Payment Links)
    usePaymentLinks: boolean       // true = Payment Links (default)
  }
  // ── Integración POS (FUDO / BISTROSOFT / etc.) ─────────────────────────────
  posIntegration: {
    provider: 'fudo' | 'bistrosoft' | 'none'
    enabled: boolean
    credentials: {
      clientId: string | null      // Cifrado AES-256-GCM
      clientSecret: string | null  // Cifrado AES-256-GCM
      apiEndpoint: string | null   // URL base override (opcional)
    }
    productMapping: {
      takeasyGoItemId: string       // ObjectId del item en TakeasyGO (opcional si es promoción)
      promotionId: string           // ObjectId de la promoción (alternativa a takeasyGoItemId)
      posItemId: string             // ID del item en el POS
      posItemName: string           // Nombre legible del item en el POS
    }[]
    lastSyncAt: Date | null         // Última vez que se sincronizó el catálogo del POS
    webhookSecret: string | null    // Para verificar firma de webhooks entrantes del POS. Cifrado.
  }
  // ── API Keys externas (estilo Stripe) ──────────────────────────────────────
  // Permite que un POS, PWA o sistema externo se autentique sin cookies
  externalApiKeys: {
    keyHash: string       // SHA-256 del key real — nunca guardamos el key en claro
    label: string         // "POS App", "PWA Cocina", etc.
    createdAt: Date
    lastUsedAt: Date | null
    isActive: boolean
  }[]
  cachedScores: {
    icoScore: number | null
    capacityScore: number | null
    updatedAt: Date | null
  }
    /** Promoción de takeaway para primer scan QR */
    qrPromo: {
      isEnabled: boolean
      type: 'discount' | 'info' | 'loyalty'
      discountPercentage: number // 0-100
      frequency: 'once' | 'every_visit' | 'daily'
      title: string
      subtitle: string
      buttonText: string
      termsText: string
      imageUrl?: string
      /** Textos personalizables del banner (editables solo por superadmin) */
      badgeLabel: string       // "SOLO POR HOY"
      offLabel: string         // "OFF"
      takeawayWarningTitle: string  // "DESCUENTO EXCLUSIVO PARA TAKEAWAY"
      takeawayWarningText: string   // "No aplicable para consumir en el local"
      loadingText: string      // "Procesando..."
      checkoutDiscountLabel: string // "Descuento QR"
    }
  /** Configuración de sistema de puntos para club de fidelización */
  pointsConfig: {
    enabled: boolean
    mode: 'fixed_per_currency' | 'percentage' | 'hybrid' // fijo por moneda, % del monto, o ambos
    pointsPerCurrency: number // puntos por cada $1 gastado (ej: 0.1 = 1 punto cada $10)
    pointsPercentage: number // % del monto que se convierte en puntos (ej: 10 = 10%)
    pointsPerOrder: number // puntos fijos por pedido (opcional)
    /** Monto mínimo para acumular puntos en centavos. @storedAs cents */
    minOrderForPoints: number // monto mínimo para acumular puntos
    /** Valor en centavos de cada 1 punto al canjear. @storedAs cents */
    pointsRedemptionValue: number // valor en pesos de cada 1 punto
    redemptionEnabled: boolean
    /** Puntos de bienvenida al registrarse en el club (standalone) */
    welcomePoints: number
  }
  /** Configuración de Store (tienda de canje de puntos) */
  store: {
    enabled: boolean
    title: string  // "Tienda de Recompensas"
    description: string
    heroImageUrl?: string
    allowOnlineRedemption: boolean  // Si requiere presencial o puede ser online
    redemptionExpiryHours?: number  // Horas para expirar código de canje
    /** Permitir canje de ítems de la tienda durante el checkout */
    enableCheckoutRedemption: boolean
    /** Ubicación asociada a la config de store (null = todas) */
    locationId?: string | null
  }
  notifications: {
    whatsappPhone: string | null
    notifyOnOrder: boolean
    notifyOnReservation: boolean
    cis?: {
      notifyAtRisk: boolean
      notifyDormant: boolean
      notifyNewVip: boolean
      notifyFrequencyDrop: boolean
      notifyRecovered: boolean
      emailEnabled: boolean
      pushEnabled: boolean
    }
  }
  /** Labels personalizables por tenant para los badges de tipo de promoción (solo superadmin) */
  promotionLabels: {
    sale: string
    info: string
    announcement: string
    loyalty: string
  }
  /** Mensajes personalizables del modal de registro al Club (solo superadmin) */
  loyaltyMessaging: {
    modalSubtitle: string
    successTitle: string
    successMessage: string
    welcomePointsMsg: string
  }
  createdAt: Date
  updatedAt: Date
  specialDates: {
    id: string
    name: string
    date: { month: number; day: number }
    triggerItems: string[]
    suggestedItems: string[]
  }[]
}

const TenantSchema = new Schema<ITenant>(
  {
    name: {
      type: String,
      required: [true, 'El nombre es obligatorio'],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, 'El slug es obligatorio'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9-]+$/, 'El slug solo puede contener letras minúsculas, números y guiones'],
    },
    plan: {
      type: String,
      enum: ['trial', 'try', 'buy', 'full', 'anfitrion'],
      default: 'trial',
    },
    status: {
      type: String,
      enum: ['active', 'paused', 'deleted'],
      default: 'active',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isOperational: {
      type: Boolean,
      default: true,
    },
    alwaysVisible: {
      type: Boolean,
      default: false,
    },
    pausedAt: {
      type: Date,
      default: null,
    },
    pausedReason: {
      type: String,
      default: '',
    },
    subscription: {
      preapprovalId: { type: String, default: null },
      status: {
        type: String,
        enum: ['authorized', 'pending', 'cancelled', 'paused', null],
        default: null,
      },
      plan: {
        type: String,
        enum: ['try', 'buy', 'full', null],
        default: null,
      },
      nextBillingDate: { type: Date, default: null },
      lastUpdated: { type: Date, default: null },
    },
    branding: {
      primaryColor: { type: String, default: '' },
      secondaryColor: { type: String, default: '' },
      backgroundColor: { type: String, default: '' },
      textColor: { type: String, default: '' },
      logoUrl: { type: String, default: '' },
      fontFamily: { type: String, default: 'Inter' },
      borderRadius: {
        type: String,
        enum: ['sharp', 'rounded', 'pill'],
        default: 'rounded',
      },
      menuLayout: {
        type: String,
        enum: ['grid', 'list'],
        default: 'grid',
      },
      menuLayoutApplyTo: {
        type: String,
        enum: ['both', 'takeaway', 'dine-in'],
        default: 'takeaway',
      },
      darkMode: { type: Boolean, default: false },
      fonts: {
        type: {
          heading: {
            source: { type: String, enum: ['google', 'adobe', 'custom'], default: 'google' },
            family: { type: String, default: 'Inter' },
            weight: { type: String, default: '' },
            files: {
              woff2: { type: String, default: '' },
              woff: { type: String, default: '' },
              ttf: { type: String, default: '' },
            },
            adobeFamily: { type: String, default: '' },
          },
          body: {
            source: { type: String, enum: ['google', 'adobe', 'custom'], default: 'google' },
            family: { type: String, default: 'Inter' },
            weight: { type: String, default: '' },
            files: {
              woff2: { type: String, default: '' },
              woff: { type: String, default: '' },
              ttf: { type: String, default: '' },
            },
            adobeFamily: { type: String, default: '' },
          },
          display: {
            source: { type: String, enum: ['google', 'adobe', 'custom'], default: 'google' },
            family: { type: String, default: 'Playfair Display' },
            weight: { type: String, default: '' },
            files: {
              woff2: { type: String, default: '' },
              woff: { type: String, default: '' },
              ttf: { type: String, default: '' },
            },
            adobeFamily: { type: String, default: '' },
          },
          tag: {
            source: { type: String, enum: ['google', 'adobe', 'custom'], default: 'google' },
            family: { type: String, default: 'Inter' },
            weight: { type: String, default: '' },
            files: {
              woff2: { type: String, default: '' },
              woff: { type: String, default: '' },
              ttf: { type: String, default: '' },
            },
            adobeFamily: { type: String, default: '' },
          },
        },
        default: () => ({
          heading: { source: 'google', family: 'Inter', weight: '' },
          body: { source: 'google', family: 'Inter', weight: '' },
          display: { source: 'google', family: 'Playfair Display', weight: '' },
          tag: { source: 'google', family: 'Inter', weight: '' },
        }),
      },
      bestSellers: {
        type: {
          showSection: { type: Boolean, default: true },
          sectionTitle: { type: String, default: 'Los más vendidos' },
          sectionSubtitle: { type: String, default: '' },
          accentColor: { type: String, default: '' },
          cardBgColor: { type: String, default: '#ffffff' },
          badgeBgColor: { type: String, default: '#ef4444' },
        },
        default: () => ({
          showSection: true,
          sectionTitle: 'Los más vendidos',
          sectionSubtitle: '',
          accentColor: '',
          cardBgColor: '#ffffff',
          badgeBgColor: '#ef4444',
        }),
      },
    },
    profile: {
      menuDescription: { type: String, default: '' },
      about: { type: String, default: '' },
      social: {
        instagram: { type: String, default: '' },
        facebook: { type: String, default: '' },
        twitter: { type: String, default: '' },
      },
      branding: {
        behance: { type: String, default: '' },
      },
    },
    features: {
      reservations: { type: Boolean, default: false },
      crm: { enabled: { type: Boolean, default: false } },
      tgoGrowthPushEnabled: { type: Boolean, default: false },
    },
    business: {
      enabled: { type: Boolean, default: false },
      activatedAt: { type: Date, default: null },
      activatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    },
    loyalty: {
      enabled:        { type: Boolean, default: false },
      clubName:       { type: String,  default: '' },
      welcomeMessage: { type: String,  default: '' },
      perLocation:    { type: Boolean, default: false },
      createdAt:      { type: Date,    default: null },
      sosLimit:       { type: Number,  default: 0, min: 0 },
      sosMaxLimit:    { type: Number,  default: 0, min: 0 },
    },
    // Configuración de Wallet Digital
    wallet: {
      enabled:        { type: Boolean, default: false },
      cardColor:      { type: String,  default: '' },
      labelColor:     { type: String,  default: '#FFFFFF' },
      logoUrl:        { type: String,  default: '' },
      heroImageUrl:   { type: String,  default: '' },
      applePassTypeIdentifier: { type: String, default: null },
      appleTeamIdentifier:     { type: String, default: null },
      googleIssuerId:          { type: String, default: null },
      geofenceRadius:  { type: Number, default: 500 },
      geofenceMessage: { type: String, default: '¡Estás cerca! Pasate a visitarnos.' },
    },
    mercadopago: {
      accessToken: { type: String, default: null },
      publicKey: { type: String, default: null },
      webhookSecret: { type: String, default: null },
      isConfigured: { type: Boolean, default: false },
    },
    /** OAuth para Split de Pagos (marketplace_fee) */
    mpOAuth: {
      accessToken:  { type: String, default: null },
      refreshToken: { type: String, default: null },
      expiresAt:    { type: Date, default: null },
      authorizedAt: { type: Date, default: null },
      isConnected:  { type: Boolean, default: false },
      /** Per-tenant commission override (null = usar global platformFeePercent) */
      commissionPercent: { type: Number, default: null, min: 0, max: 100 },
    },
    // ── Integración Kripton ─────────────────────────────────────────────────
    kripton: {
      apiKey:           { type: String, default: null },
      isConfigured:     { type: Boolean, default: false },
      cryptoNetworkId:  { type: Number, default: null },
      usePaymentLinks:  { type: Boolean, default: true },
    },
    // ── Integración POS ──────────────────────────────────────────────────────
    posIntegration: {
      provider: {
        type: String,
        enum: ['fudo', 'bistrosoft', 'none'],
        default: 'none',
      },
      enabled: { type: Boolean, default: false },
      credentials: {
        clientId:    { type: String, default: null },
        clientSecret: { type: String, default: null },
        apiEndpoint: { type: String, default: null },
      },
      productMapping: {
        type: [{
          takeasyGoItemId: { type: String, default: null },
          promotionId:     { type: String, default: null },
          posItemId:       { type: String, required: true },
          posItemName:     { type: String, default: '' },
        }],
        default: [],
      },
      lastSyncAt:    { type: Date, default: null },
      webhookSecret: { type: String, default: null },
    },
    // ── API Keys externas (estilo Stripe) ─────────────────────────────────────
    externalApiKeys: {
      type: [{
        keyHash:    { type: String, required: true },
        label:      { type: String, default: 'API Key' },
        createdAt:  { type: Date, default: Date.now },
        lastUsedAt: { type: Date, default: null },
        isActive:   { type: Boolean, default: true },
      }],
      default: [],
    },
    cachedScores: {
      icoScore: { type: Number, default: null },
      capacityScore: { type: Number, default: null },
      updatedAt: { type: Date, default: null },
    },
    /** Promoción de takeaway para primer scan QR */
    qrPromo: {
      isEnabled: { type: Boolean, default: false },
      type: { type: String, enum: ['discount', 'info', 'loyalty'], default: 'discount' },
      discountPercentage: { type: Number, default: 15, min: 0, max: 100 },
      frequency: { type: String, enum: ['once', 'every_visit', 'daily'], default: 'once' },
      title: { type: String, default: '¡Primera vez por QR!' },
      subtitle: { type: String, default: 'Obtené {discount}% OFF en tu primer pedido takeaway' },
      buttonText: { type: String, default: 'Ver menú' },
      termsText: { type: String, default: 'Válido solo para pedidos takeaway. No acumulable con otras promociones.' },
      imageUrl: { type: String, default: '' },
      badgeLabel: { type: String, default: 'SOLO POR HOY' },
      offLabel: { type: String, default: 'OFF' },
      takeawayWarningTitle: { type: String, default: 'DESCUENTO EXCLUSIVO PARA TAKEAWAY' },
      takeawayWarningText: { type: String, default: 'No aplicable para consumir en el local' },
      loadingText: { type: String, default: 'Procesando...' },
      checkoutDiscountLabel: { type: String, default: 'Descuento QR' },
    },
    /** Configuración de sistema de puntos para club de fidelización */
    pointsConfig: {
      enabled: { type: Boolean, default: false },
      mode: { type: String, enum: ['fixed_per_currency', 'percentage', 'hybrid'], default: 'fixed_per_currency' },
      pointsPerCurrency: { type: Number, default: 0.1, min: 0 }, // 0.1 = 1 punto cada $10
      pointsPercentage: { type: Number, default: 10, min: 0, max: 100 }, // 10% del monto
      pointsPerOrder: { type: Number, default: 0, min: 0 }, // puntos fijos por pedido
      minOrderForPoints: { type: Number, default: 0, min: 0 }, // monto mínimo
      pointsRedemptionValue: { type: Number, default: 10, min: 0 }, // valor en pesos de cada 1 punto (ej: 10 = $10)
      redemptionEnabled: { type: Boolean, default: true },
      welcomePoints: { type: Number, default: 0, min: 0 },
    },
    /** Configuración de Store (tienda de canje de puntos) */
    store: {
      enabled: { type: Boolean, default: false },
      title: { type: String, default: 'Tienda de Recompensas' },
      description: { type: String, default: 'Canjea tus puntos por recompensas exclusivas' },
      heroImageUrl: { type: String, default: '' },
      allowOnlineRedemption: { type: Boolean, default: false },
      redemptionExpiryHours: { type: Number, default: 24, min: 1, max: 168 }, // 1 hora a 7 días
      enableCheckoutRedemption: { type: Boolean, default: false },
      locationId: { type: String, default: null },
    },
    // ── Transferencia bancaria ─────────────────────────────────────────────
    transfer: {
      enabled:         { type: Boolean, default: false },
      alias:           { type: String, default: null },
      cbu:             { type: String, default: null },
      cvu:             { type: String, default: null },
      bankName:        { type: String, default: null },
      holderName:      { type: String, default: null },
      commissionPercent: { type: Number, default: null, min: 0, max: 100 },
    },
    // ── Recargos por método de pago ──────────────────────────────────────
    paymentSurcharges: {
      mercadopago: { feePercent: { type: Number, default: 0, min: 0, max: 100 } },
      kripton: { feePercent: { type: Number, default: 0, min: 0, max: 100 } },
      transfer: { feePercent: { type: Number, default: 0, min: 0, max: 100 } },
    },
    // ── Visibilidad de métodos de pago (por location/sede) ──────────────
    paymentMethodsVisibility: {
      mercadopago: { type: Boolean, default: true },
      kripton: { type: Boolean, default: false },
      transfer: { type: Boolean, default: true },
    },
    /** Configuración de notificaciones WhatsApp para admins */
    notifications: {
      whatsappPhone: { type: String, default: null },
      notifyOnOrder: { type: Boolean, default: true },
      notifyOnReservation: { type: Boolean, default: true },
      cis: {
        notifyAtRisk: { type: Boolean, default: true },
        notifyDormant: { type: Boolean, default: true },
        notifyNewVip: { type: Boolean, default: true },
        notifyFrequencyDrop: { type: Boolean, default: true },
        notifyRecovered: { type: Boolean, default: true },
        emailEnabled: { type: Boolean, default: true },
        pushEnabled: { type: Boolean, default: true },
      },
    },
    /** Labels de tipo de promoción — configurables solo por superadmin */
    promotionLabels: {
      sale:         { type: String, default: 'PROMO' },
      info:         { type: String, default: 'INFO' },
      announcement: { type: String, default: 'AVISO' },
      loyalty:      { type: String, default: 'CLUB' },
    },
    /** Mensajes del modal de Club — configurables solo por superadmin */
    loyaltyMessaging: {
      modalSubtitle:    { type: String, default: 'Completá tus datos para unirte al club y comenzar a sumar puntos' },
      successTitle:     { type: String, default: '¡Registro exitoso!' },
      successMessage:   { type: String, default: 'Bienvenido al club de fidelización' },
      welcomePointsMsg: { type: String, default: '{points} puntos de bienvenida' },
    },
    /** Fechas especiales de upselling */
    specialDates: {
      type: [{
        id: { type: String, required: true },
        name: { type: String, required: true },
        date: {
          month: { type: Number, required: true, min: 1, max: 12 },
          day: { type: Number, required: true, min: 1, max: 31 },
        },
        triggerItems: { type: [String], default: [] },
        suggestedItems: { type: [String], default: [] },
      }],
      default: [],
    },
  },
  {
    timestamps: true,
  }
)

// Virtual para isActive basado en status (para compatibilidad)
TenantSchema.virtual('computedIsActive').get(function() {
  return this.status === 'active' || this.status === 'paused'
})

if (process.env.NODE_ENV !== 'production') {
  delete (mongoose.models as any).Tenant
}

const Tenant = mongoose.models.Tenant as mongoose.Model<ITenant> || mongoose.model<ITenant>('Tenant', TenantSchema)
export default Tenant
