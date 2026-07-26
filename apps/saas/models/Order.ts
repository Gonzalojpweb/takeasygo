import mongoose, { Schema, Document } from 'mongoose'

export type OrderStatus = 'open' | 'awaiting_payment' | 'awaiting_confirmation' | 'pending' | 'confirmed' | 'preparing' | 'ready' | 'en_ruta' | 'arrived' | 'delivered' | 'cancelled'
export type OrderMode = 'takeaway' | 'dine-in' | 'business' | 'delivery'
export type PaymentStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type PaymentModeSnapshot = 'cash_mp' | 'deferred' | 'mixed'

export interface ISelectedCustomizationOption {
  name: string
  extraPrice: number
  subGroups?: ISelectedCustomizationGroup[]
}

export interface ISelectedCustomizationGroup {
  groupName: string
  selectedOptions: ISelectedCustomizationOption[]
}

export interface ISelectedVariant {
  name: string
  price: number
  takeawayPrice?: number
  businessPrice?: number
}

export interface IOrderItem {
  menuItemId?: mongoose.Types.ObjectId
  promotionId?: string
  storeItemId?: mongoose.Types.ObjectId
  itemType: 'menuItem' | 'promotion' | 'reward'
  categoryName: string
  name: string
  description: string
  shortDescription?: string
  basePrice: number
  extraPrice: number
  price: number
  quantity: number
  subtotal: number
  customizations: ISelectedCustomizationGroup[]
  selectedVariant?: ISelectedVariant
  printRole?: string
  addedFrom?: string
  addedByEmail?: string
  promotionTitle?: string      // Título de la promo para ticket cocina
  slotName?: string            // Nombre del slot para ticket cocina
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
  enRutaAt:         Date | null
  arrivedAt:        Date | null
  deliveredAt:      Date | null
  cancelledAt:      Date | null
  estimatedReadyAt: Date | null  // confirmedAt + location.estimatedPickupTime (línea base ICO)
  customerEstimatedReadyAt: Date | null  // confirmedAt + estimatedPickupTime + delayExtraMinutes (solo UX)
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
  corporateAccountId: mongoose.Types.ObjectId | null
  paymentModeSnapshot: PaymentModeSnapshot | null
  groupSessionToken: string | null
  sessionExpiresAt: Date | null
  items: IOrderItem[]
  rewardItems: IRewardRedemption[]
  subtotal: number
  discountAmount: number
  qrPromoApplied: boolean
  promoSlug: string | null
  promoCode: string | null
  promoCreatedBy: 'superadmin' | 'admin' | null
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
    // ── Kripton ─────────────────────────────────────────────────────────
    kriptonExternalCode: string | null
    kriptonToken: string | null
    kriptonData: Record<string, any> | null
    // ── Pricing dinámico ─────────────────────────────────────────────────
    baseTotal: number
    surchargePercent: number
    surchargeAmount: number
    platformFeeAmount: number
    // ── Transferencia ────────────────────────────────────────────────────
    transferConfirmed: boolean
    transferConfirmedAt: Date | null
    transferConfirmedBy: string | null
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
  rewardDeductionProcessed?: boolean
  source?: string
  // ── Delivery Confirmation (atestación mutua) ───────────────────────────────
  deliveryConfirmation?: {
    customerCode: {
      code: string | null
      expiresAt: Date | null
    }
    deliveryPersonId: mongoose.Types.ObjectId | null
    deliveryPersonName: string | null
    status: 'pending' | 'assigned' | 'en_ruta' | 'arrived' | 'completed' | 'disputed'
    arrivalLat: number | null
    arrivalLng: number | null
    arrivalAt: Date | null
    completedAt: Date | null
  }
  // ── Delivery ───────────────────────────────────────────────────────────────
  deliveryAddress?: {
    street: string
    number: string
    apt?: string
    city: string
    coordinates: { lat: number; lng: number }
  }
  deliveryCost: number
  deliveryDistance: number
  deliveryRangeApplied?: {
    fromKm: number
    toKm: number
    price: number
  }
  createdAt: Date
  updatedAt: Date
  deletedAt?: Date | null
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
  businessPrice: { type: Number },
}, { _id: false })

// Schemas circulares para subGroups (misma técnica que Menu.ts)
const SelectedCustomizationOptionSchema: Schema = new Schema({}, { _id: false })
const SelectedCustomizationGroupSchema: Schema = new Schema({}, { _id: false })

SelectedCustomizationOptionSchema.add({
  name:       { type: String, required: true },
  extraPrice: { type: Number, default: 0 },
  subGroups:  { type: [SelectedCustomizationGroupSchema], default: [] },
})

