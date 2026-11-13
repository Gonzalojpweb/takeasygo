import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { Product, Table } from "@takeasygo/types"
import { caeaPeriodOf } from "@takeasygo/business/browser"

/**
 * POS offline V2 — etapa 5 (12/11/2026): factura con CAEA y precuenta sin
 * internet. El equipo numera en su punto de venta exclusivo, imprime por la
 * red local con el ticket fiscal del server y manda el comprobante con el
 * cobro. Si no puede (sin kit, sin CAEA, Factura C), la factura queda
 * pendiente para el server, con el motivo a la vista.
 */

const posApiMock = vi.hoisted(() => vi.fn())
const stores = vi.hoisted(() => ({ tables: new Map<string, unknown>(), orders: new Map<string, unknown>(), menu: new Map<string, unknown>() }))

vi.mock("../db/dexie", () => {
  const clone = <T,>(v: T): T => structuredClone(v)
  const table = (store: Map<string, unknown>, key = "id") => ({
    get: async (id: string) => (store.has(id) ? clone(store.get(id)) : undefined),
    put: async (rec: Record<string, unknown>) => { store.set(rec[key] as string, clone(rec)); return rec[key] },
    update: async (id: string, changes: object) => { if (store.has(id)) store.set(id, { ...(store.get(id) as object), ...changes }) },
    where: (field: string) => ({
      equals: (value: unknown) => {
        const rows = () => [...store.values()].filter((r) => (r as Record<string, unknown>)[field] === value).map(clone)
        return { toArray: async () => rows(), and: () => ({ first: async () => undefined, toArray: async () => [] }) }
      },
    }),
  })
  return {
    db: {
      diningTable: table(stores.tables),
      orders: table(stores.orders),
      menuSnapshot: table(stores.menu, "tenantId"),
      cashRegister: table(new Map()),
      pendingMovements: table(new Map()),
      tenantConfig: { get: async () => undefined },
    },
  }
})

vi.mock("../services/pos-api", async () => {
  class PosApiError extends Error {
    code: string
    status: number
    constructor(message: string, code: string, status: number) { super(message); this.code = code; this.status = status }
  }
  return { PosApiError, isPosApiError: (e: unknown) => e instanceof PosApiError, posApi: (...a: unknown[]) => posApiMock(...a), posApiDownload: vi.fn() }
})
vi.mock("../services/sync-api", () => ({ notifyStatusToSyncLayer: vi.fn(async () => {}) }))

import { PosApiError } from "../services/pos-api"
import { createMemoryOfflineStore, setOfflineStore, offlineStore } from "../services/offline/store"
import { setOfflineStatus, __resetOfflineStatusForTests } from "../services/offline/status"
import { cachePrinters, setPrintAgent } from "../services/offline/local-print"
import { cacheFiscalKit, offlineFiscalAmounts, type OfflineFiscalKit } from "../services/offline/caea"
import { cacheLocation } from "../services/offline/local-precuenta"
import { createOrder, recordPayments, takeOfflineInvoiceReason } from "../services/order"
import { invoiceOrder, getFiscalConfig, type InvoiceChoice } from "../services/fiscal"
import { printPrecuenta } from "../services/table"
import "../services/offline/kinds"

const T = "64b000000000000000000001"
const CAJA = "6a0000000000000000000009"
const products: Partial<Product>[] = [{ id: "p-pizza", name: "Pizza", category: "Pizzas", printRole: "kitchen" }]
const pizza = { productId: "p-pizza", name: "Pizza", quantity: 1, unitPrice: 12_100, total: 12_100 }
const finalChoice: InvoiceChoice = { type: "final", companyCondition: "responsable_inscripto", docNumber: "", name: "" }

