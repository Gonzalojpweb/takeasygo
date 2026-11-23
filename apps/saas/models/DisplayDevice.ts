import mongoose, { Schema } from 'mongoose'

// ============================================================================
// DisplayDevice — pantallas (tótem, TV, tablet) de un comercio (21/11/2026)
// ============================================================================
// Una sola colección: el código de vinculación pendiente vive acá mismo y el
// documento pendiente se borra solo a los 10 minutos (TTL parcial).
//
//  pending  → la pantalla pidió un código (todavía sin comercio)
//  claimed  → el comercio ingresó el código; falta que la pantalla retire su token
//  active   → la pantalla tiene su token (se entregó una sola vez)
//  revoked  → el comercio la dio de baja; el token deja de servir
//
// Privacidad: ni IP, ni user agent, ni teléfono. Solo hashes (código, nonce,
// token) y el estado técnico que manda la propia pantalla.
// ============================================================================

export type DisplayStatus = 'pending' | 'claimed' | 'active' | 'revoked'
export type DisplayOrientation = 'landscape' | 'portrait'
export type DisplayCommandType = 'reload' | 'resync'

export interface IDisplayDevice {
  tenantId: mongoose.Types.ObjectId | null
  locationId: mongoose.Types.ObjectId | null
  status: DisplayStatus
  pairing: {
    codeHash: string
    nonceHash: string
    attempts: number
  } | null
  /**
   * Vencimiento del código (10 min). Existe SOLO mientras la pantalla no
   * retiró su token (pending o claimed): el TTL borra el documento; al
   * activarse se quita el campo y el documento queda.
   */
  pairingExpiresAt?: Date | null
  name: string
  orientation: DisplayOrientation
  tokenHash: string | null
  tokenPrefix: string | null
  pairedAt: Date | null
  pairedBy: mongoose.Types.ObjectId | null
  revokedAt: Date | null
  revokedBy: mongoose.Types.ObjectId | null
  lastSeenAt: Date | null
  appVersion: string | null
  manifestVersion: string | null
  screen: { width: number; height: number } | null
  cache: { items: number; bytes: number; quotaBytes: number; persisted: boolean } | null
  lastError: { code: string; message: string; at: Date } | null
  /** 23/11/2026: grupo de pantallas (por zona o tipo) para asignar piezas a varias a la vez. */
  group?: string | null
  /**
   * Acción remota pendiente que la pantalla recibe en el manifiesto:
   * 'reload' = recargar al terminar la pieza; 'resync' = borrar lo guardado y
   * volver a bajar. Se considera hecha cuando la pantalla devuelve el id en
   * el latido (commandAckId).
   */
  command?: { id: string; type: DisplayCommandType; issuedAt: Date } | null
  commandAckId?: string | null
  createdAt: Date
  updatedAt: Date
}

const DisplayDeviceSchema = new Schema<IDisplayDevice>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', default: null },
    status: { type: String, enum: ['pending', 'claimed', 'active', 'revoked'], required: true, default: 'pending' },
    pairing: {
      type: new Schema({
        codeHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
        nonceHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
        attempts: { type: Number, default: 0, min: 0 },
      }, { _id: false }),
      default: null,
    },
    pairingExpiresAt: { type: Date },
    name: { type: String, default: '', trim: true, maxlength: 40 },
    orientation: { type: String, enum: ['landscape', 'portrait'], default: 'landscape' },
    tokenHash: { type: String, default: null, match: /^[a-f0-9]{64}$/ },
    tokenPrefix: { type: String, default: null, maxlength: 12 },
    pairedAt: { type: Date, default: null },
    pairedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    lastSeenAt: { type: Date, default: null },
    appVersion: { type: String, default: null, maxlength: 40 },
    manifestVersion: { type: String, default: null, maxlength: 80 },
    screen: {
      type: new Schema({ width: { type: Number, min: 0, max: 20000 }, height: { type: Number, min: 0, max: 20000 } }, { _id: false }),
      default: null,
    },
    cache: {
      type: new Schema({
        items: { type: Number, min: 0, max: 100000 },
        bytes: { type: Number, min: 0 },
        quotaBytes: { type: Number, min: 0 },
        persisted: Boolean,
      }, { _id: false }),
      default: null,
    },
    lastError: {
      type: new Schema({
        code: { type: String, maxlength: 40 },
        message: { type: String, maxlength: 200 },
        at: Date,
      }, { _id: false }),
      default: null,
    },
    group: { type: String, default: null, trim: true, maxlength: 30 },
    command: {
      type: new Schema({
        id: { type: String, required: true, match: /^[a-f0-9]{16}$/ },
        type: { type: String, enum: ['reload', 'resync'], required: true },
        issuedAt: { type: Date, required: true },
      }, { _id: false }),
      default: null,
    },
    commandAckId: { type: String, default: null, maxlength: 16 },
  },
  { timestamps: true }
)

DisplayDeviceSchema.index({ tenantId: 1, locationId: 1, status: 1 })
DisplayDeviceSchema.index({ tokenHash: 1 }, { unique: true, partialFilterExpression: { tokenHash: { $type: 'string' } } })
DisplayDeviceSchema.index({ 'pairing.codeHash': 1 }, { unique: true, partialFilterExpression: { status: 'pending' } })
// Pendiente o reclamada sin token retirado: se borra sola al vencer.
DisplayDeviceSchema.index({ pairingExpiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { pairingExpiresAt: { $exists: true } } })

const DisplayDevice =
  (mongoose.models.DisplayDevice as mongoose.Model<IDisplayDevice>) ||
  mongoose.model<IDisplayDevice>('DisplayDevice', DisplayDeviceSchema)
export default DisplayDevice
