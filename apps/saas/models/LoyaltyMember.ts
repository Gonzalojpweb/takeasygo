import mongoose, { Schema, Document } from 'mongoose'

export type LoyaltyMemberStatus = 'active' | 'inactive' | 'blocked'
export type LoyaltyMemberSource = 'checkout' | 'qr_scan' | 'admin' | 'manual_import' | 'explore' | 'promotion'
export type LoyaltyTier = 'none' | 'bronze' | 'silver' | 'gold'

export interface ILoyaltyMember extends Document {
  tenantId:  mongoose.Types.ObjectId
  locationId?: mongoose.Types.ObjectId | null  // Per-location club: null = legacy (pre-migration)

  // Vinculación con User (autenticación)
  userId?: mongoose.Types.ObjectId | null  // ID del usuario autenticado (opcional)

  // Identificación del cliente
  name:      string
  phone:     string
  email:     string
  birthDate?: Date | null  // Fecha de nacimiento para notificaciones de cumpleaños
  phoneHash: string   // SHA-256(phone) — para vincular órdenes sin exponer PII

  // Estado de membresía
  status:   LoyaltyMemberStatus
  joinedAt: Date
  source:   LoyaltyMemberSource

  // Caché de actividad (actualizada post-pedido para no calcular en cada consulta)
  cache: {
    totalOrders: number
    /** Total gastado por el miembro en centavos. @storedAs cents */
    totalSpent: number
    lastOrderAt: Date | null
    updatedAt: Date | null
  }

  // Preparado para Fase 2 — puntos y niveles (vacío en Fase 1)
  loyalty: {
    points: number
    tier:   LoyaltyTier
  },
  // Configuración y control de SOS
  sosConfig: {
    maxSosAllowed: number
    hasPendingSos: boolean
    sosUsed: number // Deuda acumulada actual (cuántos puntos debe en total)
  }

  /** Última vez que se intentó contactar por WhatsApp Reward Advance */
  lastRewardAdvanceAttemptedAt?: Date | null
  /** Quién disparó el último intento (para atribución de ventas TGO APP) */
  lastRewardAdvanceAttemptedBy?: 'admin' | 'superadmin' | null

  // Estadísticas de Store (canjes de puntos por artículos)
  store: {
    totalRedemptions: number
    /** Total de puntos canjeados. Not cents — stored as points. */
    totalPointsSpent: number
    lastRedemptionAt?: Date | null
  }

  // Sistema de Impacto y Progresión
  userImpact: {
    commercesSupported: number      // comercios apoyados (compras únicas por comercio)
    nearbyPurchases: number         // compras de cercanía (orden within delivery range)
    discoveredBusinesses: number    // comercios descubiertos (primera compra)
    discoveredBusinessesList: mongoose.Types.ObjectId[]
    discoveredNeighborhoods: string[]
    badges: { id: string; unlockedAt: Date }[]
    lastImpactAt: Date | null
  }

  // FASE WALLET: Integración Google & Apple Wallet
  wallet: {
    /** ID único público para QR (no expone ObjectId de Mongo) */
    publicId: string
    /** Google Wallet: ID del objeto loyalty en Google API */
    googleObjectId?: string
    /** Apple Wallet: Device Library Identifier para push updates */
    appleDeviceLibraryIdentifier?: string
    /** Apple Wallet: Push token para notificaciones de actualización */
    pushToken?: string
    /** Fecha de instalación en wallets */
    installedAt?: Date | null
    /** Última sincronización de puntos */
    lastSyncAt?: Date | null
  }

  notes:     string   // nota interna del admin
  createdAt: Date
  updatedAt: Date
}

