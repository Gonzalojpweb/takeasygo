import mongoose, { Schema, Document } from 'mongoose'

// ============================================================================
// InventoryModifierRule — efecto de un modificador del POS sobre el consumo
// Colección: inventory_modifier_rules · DECISIONES_VIGENTES D-08
// ============================================================================
// "Extra queso" → +30 g de mozzarella por porción; "Sin cebolla" → −20 g.
// Se compara por nombre de opción normalizado (y grupo, si se indica): así
// una regla sirve para todos los platos que ofrecen ese modificador.
// ============================================================================

export interface IInventoryModifierRule extends Document {
  tenantId: mongoose.Types.ObjectId
  optionName: string
  optionKey: string
  groupName: string | null
  items: Array<{ skuId: mongoose.Types.ObjectId; quantity: number; unit: 'kg' | 'g' | 'l' | 'ml' | 'unit' }>
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const ModifierItemSchema = new Schema({
  skuId: { type: Schema.Types.ObjectId, ref: 'InventorySKU', required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, enum: ['kg', 'g', 'l', 'ml', 'unit'], required: true },
}, { _id: false })

const InventoryModifierRuleSchema = new Schema<IInventoryModifierRule>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  optionName: { type: String, required: true, trim: true, maxlength: 120 },
  optionKey: { type: String, required: true },
  groupName: { type: String, default: null, maxlength: 120 },
  items: { type: [ModifierItemSchema], default: [] },
  isActive: { type: Boolean, default: true },
}, { timestamps: true })

InventoryModifierRuleSchema.index({ tenantId: 1, optionKey: 1, groupName: 1 }, { unique: true, name: 'modifier_option' })

const InventoryModifierRule =
  (mongoose.models.InventoryModifierRule as mongoose.Model<IInventoryModifierRule>) ||
  mongoose.model<IInventoryModifierRule>('InventoryModifierRule', InventoryModifierRuleSchema, 'inventory_modifier_rules')
export default InventoryModifierRule
