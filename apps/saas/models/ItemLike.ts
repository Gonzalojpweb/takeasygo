import mongoose, { Schema, Document } from 'mongoose'

export interface IItemLike extends Document {
  tenantId: mongoose.Types.ObjectId
  menuItemId: mongoose.Types.ObjectId
  orderId: mongoose.Types.ObjectId
  createdAt: Date
}

const ItemLikeSchema = new Schema<IItemLike>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    menuItemId: {
      type: Schema.Types.ObjectId,
      ref: 'MenuItem',
      required: true,
      index: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

ItemLikeSchema.index({ tenantId: 1, menuItemId: 1, createdAt: -1 })
ItemLikeSchema.index({ orderId: 1, menuItemId: 1 }, { unique: true })

const ItemLike = mongoose.models.ItemLike || mongoose.model<IItemLike>('ItemLike', ItemLikeSchema)
export default ItemLike
