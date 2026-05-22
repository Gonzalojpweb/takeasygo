import mongoose, { Schema, Document } from 'mongoose'

export type OrderStatus = 'awaiting_payment' | 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled'
export type OrderMode = 'takeaway' | 'dine-in'
export type PaymentStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface ISelectedCustomizationOption {
  name: string
  extraPrice: number
}

export interface ISelectedCustomizationGroup {
  groupName: string
  selectedOptions: ISelectedCustomizationOption[]
}

export interface ISelectedVariant {
  name: string
  price: number
  takeawayPrice?: number
}

export interface IOrderItem {
  menuItemId?: mongoose.Types.ObjectId
  promotionId?: string
  storeItemId?: mongoose.Types.ObjectId
  itemType: 'menuItem' | 'promotion' | 'reward'
  categoryName: string
  name: string
  basePrice: number
  extraPrice: number
  price: number
  quantity: number
  subtotal: number
  customizations: ISelectedCustomizationGroup[]
  selectedVariant?: ISelectedVariant
  addedFrom?: string
  /** Si true, el item tenía descuento de categoría (originalPrice definido en el menú). El QR no aplicó sobre él. */
  hasCategoryDiscount?: boolean
}

export interface IPrintLogEntry {
  printerName: string
  role: string
  success: boolean
  error: string
  printedAt: Date
}

export interface IStatusTimestamps {
  confirmedAt:      Date | null
  preparingAt:      Date | null
  readyAt:          Date | null
  deliveredAt:      Date | null
  cancelledAt:      Date | null
  estimatedReadyAt: Date | null  // confirmedAt + location.estimatedPickupTime
}

export interface IRewardRedemption {
  storeItemId: mongoose.Types.ObjectId
  storeItemName: string
  pointsCost: number
  cashValue?: number
  sosApplied: boolean
}

export interface IOrder extends Document {
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  orderNumber: string
  status: OrderStatus
  orderMode: OrderMode
  items: IOrderItem[]
  rewardItems: IRewardRedemption[]
  subtotal: number
  discountAmount: number
  qrPromoApplied: boolean
  total: number
  customer: {
    name: string
    phone: string
    email: string
    phoneHash?: string
  }
  payment: {
    status: PaymentStatus
    method: string
    mercadopagoId: string | null
    mercadopagoData: Record<string, any> | null
  }
  notes: string
  clientToken: string | null
  printed: boolean
  printLog: IPrintLogEntry[]
  statusTimestamps: IStatusTimestamps
  // ── Sincronización con POS (FUDO / BISTROSOFT) ─────────────────────────────
  posSync: {
    status: 'not_applicable' | 'pending' | 'synced' | 'failed'
    posOrderId: string | null
    attempts: number
    lastAttemptAt: Date | null
    error: string | null
  }
  // ── Pedidos programados ────────────────────────────────────────────────────
  orderTiming: 'immediate' | 'scheduled'
  scheduledPickupAt: Date | null
  scheduledStatus: 'pending_schedule' | 'active' | 'expired' | null
  loyaltyPointsUsed?: number
  loyaltyDiscountAmount?: number
  rewardAdvanceApplied?: boolean
  rewardAdvanceAmount?: number
  loyaltyPointsCredited: boolean
  source?: string
  createdAt: Date
  updatedAt: Date
}

const RewardRedemptionSchema = new Schema<IRewardRedemption>({
  storeItemId: { type: Schema.Types.ObjectId, required: true },
  storeItemName: { type: String, required: true },
  pointsCost: { type: Number, required: true, min: 0 },
  cashValue: { type: Number, default: null },
  sosApplied: { type: Boolean, default: false },
}, { _id: false })

const SelectedVariantSchema = new Schema<ISelectedVariant>({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  takeawayPrice: { type: Number },
}, { _id: false })

const SelectedCustomizationOptionSchema = new Schema<ISelectedCustomizationOption>({
  name: { type: String, required: true },
  extraPrice: { type: Number, default: 0 },
}, { _id: false })

const SelectedCustomizationGroupSchema = new Schema<ISelectedCustomizationGroup>({
  groupName: { type: String, required: true },
  selectedOptions: [SelectedCustomizationOptionSchema],
}, { _id: false })