SelectedCustomizationGroupSchema.add({
  groupName:       { type: String, required: true },
  selectedOptions: { type: [SelectedCustomizationOptionSchema], default: [] },
})

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
  description: { type: String, default: '' },
  shortDescription: { type: String, default: '' },
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
  printRole: { type: String, default: 'kitchen' },
  addedFrom: { type: String, default: null },
  addedByEmail: { type: String, default: null },
  promotionTitle: { type: String, default: null },
  slotName: { type: String, default: null },
  hasCategoryDiscount: { type: Boolean, default: false },
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
      enum: ['open', 'awaiting_payment', 'awaiting_confirmation', 'pending', 'confirmed', 'preparing', 'ready', 'en_ruta', 'arrived', 'delivered', 'cancelled'] as const,
      default: 'awaiting_payment',
    },
    orderMode: {
      type: String,
      enum: ['takeaway', 'dine-in', 'business', 'delivery'] as const,
      required: true,
    },
    corporateAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'CorporateAccount',
      default: null,
    },
    paymentModeSnapshot: {
      type: String,
      enum: ['cash_mp', 'deferred', 'mixed', null],
      default: null,
    },
    groupSessionToken: {
      type: String,
      default: null,
    },
    sessionExpiresAt: {
      type: Date,
      default: null,
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
    promoSlug: {
      type: String,
      default: null,
    },
    promoCode: {
      type: String,
      default: null,
    },
    promoCreatedBy: {
      type: String,
      enum: ['superadmin', 'admin', null],
      default: null,
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
      // ── Kripton ─────────────────────────────────────────────────────
      kriptonExternalCode: { type: String, default: null },
      kriptonToken: { type: String, default: null },
      kriptonData: { type: Schema.Types.Mixed, default: null },
      // ── Pricing dinámico ────────────────────────────────────────────
      baseTotal: { type: Number, default: 0, min: 0 },
      surchargePercent: { type: Number, default: 0, min: 0 },
      surchargeAmount: { type: Number, default: 0, min: 0 },
      platformFeeAmount: { type: Number, default: 0, min: 0 },
      // ── Transferencia ───────────────────────────────────────────────
      transferConfirmed: { type: Boolean, default: false },
      transferConfirmedAt: { type: Date, default: null },
      transferConfirmedBy: { type: String, default: null },
    },
    notes: { type: String, default: '', trim: true },
    // Token del dispositivo consumer para enviar push cuando el pedido esté listo
    clientToken: { type: String, default: null, index: true },
    printed: { type: Boolean, default: false },
    statusTimestamps: {
      confirmedAt:      { type: Date, default: null },
      preparingAt:      { type: Date, default: null },
      readyAt:          { type: Date, default: null },
      enRutaAt:         { type: Date, default: null },
      arrivedAt:        { type: Date, default: null },
      deliveredAt:      { type: Date, default: null },
      cancelledAt:      { type: Date, default: null },
      estimatedReadyAt: { type: Date, default: null },
      customerEstimatedReadyAt: { type: Date, default: null },
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
    rewardDeductionProcessed: {
      type: Boolean,
      default: false,
    },
    source: {
      type: String,
      default: null,
      index: true,
    },
    // ── Delivery Confirmation (atestación mutua) ──────────────────────────────
    deliveryConfirmation: {
      type: {
        customerCode: {
          type: {
            code: { type: String, default: null },
            expiresAt: { type: Date, default: null },
          },
          default: null,
        },
        deliveryPersonId: {
          type: Schema.Types.ObjectId,
          ref: 'DeliveryPerson',
          default: null,
        },
        deliveryPersonName: { type: String, default: null },
        status: {
          type: String,
          enum: ['pending', 'assigned', 'en_ruta', 'arrived', 'completed', 'disputed'],
          default: 'pending',
        },
        arrivalLat: { type: Number, default: null },
        arrivalLng: { type: Number, default: null },
        arrivalAt: { type: Date, default: null },
        completedAt: { type: Date, default: null },
      },
      default: null,
    },
    // ── Delivery ─────────────────────────────────────────────────────────────
    deliveryAddress: {
      type: {
        street: { type: String, required: true },
        number: { type: String, required: true },
        apt:    { type: String, default: '' },
        city:   { type: String, required: true },
        coordinates: {
          type: { lat: { type: Number, required: true }, lng: { type: Number, required: true } },
          required: true,
        },
      },
      default: null,
    },
    deliveryCost: {
      type: Number,
      default: 0,
      min: 0,
    },
    deliveryDistance: {
      type: Number,
      default: 0,
      min: 0,
    },
    deliveryRangeApplied: {
      type: {
        fromKm: { type: Number, required: true },
        toKm:   { type: Number, required: true },
        price:  { type: Number, required: true },
      },
      default: null,
    },
    deletedAt: { type: Date, default: null, index: true },
  },
  {
    timestamps: true,
  }
)

OrderSchema.index({ tenantId: 1, createdAt: -1 })
OrderSchema.index({ tenantId: 1, locationId: 1, createdAt: -1 })
OrderSchema.index({ tenantId: 1, 'customer.phoneHash': 1 })  // tasa de recompra
OrderSchema.index({ tenantId: 1, scheduledPickupAt: 1, scheduledStatus: 1 })
OrderSchema.index({ groupSessionToken: 1 }, { sparse: true })

const Order = mongoose.models.Order || mongoose.model<IOrder>('Order', OrderSchema)
export default Order