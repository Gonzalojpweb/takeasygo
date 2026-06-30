import mongoose, { Schema, Document } from 'mongoose'

export interface IICOSnapshot extends Document {
  tenantId: mongoose.Types.ObjectId
  date: Date   // normalizado a inicio del día UTC
  icoScore: number
  capacityScore: number | null
  components: {
    consistency: number | null
    cumplimiento: number | null
    bajaCancelacion: number | null
    actividad: number
    estabilidad: number
    integrityScore: number | null
  }
}

const ICOSnapshotSchema = new Schema<IICOSnapshot>(
  {
    tenantId:      { type: Schema.Types.ObjectId, required: true, ref: 'Tenant' },
    date:          { type: Date, required: true },
    icoScore:      { type: Number, required: true },
    capacityScore: { type: Number, default: null },
    components: {
      consistency:      { type: Number, default: null },
      cumplimiento:     { type: Number, default: null },
      bajaCancelacion:  { type: Number, default: null },
      actividad:        { type: Number, required: true },
      estabilidad:      { type: Number, required: true },
      integrityScore:   { type: Number, default: null },
    },
  },
  { timestamps: false }
)

// Un snapshot por tenant por día
ICOSnapshotSchema.index({ tenantId: 1, date: -1 })
ICOSnapshotSchema.index({ tenantId: 1, date: 1 }, { unique: true })

if (process.env.NODE_ENV !== 'production') {
  delete (mongoose.models as any).ICOSnapshot
}

const ICOSnapshot = mongoose.models.ICOSnapshot as mongoose.Model<IICOSnapshot>
  || mongoose.model<IICOSnapshot>('ICOSnapshot', ICOSnapshotSchema)

export default ICOSnapshot
