import mongoose, { Schema, type Document } from 'mongoose'

// ============================================================================
// FiscalPosClaim — quién usa cada punto de venta de un CUIT (multi-marca PR 6)
// ============================================================================
// Dos marcas pueden compartir CUIT (misma razón social) pero NO el mismo punto
// de venta: los candados de numeración son por comercio y no se excluyen
// entre sí, así que dos emisiones simultáneas tomarían el mismo número.
// El índice único {cuit, environment, pointOfSale} lo impide en la base.
// Lo escribe lib/fiscal/pos-claims.ts al guardar el perfil fiscal (con
// fiscal.posClaims en enforce) y el backfill del PR 6.
// ============================================================================

export type PosClaimKind = 'regular' | 'contingency'

export interface IFiscalPosClaim extends Document {
  cuit: string
  environment: 'homologation' | 'production'
  pointOfSale: number
  kind: PosClaimKind
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const FiscalPosClaimSchema = new Schema<IFiscalPosClaim>(
  {
    cuit: { type: String, required: true, trim: true, maxlength: 11 },
    environment: { type: String, enum: ['homologation', 'production'], required: true },
    pointOfSale: { type: Number, required: true, min: 1, max: 99998 },
    kind: { type: String, enum: ['regular', 'contingency'], required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
  },
  { timestamps: true, collection: 'fiscal_pos_claims' }
)

FiscalPosClaimSchema.index({ cuit: 1, environment: 1, pointOfSale: 1 }, { unique: true, name: 'uniq_cuit_env_pos' })
FiscalPosClaimSchema.index({ tenantId: 1 })

export default (mongoose.models.FiscalPosClaim as mongoose.Model<IFiscalPosClaim>) ||
  mongoose.model<IFiscalPosClaim>('FiscalPosClaim', FiscalPosClaimSchema)
