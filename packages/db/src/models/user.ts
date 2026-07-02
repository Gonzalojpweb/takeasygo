import mongoose, { Schema, type Document } from "mongoose"
import bcrypt from "bcryptjs"

export interface UserDocument extends Document {
  name: string
  email: string
  password?: string
  pin?: string
  role: string
  tenantId: mongoose.Types.ObjectId | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  comparePassword(candidate: string): Promise<boolean>
  comparePin(candidate: string): Promise<boolean>
}

export const UserSchema = new Schema<UserDocument>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, select: false },
    pin: { type: String, select: false },
    role: {
      type: String,
      required: true,
      enum: ["superadmin", "admin", "manager", "staff", "cashier", "consumer", "seller"],
      default: "consumer",
    },
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

UserSchema.index({ email: 1 })
UserSchema.index({ tenantId: 1, role: 1 })

UserSchema.pre("save", async function () {
  if (this.isModified("password") && this.password) {
    this.password = await bcrypt.hash(this.password, 12)
  }
  if (this.isModified("pin") && this.pin) {
    this.pin = await bcrypt.hash(this.pin, 10)
  }
})

UserSchema.methods.comparePassword = async function (
  candidate: string
): Promise<boolean> {
  if (!this.password) return false
  return bcrypt.compare(candidate, this.password)
}

UserSchema.methods.comparePin = async function (
  candidate: string
): Promise<boolean> {
  if (!this.pin) return false
  return bcrypt.compare(candidate, this.pin)
}

export const UserModel = mongoose.model<UserDocument>(
  "User",
  UserSchema,
  "users"
)
