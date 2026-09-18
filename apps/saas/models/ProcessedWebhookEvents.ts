import mongoose, { Schema, Document } from 'mongoose'

export interface IProcessedWebhookEvent extends Document {
  requestId: string
  createdAt: Date
}

const ProcessedWebhookEventsSchema = new Schema<IProcessedWebhookEvent>(
  {
    requestId: {
      type: String,
      required: true,
      unique: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 86400, // 24h TTL auto-cleanup
    },
  },
  {
    timestamps: false,
  }
)

const ProcessedWebhookEvents =
  mongoose.models.ProcessedWebhookEvents ||
  mongoose.model<IProcessedWebhookEvent>('ProcessedWebhookEvents', ProcessedWebhookEventsSchema)

export default ProcessedWebhookEvents
