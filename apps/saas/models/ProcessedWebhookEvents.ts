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
      index: true,
      unique: true,
    },
  },
  {
    timestamps: false,
    expireAfterSeconds: 86400, // TTL 24h — auto-cleanup
  }
)

const ProcessedWebhookEvents =
  mongoose.models.ProcessedWebhookEvents ||
  mongoose.model<IProcessedWebhookEvent>('ProcessedWebhookEvents', ProcessedWebhookEventsSchema)

export default ProcessedWebhookEvents
