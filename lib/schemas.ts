import { z } from 'zod'

// ── Helpers ──────────────────────────────────────────────────────────────────

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'ID inválido')

// ── Orden (checkout público) ────────────────────────────────────────────────

const customizationOptionSchema = z.object({
  name: z.string().min(1).max(100),
})

const customizationGroupSchema = z.object({
  groupName: z.string().min(1).max(100),
  selectedOptions: z.array(customizationOptionSchema).max(20).default([]),
})

const orderItemSchema = z.object({
  menuItemId: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
  customizations: z.array(customizationGroupSchema).max(10).default([]),
  addedFrom: z.enum(['menu', 'upsell_sheet', 'checkout_banner']).optional(),
})

export const createOrderSchema = z.object({
  locationId: z.string().min(1),
  items: z.array(orderItemSchema).min(1).max(50),
  customer: z.object({
    name: z.string().min(1).max(100).trim(),
    phone: z.string().max(30).trim().default(''),
    email: z
      .string()
      .email()
      .optional()
      .or(z.literal(''))
      .transform(v => v ?? ''),
  }),
  notes: z.string().max(500).trim().default(''),
  clientToken: z.string().uuid().optional().nullable(),
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

// ── Leads (landing pública) ──────────────────────────────────────────────────

export const createLeadSchema = z.object({
  name:     z.string().min(1).max(100).trim(),
  business: z.string().min(1).max(150).trim(),
  email:    z.string().email().max(200).trim(),
  phone:    z.string().min(1).max(30).trim(),
  plan:     z.string().min(1).max(50).trim(),
  planId:   z.string().min(1).max(50).trim(),
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
  plan:    z.enum(['anfitrion', 'try', 'buy', 'full']).default('try'),
  isActive: z.boolean().default(true),
  // El resto de los campos opcionales del tenant se permiten pero limitados
  ownerName:  z.string().max(100).trim().optional(),
  ownerEmail: z.string().email().max(200).trim().optional().or(z.literal('')),
})
