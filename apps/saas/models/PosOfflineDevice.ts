import mongoose, { Schema, type Document } from 'mongoose'

// ============================================================================
// PosOfflineDevice — equipos del POS habilitados para operar SIN INTERNET
// ============================================================================
// POS offline V2 (12/11/2026). El límite por sede sale del plan
// (OFFLINE_DEVICE_LIMIT): Inicial/Crecimiento 1, Premium/Élite 2. El primero
// que se habilita es el «principal» (el de la impresora del comprobante).
// `deviceId` es el UUID que genera el POS la primera vez y guarda en Dexie.
// Revocar (revokedAt) libera el lugar; el equipo deja de operar offline en
// cuanto vuelve a consultar.
//
// Etapa 5 (12/11/2026): `contingencyPointOfSale` = punto de venta de ARCA
// EXCLUSIVO de este equipo para facturar con CAEA sin internet. Exclusivo
// para que dos equipos (o el server en contingencia) nunca usen el mismo
// número: cada uno numera solo, sin poder consultar a nadie.
// ============================================================================

export type OfflineDeviceRole = 'primary' | 'secondary'

export interface IPosOfflineDevice extends Document {
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  deviceId: string
  name: string
  role: OfflineDeviceRole
  registeredBy: mongoose.Types.ObjectId | null
  lastSeenAt: Date | null
  revokedAt: Date | null
  contingencyPointOfSale: number | null
  createdAt: Date
  updatedAt: Date
}

const PosOfflineDeviceSchema = new Schema<IPosOfflineDevice>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
    deviceId: { type: String, required: true, maxlength: 64 },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    role: { type: String, enum: ['primary', 'secondary'], required: true },
    registeredBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    lastSeenAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    contingencyPointOfSale: { type: Number, default: null, min: 1, max: 99998 },
  },
  { timestamps: true, collection: 'pos_offline_devices' }
)

PosOfflineDeviceSchema.index({ tenantId: 1, deviceId: 1 }, { unique: true, name: 'uniq_tenant_device' })
PosOfflineDeviceSchema.index({ tenantId: 1, locationId: 1, revokedAt: 1 })

export default (mongoose.models.PosOfflineDevice as mongoose.Model<IPosOfflineDevice>) ||
  mongoose.model<IPosOfflineDevice>('PosOfflineDevice', PosOfflineDeviceSchema)
