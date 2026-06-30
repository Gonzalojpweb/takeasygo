import mongoose, { Schema, Document } from 'mongoose'

export interface IVerificationToken extends Document {
  identifier: string
  token: string
  expires: Date
}

const VerificationTokenSchema = new Schema<IVerificationToken>(
  {
    identifier: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    expires: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: false,
  }
)

VerificationTokenSchema.index({ expires: 1 }, { expireAfterSeconds: 0 })
VerificationTokenSchema.index({ identifier: 1, token: 1 }, { unique: true })

const VerificationToken =
  mongoose.models.VerificationToken ||
  mongoose.model<IVerificationToken>('VerificationToken', VerificationTokenSchema)

export default VerificationToken
