// ─────────────────────────────────────────────────────────────────────────────
// /api/v1/customers — Búsqueda y perfil de clientes para el ROS
// ─────────────────────────────────────────────────────────────────────────────
// El ROS busca clientes al crear órdenes. El Sync Layer:
// 1. Busca por phoneHash o nameSearchToken en MongoDB (sin descifrar)
// 2. Descifra solo los resultados filtrados vía /internal/decrypt del SaaS
// 3. Aplica feature gate según el plan del tenant

import { Router, type Request, type Response } from "express"
import { ConsumerModel } from "@takeasygo/db"
import { TenantModel } from "@takeasygo/db"
import { canAccess, normalizeForSearch, type Plan } from "@takeasygo/business"
import { decryptNames } from "../services/internal-api"
import crypto from "crypto"

// ── Types ────────────────────────────────────────────────────────────────────

interface CustomerSearchResult {
  customerId: string
  name: string
  phone?: string
  email?: string
  totalOrders: number
  totalSpent: number
  lastOrderAt: Date | null
  isLoyaltyMember: boolean
  // Premium only
  segment?: string | null
  healthScore?: number | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function hashPhoneForSearch(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  const normalized = digits.length >= 10 ? digits.slice(-10) : digits
  return crypto.createHash("sha256").update(normalized).digest("hex")
}

function getBasicFields(consumer: any): CustomerSearchResult {
  return {
    customerId: consumer.customerId,
    name: "", // will be decrypted
    totalOrders: consumer.totalOrders ?? 0,
    totalSpent: consumer.totalSpent ?? 0,
    lastOrderAt: consumer.lastOrderAt ?? null,
    isLoyaltyMember: consumer.isLoyaltyMember ?? false,
  }
}

function getPremiumFields(consumer: any, profile?: any): CustomerSearchResult {
  return {
    ...getBasicFields(consumer),
    phone: "", // will be decrypted
    email: "", // will be decrypted
    segment: profile?.segment ?? null,
    healthScore: profile?.healthScore?.total ?? null,
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

export function customersRouter(): Router {
  const router = Router()

  // ── GET /api/v1/customers/search ──────────────────────────────────────────
  // Búsqueda de clientes para el ROS.
  // Query params: ?q=<nombre o teléfono> | ?phone=<teléfono exacto>
  router.get("/search", async (req: Request, res: Response) => {
    try {
      const tenantId = req.auth?.tenantId
      if (!tenantId) {
        return res.status(401).json({ error: "Missing tenant context" })
      }

      const q = (req.query.q as string || "").trim()
      const phone = (req.query.phone as string || "").trim()

      if (!q && !phone) {
        return res.status(400).json({ error: "q or phone parameter required" })
      }

      // 1. Get tenant plan for feature gate
      const tenant = await TenantModel.findById(tenantId).lean()
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" })
      }

      const plan: Plan = (tenant.plan as Plan) || "trial"
      const isPremium = canAccess(plan, "crm")

      // 2. Search by phoneHash or nameSearchToken
      let consumers: any[] = []

      if (phone) {
        // Exact phone search via phoneHash
        const phoneHash = hashPhoneForSearch(phone)
        consumers = await ConsumerModel.find({
          tenantIds: tenantId,
          phoneHash,
        })
          .limit(20)
          .lean()
      } else if (q) {
        // Check if query looks like a phone (digits only or starts with +)
        const isPhoneQuery = /^[\d+\s()-]+$/.test(q)

        if (isPhoneQuery) {
          // Search by phoneHash
          const phoneHash = hashPhoneForSearch(q)
          consumers = await ConsumerModel.find({
            tenantIds: tenantId,
            phoneHash,
          })
            .limit(20)
            .lean()
        }

        // Also search by nameSearchToken (regex)
        if (consumers.length === 0) {
          const normalizedQ = normalizeForSearch(q)
          consumers = await ConsumerModel.find({
            tenantIds: tenantId,
            nameSearchToken: { $regex: normalizedQ, $options: "i" },
          })
            .limit(20)
            .lean()
        }
      }

      if (consumers.length === 0) {
        return res.json({ customers: [], total: 0 })
      }

      // 3. Decrypt names via internal API
      const encryptedNames = consumers.map((c) => c.name).filter(Boolean)
      const decryptedNames = await decryptNames(encryptedNames)

      // Map decrypted names back to consumers
      const nameMap = new Map<string, string>()
      let nameIdx = 0
      for (const consumer of consumers) {
        if (consumer.name) {
          nameMap.set(consumer._id.toString(), decryptedNames[nameIdx] || "")
          nameIdx++
        }
      }

      // 4. Build response based on plan
      const results: CustomerSearchResult[] = consumers.map((consumer) => {
        const base = isPremium
          ? getPremiumFields(consumer)
          : getBasicFields(consumer)

        base.name = nameMap.get(consumer._id.toString()) || ""

        return base
      })

      // 5. For premium, also decrypt phone and email for each result
      if (isPremium) {
        const encryptedPhones = consumers
          .map((c) => c.phone)
          .filter(Boolean)
        const encryptedEmails = consumers
          .map((c) => c.email)
          .filter(Boolean)

        const [decryptedPhones, decryptedEmails] = await Promise.all([
          encryptedPhones.length > 0
            ? decryptNames(encryptedPhones)
            : Promise.resolve([]),
          encryptedEmails.length > 0
            ? decryptNames(encryptedEmails)
            : Promise.resolve([]),
        ])

        let phoneIdx = 0
        let emailIdx = 0
        for (const result of results) {
          const consumer = consumers.find(
            (c) => c.customerId === result.customerId
          )
          if (consumer?.phone) {
            result.phone = decryptedPhones[phoneIdx] || ""
            phoneIdx++
          }
          if (consumer?.email) {
            result.email = decryptedEmails[emailIdx] || ""
            emailIdx++
          }
        }
      }

      return res.json({ customers: results, total: results.length })
    } catch (error) {
      console.error("[customers] search error:", error)
      return res.status(500).json({ error: "Internal error" })
    }
  })

  // ── GET /api/v1/customers/:customerId/orders ──────────────────────────────
  // Historial de órdenes de un cliente (solo premium).
  router.get("/:customerId/orders", async (req: Request, res: Response) => {
    try {
      const tenantId = req.auth?.tenantId
      if (!tenantId) {
        return res.status(401).json({ error: "Missing tenant context" })
      }

      const { customerId } = req.params

      // Feature gate: orders history requires CRM (premium)
      const tenant = await TenantModel.findById(tenantId).lean()
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" })
      }

      const plan: Plan = (tenant.plan as Plan) || "trial"
      if (!canAccess(plan, "crm")) {
        return res
          .status(403)
          .json({ error: "CRM no disponible en tu plan actual." })
      }

      // Find consumer by customerId
      const consumer = await ConsumerModel.findOne({
        customerId,
        tenantIds: tenantId,
      }).lean()

      if (!consumer) {
        return res.status(404).json({ error: "Customer not found" })
      }

      // Query orders by customerId or phoneHash
      const orderFilter: Record<string, any> = {
        tenantId,
        deletedAt: null,
      }

      if (consumer.customerId) {
        orderFilter["customer.customerId"] = consumer.customerId
      } else if (consumer.phoneHash) {
        orderFilter["customer.phoneHash"] = consumer.phoneHash
      }

      // Use the SyncOrderModel from @takeasygo/db
      const { SyncOrderModel } = await import("@takeasygo/db")

      const page = Math.max(
        1,
        parseInt((req.query.page as string) || "1", 10)
      )
      const limit = Math.min(
        50,
        Math.max(1, parseInt((req.query.limit as string) || "10", 10))
      )

      const [orders, total] = await Promise.all([
        SyncOrderModel.find(orderFilter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        SyncOrderModel.countDocuments(orderFilter),
      ])

      return res.json({
        orders,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      })
    } catch (error) {
      console.error("[customers] orders error:", error)
      return res.status(500).json({ error: "Internal error" })
    }
  })

  return router
}