const LoyaltyMemberSchema = new Schema<ILoyaltyMember>(
  {
    tenantId: {
      type:     Schema.Types.ObjectId,
      ref:      'Tenant',
      required: true,
      index:    true,
    },

    locationId: {
      type:     Schema.Types.ObjectId,
      ref:      'Location',
      default:  null,
      index:    true,
    },

    // Vinculación con User (autenticación)
    userId: {
      type:     Schema.Types.ObjectId,
      ref:      'User',
      index:    true,
    },

    name: {
      type:     String,
      required: true,
      trim:     true,
    },
    phone: {
      type:    String,
      default: '',
      trim:    true,
    },
    email: {
      type:    String,
      default: '',
      trim:    true,
      lowercase: true,
    },
    birthDate: {
      type:    Date,
      default: null,
    },
    phoneHash: {
      type:    String,
      default: null,
      index:   true,
    },

    status: {
      type:    String,
      enum:    ['active', 'inactive', 'blocked'],
      default: 'active',
    },
    joinedAt: {
      type:    Date,
      default: Date.now,
    },
    source: {
      type:    String,
      enum:    ['checkout', 'qr_scan', 'admin', 'manual_import', 'explore', 'promotion'],
      default: 'admin',
    },

    cache: {
      totalOrders: { type: Number, default: 0 },
      totalSpent:  { type: Number, default: 0 },
      lastOrderAt: { type: Date,   default: null },
      updatedAt:   { type: Date,   default: null },
    },

    loyalty: {
      points: { type: Number, default: 0 },
      tier:   {
        type:    String,
        enum:    ['none', 'bronze', 'silver', 'gold'],
        default: 'none',
      },
    },

    // Configuración y control de SOS
    sosConfig: {
      maxSosAllowed: { type: Number, default: 100 },
      hasPendingSos: { type: Boolean, default: false },
      sosUsed:       { type: Number, default: 0, min: 0 },
    },

    lastRewardAdvanceAttemptedAt: {
      type:    Date,
      default: null,
    },

    lastRewardAdvanceAttemptedBy: {
      type:    String,
      enum:    ['admin', 'superadmin'],
      default: null,
    },

    // Estadísticas de Store
    store: {
      totalRedemptions: { type: Number, default: 0 },
      totalPointsSpent: { type: Number, default: 0 },
      lastRedemptionAt: { type: Date, default: null },
    },

    // Sistema de Impacto y Progresión
    userImpact: {
      commercesSupported: { type: Number, default: 0 },
      nearbyPurchases: { type: Number, default: 0 },
      discoveredBusinesses: { type: Number, default: 0 },
      discoveredBusinessesList: [{ type: Schema.Types.ObjectId, ref: 'Location' }],
      discoveredNeighborhoods: [{ type: String }],
      badges: [{
        id: { type: String, required: true },
        unlockedAt: { type: Date, default: Date.now },
      }],
      lastImpactAt: { type: Date, default: null },
    },

    // FASE WALLET: Schema para integración con billeteras
    wallet: {
      publicId: {
        type: String,
        required: false,
        unique: true,
        index: true,
      },
      googleObjectId: {
        type: String,
        default: null,
        index: true,
      },
      appleDeviceLibraryIdentifier: {
        type: String,
        default: null,
      },
      pushToken: {
        type: String,
        default: null,
      },
      installedAt: {
        type: Date,
        default: null,
      },
      lastSyncAt: {
        type: Date,
        default: null,
      },
    },

    notes: {
      type:    String,
      default: '',
      trim:    true,
    },
  },
  { timestamps: true }
)

// ── Índices compuestos ────────────────────────────────────────────────────────
// Unicidad por tenant + sede + teléfono: solo aplica cuando phoneHash es un string real
// Cuando perLocation está activo, locationId es requerido; cuando no, se comporta como null (legacy)
LoyaltyMemberSchema.index(
  { tenantId: 1, locationId: 1, phoneHash: 1 },
  { unique: true, partialFilterExpression: { phoneHash: { $type: 'string', $gt: '' } } }
)
LoyaltyMemberSchema.index({ tenantId: 1, locationId: 1, email: 1 })
LoyaltyMemberSchema.index({ tenantId: 1, locationId: 1, status: 1, joinedAt: -1 })
LoyaltyMemberSchema.index({ tenantId: 1, locationId: 1, source: 1 })
// Índice para buscar membresía por usuario autenticado (no unique — la unicidad se garantiza con tenantId_1_phoneHash_1)
LoyaltyMemberSchema.index({ userId: 1, tenantId: 1 }, { sparse: true })

