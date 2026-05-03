import mongoose, { Schema, Document } from 'mongoose'

export interface ISystemAnnouncement extends Document {
  title: string
  content: string // Soporte Markdown o HTML
  type: 'feature' | 'update' | 'alert' | 'maintenance'
  status: 'draft' | 'published'
  publishedAt?: Date
  targetPlans: string[] // ej: ['premium', 'anfitrion']. Vacío significa todos.
  readBy: mongoose.Types.ObjectId[] // Referencia a usuarios que ya lo leyeron
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
    readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
)

export default mongoose.models.SystemAnnouncement || mongoose.model<ISystemAnnouncement>('SystemAnnouncement', SystemAnnouncementSchema)
