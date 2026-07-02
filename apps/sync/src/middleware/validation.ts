import type { Request, Response, NextFunction } from "express"
import { z, type ZodSchema } from "zod"

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({
        error: "Validation failed",
        code: "validation_error",
        details: result.error.flatten().fieldErrors,
      })
      return
    }
    req.body = result.data
    next()
  }
}

export const loginSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("email"),
    email: z.string().email(),
    password: z.string().min(1),
  }),
  z.object({
    mode: z.literal("pin"),
    employeePin: z.string().min(4).max(8),
    tenantId: z.string(),
  }),
])

export const orderCreateSchema = z.object({
  source: z.literal("takeasygo"),
  items: z.array(
    z.object({
      productId: z.string(),
      name: z.string(),
      quantity: z.number().int().positive(),
      unitPrice: z.number().positive(),
      total: z.number().positive(),
      modifiers: z
        .array(
          z.object({
            name: z.string(),
            price: z.number(),
          })
        )
        .optional(),
    })
  ),
  total: z.number().positive(),
  customerId: z.string().optional(),
  notes: z.string().optional(),
})

export const syncReplaySchema = z.object({
  events: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      payload: z.unknown(),
      timestamp: z.string().datetime(),
      nonce: z.string(),
      signature: z.string(),
    })
  ),
})