const OrderItemSchema = new Schema<IOrderItem>({
  menuItemId: {
    type: Schema.Types.ObjectId,
    default: null,
  },
  promotionId: {
    type: String,
    default: null,
  },
  storeItemId: {
    type: Schema.Types.ObjectId,
    default: null,
  },
  itemType: {
    type: String,
    enum: ['menuItem', 'promotion', 'reward'],
    default: 'menuItem',
  },
  categoryName: { type: String, default: '' },
  name: { type: String, required: true },
  basePrice: { type: Number, required: true },
  extraPrice: { type: Number, default: 0 },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
  subtotal: { type: Number, required: true },
  customizations: {
    type: [SelectedCustomizationGroupSchema],
    default: [],
  },
  selectedVariant: { type: SelectedVariantSchema, default: null },
  addedFrom: { type: String, default: null },
})

const OrderSchema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    locationId: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      required: true,
      index: true,
    },
    orderNumber: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ['awaiting_payment', 'pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'] as const,
      default: 'awaiting_payment',
    },
    orderMode: {
      type: 'String' as const,
      enum: ['takeaway', 'dine-in'] as const,
      required: true,
    },
    items: [OrderItemSchema],
    rewardItems: {
      type: [RewardRedemptionSchema],
      default: [],
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    qrPromoApplied: {
      type: Boolean,
      default: false,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    customer: {
      name: { type: String, required: true, trim: true },
      phone: { type: String, default: '', trim: true },
      email: { type: String, default: '', trim: true },
      phoneHash: { type: String, default: null, index: true },
    },
    payment: {
      status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'cancelled'] as const,
        default: 'pending',
      },
      method: { type: String, default: 'mercadopago' },
      mercadopagoId: { type: String, default: null },
      mercadopagoData: { type: Schema.Types.Mixed, default: null },
    },
    notes: { type: String, default: '', trim: true },
    // Token del dispositivo consumer para enviar push cuando el pedido esté listo
    clientToken: { type: String, default: null, index: true },
    printed: { type: Boolean, default: false },
    statusTimestamps: {
      confirmedAt:      { type: Date, default: null },
      preparingAt:      { type: Date, default: null },
      readyAt:          { type: Date, default: null },
      deliveredAt:      { type: Date, default: null },
      cancelledAt:      { type: Date, default: null },
      estimatedReadyAt: { type: Date, default: null },
    },
    printLog: {
      type: [{
        printerName: { type: String, required: true },
        role: { type: String, required: true },
        success: { type: Boolean, required: true },
        error: { type: String, default: '' },
        printedAt: { type: Date, default: Date.now },
      }],
      default: [],
    },
    // ── Sincronización con POS ───────────────────────────────────────────────
    posSync: {
      status: {
        type: String,
        enum: ['not_applicable', 'pending', 'synced', 'failed'],
        default: 'not_applicable',
      },
      posOrderId:    { type: String, default: null },
      attempts:      { type: Number, default: 0 },
      lastAttemptAt: { type: Date,   default: null },
      error:         { type: String, default: null },
    },
    // ── Pedidos programados ──────────────────────────────────────────────────
    orderTiming: {
      type: String,
      enum: ['immediate', 'scheduled'],
      default: 'immediate',
    },
    scheduledPickupAt: { type: Date, default: null },
    scheduledStatus: {
      type: String,
      enum: ['pending_schedule', 'active', 'expired'],
      default: null,
    },
    loyaltyPointsUsed: {
      type: Number,
      default: 0,
    },
    loyaltyDiscountAmount: {
      type: Number,
      default: 0,
    },
    rewardAdvanceApplied: {
      type: Boolean,
      default: false,
    },
    rewardAdvanceAmount: {
      type: Number,
      default: 0,
    },
    loyaltyPointsCredited: {
      type: Boolean,
      default: false,
    },
    source: {
      type: String,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
)

OrderSchema.index({ tenantId: 1, createdAt: -1 })
OrderSchema.index({ tenantId: 1, locationId: 1, createdAt: -1 })
OrderSchema.index({ orderNumber: 1 })
OrderSchema.index({ tenantId: 1, 'customer.phoneHash': 1 })  // tasa de recompra
OrderSchema.index({ tenantId: 1, scheduledPickupAt: 1, scheduledStatus: 1 })

const Order = mongoose.models.Order || mongoose.model<IOrder>('Order', OrderSchema)
export default Order