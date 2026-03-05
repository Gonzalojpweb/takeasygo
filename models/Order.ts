import mongoose, { Schema, Document } from 'mongoose'

export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled'
export type PaymentStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface ISelectedCustomizationOption {
  name: string
  extraPrice: number
}

export interface ISelectedCustomizationGroup {
  groupName: string
  selectedOptions: ISelectedCustomizationOption[]
}

export interface IOrderItem {
  menuItemId: mongoose.Types.ObjectId
  name: string
  basePrice: number
  extraPrice: number
  price: number
  quantity: number
  subtotal: number
  customizations: ISelectedCustomizationGroup[]
}

export interface IPrintLogEntry {
  printerName: string
  role: string
  success: boolean
  error: string
  printedAt: Date
}

export interface IStatusTimestamps {
  confirmedAt:  Date | null
  preparingAt:  Date | null
  readyAt:      Date | null
  deliveredAt:  Date | null
  cancelledAt:  Date | null
}

export interface IOrder extends Document {
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  orderNumber: string
  status: OrderStatus
  items: IOrderItem[]
  total: number
  customer: {
    name: string
    phone: string
    email: string
  }
  payment: {
    status: PaymentStatus
    method: string
    mercadopagoId: string | null
    mercadopagoData: Record<string, any> | null
  }
  notes: string
  printed: boolean
  printLog: IPrintLogEntry[]
  statusTimestamps: IStatusTimestamps
  createdAt: Date
  updatedAt: Date
}

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
    required: true,
  },
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
})

const OrderSchema = new Schema<IOrder>(
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
      enum: ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'],
      default: 'pending',
    },
    items: [OrderItemSchema],
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    customer: {
      name: { type: String, required: true, trim: true },
      phone: { type: String, default: '', trim: true },
      email: { type: String, default: '', trim: true },
    },
    payment: {
      status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'cancelled'],
        default: 'pending',
      },
      method: { type: String, default: 'mercadopago' },
      mercadopagoId: { type: String, default: null },
      mercadopagoData: { type: Schema.Types.Mixed, default: null },
    },
    notes: { type: String, default: '', trim: true },
    printed: { type: Boolean, default: false },
    statusTimestamps: {
      confirmedAt: { type: Date, default: null },
      preparingAt: { type: Date, default: null },
      readyAt:     { type: Date, default: null },
      deliveredAt: { type: Date, default: null },
      cancelledAt: { type: Date, default: null },
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
  },
  {
    timestamps: true,
  }
)

OrderSchema.index({ tenantId: 1, createdAt: -1 })
OrderSchema.index({ tenantId: 1, locationId: 1, createdAt: -1 })
OrderSchema.index({ orderNumber: 1 })
OrderSchema.index({ tenantId: 1, 'customer.phone': 1 })  // tasa de recompra

const Order = mongoose.models.Order || mongoose.model<IOrder>('Order', OrderSchema)
export default Order