const now = new Date()
const { period, order: half } = caeaPeriodOf(now)
const KIT: OfflineFiscalKit = {
  available: true,
  environment: "homologation",
  pointOfSale: 90,
  issuer: { legalName: "Comercio SA", cuit: "30712345674", fiscalAddress: "Calle 1", grossIncomeNumber: "", activityStartDate: null, ivaCondition: "responsable_inscripto" },
  defaultIvaRate: 21,
  cfThresholdCents: 1_000_000_000,
  ivaRates: { "p-pizza": 21 },
  caeas: [{ period, order: half, caea: "31234567890123", validFrom: new Date(now.getTime() - 86_400_000).toISOString(), validTo: new Date(now.getTime() + 5 * 86_400_000).toISOString() }],
  lastNumbers: { "1": 0, "6": 5 },
}

let agentJobs: { id: string; printerName: string; payload: string }[] = []
const decode = (b64: string) => Array.from(atob(b64)).join("")
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)) }

beforeEach(async () => {
  __resetOfflineStatusForTests()
  setOfflineStore(createMemoryOfflineStore())
  Object.values(stores).forEach((m) => m.clear())
  stores.tables.set("t5", { id: "t5", tenantId: T, number: 5, capacity: 4, status: "occupied", guests: 2 } satisfies Table)
  stores.menu.set(T, { tenantId: T, products, categories: [], version: 1, updatedAt: new Date() })
  posApiMock.mockReset()
  posApiMock.mockRejectedValue(new PosApiError("Failed to fetch", "network", 0))
  setOfflineStatus({ online: false })
  await offlineStore().setMeta(`eligibility:${T}`, { enabled: true, role: "primary", name: "Caja", limit: 1, checkedAt: new Date().toISOString() })
  await cachePrinters(T, [{ id: CAJA, name: "Caja", paperWidth: 58, roles: ["cashier"], documents: ["factura", "precuenta"], printSettings: {} }])
  await setPrintAgent(T, { url: "http://127.0.0.1:7717", key: "K7P2-M9XQ" })
  await cacheFiscalKit(T, KIT)
  agentJobs = []
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { jobs: { id: string; printerName: string; payload: string }[] }
    agentJobs.push(...body.jobs)
    return new Response(JSON.stringify({ results: body.jobs.map((j) => ({ id: j.id, ok: true })) }), { status: 200 })
  }))
})

afterEach(() => vi.unstubAllGlobals())

async function payWithInvoice(id: string, choice: InvoiceChoice = finalChoice) {
  await createOrder(T, "t5", [pizza], undefined, undefined, { id, status: "confirmed" })
  await recordPayments(T, id, [{ id: `${id}-p`, method: "cash", amount: 12_100 }], "Pedido M5", { receiver: { condition: choice.type === "company" ? choice.companyCondition : "consumidor_final", docNumber: choice.docNumber, name: choice.name } })
  await settle()
  const ops = await offlineStore().listOps(T)
  return ops.find((o) => o.path === `/orders/${id}/payments`)!
}

