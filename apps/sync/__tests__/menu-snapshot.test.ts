import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest"
import express from "express"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"

// La carta que el servidor de sincronización le da al POS sin conexión usa la
// regla de mitad y mitad del comercio (igual que GET /api/[tenant]/pos/menu del
// SaaS) y trae los datos del catálogo comercial.

const mocks = vi.hoisted(() => ({ menus: [] as unknown[], tenant: null as unknown }))

vi.mock("@takeasygo/db", () => ({
  MenuModel: { find: () => ({ lean: async () => mocks.menus }) },
  TenantModel: { findById: () => ({ select: () => ({ lean: async () => mocks.tenant }) }) },
}))

import { menuRouter } from "../src/routes/menu"

const TENANT = "6500000000000000000000aa"
let server: Server
let base: string

beforeAll(async () => {
  const app = express()
  app.use((req, _res, next) => { (req as unknown as { auth: unknown }).auth = { tenantId: TENANT, locationId: null }; next() })
  app.use("/menu", menuRouter())
  server = createServer(app)
  await new Promise<void>((r) => server.listen(0, r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>((r) => server.close(() => r())))

beforeEach(() => {
  mocks.menus = [{
    tenantId: TENANT,
    categories: [{
      _id: "c1", name: "Pizzas",
      items: [
        { _id: "m", name: "Muzzarella", price: 1_000_000, halfPrice: 550_000, variants: [{ name: "Grande", price: 1_000_000 }] },
        { _id: "e", name: "Especial", price: 1_400_000, variants: [{ name: "Grande", price: 1_400_000 }] },
        {
          _id: "f", name: "Funda", price: 1_500_000,
          catalogLink: { productId: "p1", kind: "product", defaultVariantId: "v1", variantCodes: [{ variantId: "v1", name: "", code: "FUN", barcode: "779" }] },
        },
      ],
    }],
  }]
  mocks.tenant = null
})

async function snapshot() {
  const res = await fetch(`${base}/menu/snapshot`)
  expect(res.status).toBe(200)
  return res.json() as Promise<{ products: Array<{ id: string; halfPricing?: string; modifiers?: Array<{ name: string; options: Array<{ name: string; price: number }> }>; catalog?: unknown }> }>
}

const halfOptions = (p: { modifiers?: Array<{ name: string; options: Array<{ name: string; price: number }> }> } | undefined) =>
  p?.modifiers?.find((g) => g.name === "__half_first")?.options.map((o) => o.price)

describe("carta del POS sin conexión", () => {
  it("sin regla configurada: la más cara (cada sabor aporta su Grande)", async () => {
    const { products } = await snapshot()
    const muzza = products.find((p) => p.id === "m")
    expect(muzza?.halfPricing).toBe("max")
    expect(halfOptions(muzza)).toEqual([1_000_000, 1_400_000])
  })

  it("con la regla del comercio: suma de medias", async () => {
    mocks.tenant = { halfAndHalf: { pricing: "half_sum" } }
    const { products } = await snapshot()
    const muzza = products.find((p) => p.id === "m")
    expect(muzza?.halfPricing).toBe("half_sum")
    expect(halfOptions(muzza)).toEqual([550_000, 700_000])
  })

  it("trae los datos del catálogo comercial (código y código de barras)", async () => {
    const { products } = await snapshot()
    expect(products.find((p) => p.id === "f")?.catalog).toEqual({
      productId: "p1", kind: "product", defaultVariantId: "v1",
      variants: [{ variantId: "v1", name: "", code: "FUN", barcode: "779" }],
    })
  })
})
