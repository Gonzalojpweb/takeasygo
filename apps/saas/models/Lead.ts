import mongoose, { Schema, Document, Model } from 'mongoose'

export interface ILead extends Document {
    name: string
    business: string
    email: string
    phone: string
    plan: string      // display label, e.g. "Crecimiento – $50/mes"
    planId: string    // internal key, e.g. 'crecimiento-mensual'
    status: 'new' | 'contacted' | 'closed' | 'lost'
    notes: string
    createdAt: Date
    updatedAt: Date
}

const LeadSchema = new Schema<ILead>(
    {
        name:     { type: String, required: true, trim: true },
        business: { type: String, required: true, trim: true },
        email:    { type: String, required: true, trim: true, lowercase: true },
        phone:    { type: String, required: true, trim: true },
        plan:     { type: String, required: true },
        planId:   { type: String, required: true },
        status:   {
            type: String,
            enum: ['new', 'contacted', 'closed', 'lost'],
            default: 'new',
        },
        notes: { type: String, default: '' },
    },
    { timestamps: true }
)

LeadSchema.index({ email: 1 })
LeadSchema.index({ status: 1, createdAt: -1 })

const Lead: Model<ILead> =
    mongoose.models.Lead || mongoose.model<ILead>('Lead', LeadSchema)

export default Lead