describe("factura sin internet con CAEA", () => {
  it("numera en el punto de venta del equipo, imprime en la caja y viaja con el cobro", async () => {
    const op = await payWithInvoice("o1")
    const inv = (op.body as { invoice: { offlineCaea: Record<string, unknown> } }).invoice.offlineCaea
    expect(inv).toMatchObject({
      pointOfSale: 90, cbteTipo: 6, letter: "B", number: 6, caea: "31234567890123",
      receiver: { condition: "consumidor_final", docType: 99, docNumber: "0" },
      amounts: { totalCents: 12_100, netCents: 10_000, ivaCents: 2_100, exemptCents: 0 },
      ivaGroups: [{ ivaRate: 21, afipId: 5, baseCents: 10_000, amountCents: 2_100 }],
    })

    const factura = agentJobs.find((j) => j.id.endsWith(":factura"))!
    expect(factura.printerName).toBe("Caja")
    const text = decode(factura.payload)
    expect(text).toContain("FACTURA B  Cod. 006")
    expect(text).toContain("Nro 00090-00000006")
    expect(text).toContain("CAEA 31234567890123")
    expect(text).toContain("COMPROBANTE DE PRUEBA")
    expect(await offlineStore().getMeta(`printed:${op.id}`)).toEqual([CAJA])

    const summary = await invoiceOrder(T, "o1", finalChoice, takeOfflineInvoiceReason("o1"))
    expect(summary).toMatchObject({ status: "authorized", label: "Factura B 00090-00000006", cae: "31234567890123", caeaReportStatus: "pending" })
  })

  it("la siguiente factura sigue la numeración local", async () => {
    await payWithInvoice("o1")
    const op = await payWithInvoice("o2")
    expect((op.body as { invoice: { offlineCaea: { number: number } } }).invoice.offlineCaea.number).toBe(7)
  })

  it("Factura A a un responsable inscripto con CUIT", async () => {
    const op = await payWithInvoice("o3", { type: "company", companyCondition: "responsable_inscripto", docNumber: "20-12345678-6", name: "Cliente SA" })
    expect((op.body as { invoice: { offlineCaea: Record<string, unknown> } }).invoice.offlineCaea).toMatchObject({ letter: "A", cbteTipo: 1, number: 1, receiver: { docType: 80, docNumber: "20123456786" } })
  })

  it("sin CAEA vigente queda pendiente para el server y se dice por qué", async () => {
    await cacheFiscalKit(T, { ...KIT, caeas: [] })
    const op = await payWithInvoice("o4")
    expect((op.body as { invoice: Record<string, unknown> }).invoice.offlineCaea).toBeUndefined()
    expect(agentJobs.some((j) => j.id.endsWith(":factura"))).toBe(false)
    await expect(invoiceOrder(T, "o4", finalChoice, takeOfflineInvoiceReason("o4"))).rejects.toThrow(/queda pendiente.*CAEA vigente/)
  })

  it("el kit que no está disponible explica el motivo", async () => {
    await cacheFiscalKit(T, { available: false, reason: "Falta asignar el punto de venta de contingencia de este equipo" })
    await payWithInvoice("o5")
    expect(takeOfflineInvoiceReason("o5")).toMatch(/punto de venta de contingencia/)
  })

  it("el desglose suma exacto con descuento", () => {
    const { breakdown } = offlineFiscalAmounts({ items: [{ ...pizza, total: 12_100 }, { productId: "x", name: "Agua", quantity: 1, unitPrice: 1_000, total: 1_000 }], total: 12_000 }, KIT)
    expect(breakdown.totalCents).toBe(12_000)
    expect(breakdown.netCents + breakdown.ivaCents).toBe(12_000)
  })
})

describe("precuenta y configuración sin internet", () => {
  it("la precuenta sale por la red local con el ticket del server", async () => {
    await cacheLocation(T, { name: "Que Cachapa", timezone: "America/Argentina/Buenos_Aires" })
    await createOrder(T, "t5", [pizza], undefined, undefined, { id: "o6", status: "confirmed" })
    await settle()
    agentJobs = []
    const res = await printPrecuenta(T, "t5")
    expect(res).toEqual({ printerName: "Caja", total: 12_100 })
    const text = decode(agentJobs[0].payload)
    expect(text).toContain("QUE CACHAPA")
    expect(text).toContain("PRECUENTA")
    expect(text).toContain("Mesa 5 - 2 comensales")
    expect(text).toContain("NO VALIDO COMO FACTURA")
  })

  it("la configuración fiscal queda guardada para ofrecer factura sin internet", async () => {
    posApiMock.mockResolvedValueOnce({ enabled: true, mode: "ask", environment: "homologation", letterForFinalConsumer: "B", letterForCompany: "A", modality: "electronic" })
    expect((await getFiscalConfig(T)).enabled).toBe(true)
    expect(await getFiscalConfig(T)).toMatchObject({ enabled: true, letterForFinalConsumer: "B" })
  })
})
