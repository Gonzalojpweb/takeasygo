import mongoose, { Schema, Document } from 'mongoose'

export interface ITenant extends Document {
  name: string
  slug: string
  plan: 'trial' | 'try' | 'buy' | 'full' | 'anfitrion'
  status: 'active' | 'paused' | 'deleted'
  isActive: boolean  // Computed: status === 'active' || status === 'paused'
  pausedAt?: Date | null
  pausedReason?: string
  subscription: {
    preapprovalId: string | null
    status: 'authorized' | 'pending' | 'cancelled' | 'paused' | null
    plan: 'try' | 'buy' | 'full' | null
    nextBillingDate: Date | null
    lastUpdated: Date | null
  }
  branding: {
    primaryColor: string
    secondaryColor: string
    backgroundColor: string
    textColor: string
    logoUrl: string
    fontFamily: string
    borderRadius: 'sharp' | 'rounded' | 'pill'
    menuLayout: 'grid' | 'list'
    darkMode: boolean
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
  }
  loyalty: {
    enabled:        boolean
    clubName:       string   // nombre del club (por defecto 'Club [nombre restaurante]')
    welcomeMessage: string   // mensaje de bienvenida editable
    createdAt:      Date | null
  }
  mercadopago: {
    accessToken: string | null
    publicKey: string | null
    webhookSecret: string | null
    isConfigured: boolean
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
      takeasyGoItemId: string       // ObjectId del item en TakeasyGO
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
  createdAt: Date
  updatedAt: Date
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
      primaryColor: { type: String, default: '#000000' },
      secondaryColor: { type: String, default: '#ffffff' },
      backgroundColor: { type: String, default: '#ffffff' },
      textColor: { type: String, default: '#000000' },
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
      darkMode: { type: Boolean, default: false },
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
    },
    loyalty: {
      enabled:        { type: Boolean, default: false },
      clubName:       { type: String,  default: '' },
      welcomeMessage: { type: String,  default: '' },
      createdAt:      { type: Date,    default: null },
    },
    mercadopago: {
      accessToken: { type: String, default: null },
      publicKey: { type: String, default: null },
      webhookSecret: { type: String, default: null },
      isConfigured: { type: Boolean, default: false },
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
          takeasyGoItemId: { type: String, required: true },
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
