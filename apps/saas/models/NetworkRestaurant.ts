import mongoose, { Schema, Document, Model } from 'mongoose'

export interface INetworkRestaurant extends Document {
    nombre: string
    instagram: string
    email: string
    telefono: string
    tipoRestaurante: string
    createdAt: Date
    updatedAt: Date
}

const NetworkRestaurantSchema = new Schema<INetworkRestaurant>(
    {
        nombre:          { type: String, required: true, trim: true },
        instagram:       { type: String, trim: true, default: '' },
        email:           { type: String, required: true, trim: true, lowercase: true },
        telefono:        { type: String, required: true, trim: true },
        tipoRestaurante: { type: String, required: true, trim: true },
    },
    { timestamps: true }
)

NetworkRestaurantSchema.index({ email: 1 })
NetworkRestaurantSchema.index({ createdAt: -1 })

const NetworkRestaurant: Model<INetworkRestaurant> =
    mongoose.models.NetworkRestaurant ||
    mongoose.model<INetworkRestaurant>('NetworkRestaurant', NetworkRestaurantSchema)

export default NetworkRestaurant
