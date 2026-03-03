import { z } from 'zod'

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