// ── Post-save hook: sync consumer registry ────────────────────────────────
LoyaltyMemberSchema.post('save', async function () {
  try {
    const { upsertConsumerFromLoyaltyMember } = await import('@/lib/consumer')
    await upsertConsumerFromLoyaltyMember({
      name: this.name,
      email: this.email,
      phone: this.phone,
      phoneHash: this.phoneHash,
      tenantId: this.tenantId,
    })
  } catch (e) {
    console.error('[consumer] LoyaltyMember sync error:', e)
  }
})

// ── Helper estático: generar phoneHash ───────────────────────────────────────
// DEPRECATED: Usar hashPhone de lib/crypto.ts directamente en nuevos desarrollos.
// Se elimina el método estático para evitar implementaciones inconsistentes.

// ── Helper: generar publicId único para QR/Wallets ────────────────────────────
function generatePublicId(): string {
  // Formato: TGO-XXXX-XXXX-XXXX (ej: TGO-A3F7-K9M2-P8R5)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const segment = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `TGO-${segment()}-${segment()}-${segment()}`
}

// ── Middleware pre-save: generar publicId si no existe ───────────────────────
LoyaltyMemberSchema.pre('save', async function () {
  if (!this.wallet?.publicId) {
    // Generar ID único (con reintentos por si hay colisión)
    let publicId = generatePublicId()
    let attempts = 0
    const maxAttempts = 5

    while (attempts < maxAttempts) {
      const exists = await (this.constructor as any).findOne({ 'wallet.publicId': publicId }).lean()
      if (!exists) break
      publicId = generatePublicId()
      attempts++
    }

    if (!this.wallet) this.wallet = {} as any
    this.wallet.publicId = publicId
  }
})

const LoyaltyMember =
  mongoose.models.LoyaltyMember ||
  mongoose.model<ILoyaltyMember>('LoyaltyMember', LoyaltyMemberSchema)

// ── One-time schema migration ─────────────────────────────────────────────
// 1. Drop old unique `userId_1_tenantId_1` index (was created without sparse)
// 2. Drop old unique `tenantId_1_phoneHash_1` index (replaced by per-location version)
// The schema now defines the correct indexes; Mongoose will recreate them.
let _idxMigrated = false
async function _migrateUserIdIndex() {
  if (_idxMigrated) return
  _idxMigrated = true
  try {
    const db = mongoose.connection.db
    if (!db) return
    const indexes = await db.collection('loyaltymembers').indexes()

    // Drop old unique userId_1_tenantId_1
    const oldUserIdIdx = indexes.find(i => i.name === 'userId_1_tenantId_1')
    if (oldUserIdIdx && oldUserIdIdx.unique) {
      await db.collection('loyaltymembers').dropIndex('userId_1_tenantId_1')
    }

    // Drop old unique tenantId_1_phoneHash_1 (replaced by tenantId_1_locationId_1_phoneHash_1)
    const oldPhoneHashIdx = indexes.find(i => i.name === 'tenantId_1_phoneHash_1')
    if (oldPhoneHashIdx && oldPhoneHashIdx.unique) {
      await db.collection('loyaltymembers').dropIndex('tenantId_1_phoneHash_1')
    }
  } catch (err) {
    console.warn('[LoyaltyMember] Index migration skipped:', (err as Error).message)
  }
}
if (mongoose.connection.readyState === 1) {
  void _migrateUserIdIndex()
} else {
  mongoose.connection.once('open', () => { void _migrateUserIdIndex() })
}

export default LoyaltyMember
