import { z } from 'zod'

// ── Helpers ──────────────────────────────────────────────────────────────────

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'ID inválido')

// ── Orden (checkout público) ────────────────────────────────────────────────

const customizationOptionSchema: z.ZodType<any> = z.object({
  name: z.string().min(1).max(100),
  imageUrl: z.string().max(500).optional(),
  subGroups: z.array(z.lazy(() => customizationGroupSchema)).max(5).optional(),
})

const customizationGroupSchema: z.ZodType<any> = z.object({
  groupName: z.string().min(1).max(100),
  selectedOptions: z.array(customizationOptionSchema).max(20).default([]),
})

const selectedVariantSchema = z.object({
  name: z.string().min(1).max(100),
  price: z.number().min(0),
  takeawayPrice: z.number().min(0).nullish(),
  businessPrice: z.number().min(0).nullish(),
})

const rewardItemSchema = z.object({
  storeItemId: z.string().regex(/^[a-f\d]{24}$/i, 'ID de item inválido'),
})

const orderItemSchema = z.object({
  type: z.enum(['menuItem', 'promotion']).optional().default('menuItem'),
  menuItemId: z.string().optional(),
  promotionId: z.string().optional(),
  quantity: z.number().int().min(1).max(99),
  customizations: z.array(customizationGroupSchema).max(10).default([]),
  selectedVariant: selectedVariantSchema.optional(),
  addedFrom: z.enum(['menu', 'upsell_sheet', 'checkout_banner', 'promotion', 'group', 'best_sellers']).optional(),
})

const deliveryAddressSchema = z.object({
  street: z.string().min(1).max(100).trim(),
  number: z.string().min(1).max(20).trim(),
  apt: z.string().max(20).trim().optional().default(''),
  city: z.string().min(1).max(100).trim(),
})

export const createOrderSchema = z.object({
  locationId: z.string().min(1),
  items: z.array(orderItemSchema).min(1).max(50),
  customer: z.object({
    name: z.string().min(1).max(100).trim(),
    phone: z.string().max(30).trim().default(''),
    email: z
      .string()
      .regex(/^[^\s@]+@[^\s@]+$/, 'Email inválido')
      .optional()
      .or(z.literal(''))
      .transform(v => v ?? ''),
    birthDate: z.string().optional(), // formato YYYY-MM-DD
  }),
  notes: z.string().max(500).trim().default(''),
  mode: z.enum(['takeaway', 'dine-in', 'business', 'delivery']),
  clientToken: z.string().uuid().optional().nullable(),
  joinClub: z.boolean().optional().default(false),
  orderTiming: z.enum(['immediate', 'scheduled']).optional().default('immediate'),
  scheduledPickupAt: z.string().datetime().optional(),
  qrPromoApplied: z.boolean().optional().default(false),
  promoSlug: z.string().optional().nullable(),
  promoCode: z.string().optional().nullable(),
  rewardItems: z.array(rewardItemSchema).max(5).optional().default([]),
  loyaltyPointsRequired: z.number().int().min(0).optional().default(0),
  source: z.string().optional().nullable(),
  corporateAccountId: z.string().optional().nullable(),
  paymentModeSnapshot: z.enum(['cash_mp', 'deferred', 'mixed']).optional().nullable(),
  // ── Delivery ──────────────────────────────────────────────────────────────
  deliveryAddress: deliveryAddressSchema.optional(),
  deliveryCost: z.number().min(0).optional(),
  paymentMethod: z.enum(['mercadopago', 'kripton', 'transfer', 'cash']).optional().default('mercadopago'),
  baseTotal: z.number().min(0).optional(),
  surchargePercent: z.number().min(0).optional().default(0),
  sessionId: z.string().optional(),
})

export const deliveryQuoteSchema = z.object({
  locationId: z.string().min(1),
  address: deliveryAddressSchema,
})

export type CreateOrderInput = z.infer<typeof createOrderSchema>

// ── Forgot password ─────────────────────────────────────────────────────────

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

// ── Reset password ──────────────────────────────────────────────────────────

export const resetPasswordSchema = z.object({
  token: z.string().min(64).max(64),
  password: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .max(128),
})

// ── Payment preference ───────────────────────────────────────────────────────

export const createPaymentPreferenceSchema = z.object({
  orderId: objectIdSchema,
})

// ── Visit logging (menú público) ────────────────────────────────────────────

const slugRegex = /^[a-z0-9-]{2,50}$/

export const logVisitSchema = z.object({
  tenantSlug: z.string().regex(slugRegex, 'Slug inválido'),
  locationPath: z.string().optional(),
  promo: z.string().optional().nullable(),
})

// ── Leads (landing pública) ──────────────────────────────────────────────────

export const createLeadSchema = z.object({
  name:     z.string().min(1).max(100).trim(),
  business: z.string().min(1).max(150).trim(),
  email:    z.string().email().max(200).trim(),
  phone:    z.string().min(1).max(30).trim(),
  plan:     z.string().min(1).max(50).trim(),
  planId:   z.string().min(1).max(50).trim(),
  notes:    z.string().max(300).trim().optional().default(''),
})

// ── Network / contacto de restaurantes ──────────────────────────────────────

export const createNetworkSchema = z.object({
  nombre:           z.string().min(1).max(100).trim(),
  email:            z.string().email().max(200).trim(),
  telefono:         z.string().min(1).max(30).trim(),
  tipoRestaurante:  z.string().min(1).max(100).trim(),
  instagram:        z.string().max(100).trim().optional().default(''),
})

// ── Superadmin: crear usuario ────────────────────────────────────────────────

export const superadminCreateUserSchema = z.object({
  name:     z.string().min(1).max(100).trim(),
  email:    z.string().email().max(200).trim(),
  password: z.string().min(8).max(128),
  // superadmin no puede crearse desde la UI — solo los roles operativos
  role:     z.enum(['admin', 'manager', 'staff', 'cashier']),
  tenantId: objectIdSchema,
})

// ── Superadmin: crear tenant ─────────────────────────────────────────────────

export const superadminCreateTenantSchema = z.object({
  name:    z.string().min(2).max(100).trim(),
  slug:    z.string().regex(/^[a-z0-9-]{2,50}$/, 'Slug inválido — solo minúsculas, números y guiones'),
  plan:    z.enum(['trial', 'anfitrion', 'try', 'buy', 'full']).default('trial'),
  isActive: z.boolean().default(true),
  isOperational: z.boolean().default(true),
  // El resto de los campos opcionales del tenant se permiten pero limitados
  ownerName:  z.string().max(100).trim().optional(),
  ownerEmail: z.string().email().max(200).trim().optional().or(z.literal('')),
})
