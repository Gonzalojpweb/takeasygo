import mongoose, { Schema, Document } from 'mongoose'

export interface ISystemAnnouncement extends Document {
  title: string
  content: string // Soporte Markdown o HTML
  type: 'feature' | 'update' | 'alert' | 'maintenance'
  status: 'draft' | 'published'
  publishedAt?: Date
  targetPlans: string[] // ej: ['premium', 'anfitrion']. Vacío significa todos.
  targetTenantIds: mongoose.Types.ObjectId[] // Vacío = todos los tenants
  readBy: mongoose.Types.ObjectId[] // Legacy: referencia a usuarios que ya lo leyeron
  acceptances: {
    userId: mongoose.Types.ObjectId
    acceptedAt: Date
  }[] // Nuevo: tracking de aceptación con timestamp
  requiresConsent: boolean // true = banner bloqueante, solo se cierra con "Acepto"
  expiresAt: Date | null // null = nunca expira; Date = TTL automático (para recordatorios semanales)
  createdAt: Date
  updatedAt: Date
}

const SystemAnnouncementSchema = new Schema<ISystemAnnouncement>(
  {
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    type: { 
      type: String, 
      enum: ['feature', 'update', 'alert', 'maintenance'], 
      default: 'update' 
    },
    status: { 
      type: String, 
      enum: ['draft', 'published'], 
      default: 'draft' 
    },
    publishedAt: { type: Date },
    targetPlans: { type: [String], default: [] },
    targetTenantIds: { type: [Schema.Types.ObjectId], ref: 'Tenant', default: [] },
    readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }], // Legacy
    acceptances: [{
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      acceptedAt: { type: Date, default: Date.now },
    }],
    requiresConsent: { type: Boolean, default: false },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
)

// TTL index: borra documentos cuando expiresAt queda en el pasado
// expiresAt: null → nunca se borra (anuncio principal)
// expiresAt: fecha → se borra cuando esa fecha pasa (recordatorios semanales, 90 días)
SystemAnnouncementSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export default mongoose.models.SystemAnnouncement || mongoose.model<ISystemAnnouncement>('SystemAnnouncement', SystemAnnouncementSchema)
