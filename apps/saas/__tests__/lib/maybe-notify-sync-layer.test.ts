import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  notifySyncLayerStatus: vi.fn(async () => undefined),
}))

vi.mock("@/lib/sync-layer", () => ({
  notifySyncLayerStatus: mocks.notifySyncLayerStatus,
  pushOrderToSyncLayer: vi.fn(async () => undefined),
  confirmOrderPaymentCore: vi.fn(async () => undefined),
}))

vi.mock("@/lib/push", () => ({
  sendAdminPushNotification: vi.fn(async () => undefined),
}))

import { maybeNotifySyncLayerStatus } from "@/lib/order-side-effects"

type Args = Parameters<typeof maybeNotifySyncLayerStatus>[0]

function makeArgs(
  over: {
    order?: Record<string, unknown>
    tenant?: Record<string, unknown>
    status?: string
  } = {}
): Args {
  const args = {
    order: {
      _id: { toString: () => "oid123" },
      source: undefined as unknown,
      status: "preparing" as unknown,
      ...over.order,
    },
    tenant: {
      _id: { toString: () => "tid456" },
      features: { posEnabled: true } as unknown,
      ...over.tenant,
    },
    ...(over.status !== undefined ? { status: over.status } : {}),
  }
  return args as unknown as Args
}

beforeEach(() => {
  mocks.notifySyncLayerStatus.mockClear().mockResolvedValue(undefined)
})

describe("maybeNotifySyncLayerStatus (puerta SaaS → Sync)", () => {
  it("notifica al SyncLayer cuando el tenant tiene POS habilitado", () => {
    maybeNotifySyncLayerStatus(makeArgs({ order: { status: "preparing" } }))

    expect(mocks.notifySyncLayerStatus).toHaveBeenCalledTimes(1)
    expect(mocks.notifySyncLayerStatus).toHaveBeenCalledWith("tid456", "oid123", "preparing")
  })

  it("NO notifica si el tenant no tiene POS habilitado", () => {
    maybeNotifySyncLayerStatus(
      makeArgs({ tenant: { features: { posEnabled: false } }, order: { status: "preparing" } })
    )

    expect(mocks.notifySyncLayerStatus).not.toHaveBeenCalled()
  })

  it("NO notifica si features está ausente (tenant sin POS)", () => {
    maybeNotifySyncLayerStatus(
      makeArgs({ tenant: { features: undefined }, order: { status: "preparing" } })
    )

    expect(mocks.notifySyncLayerStatus).not.toHaveBeenCalled()
  })

  it("NO notifica órdenes creadas por el POS (source 'pos': sin registro en Sync)", () => {
    maybeNotifySyncLayerStatus(
      makeArgs({ order: { status: "preparing", source: "pos" } })
    )

    expect(mocks.notifySyncLayerStatus).not.toHaveBeenCalled()
  })

  it("NO notifica statuses que el POS no interpreta", () => {
    for (const status of ["awaiting_payment", "awaiting_confirmation", "pending", "open"]) {
      maybeNotifySyncLayerStatus(makeArgs({ order: { status } }))
    }

    expect(mocks.notifySyncLayerStatus).not.toHaveBeenCalled()
  })

  it("notifica todos los statuses del ciclo de vida del POS", () => {
    for (const status of [
      "confirmed",
      "preparing",
      "ready",
      "en_ruta",
      "arrived",
      "delivered",
      "cancelled",
    ]) {
      maybeNotifySyncLayerStatus(makeArgs({ order: { status } }))
    }

    expect(mocks.notifySyncLayerStatus).toHaveBeenCalledTimes(7)
  })

  it("usa el status explícito si se pasa por encima del de la orden", () => {
    maybeNotifySyncLayerStatus(makeArgs({ order: { status: "ready" }, status: "cancelled" }))

    expect(mocks.notifySyncLayerStatus).toHaveBeenCalledWith("tid456", "oid123", "cancelled")
  })

  it("si la notificación rechaza, no propaga la excepción", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    mocks.notifySyncLayerStatus.mockRejectedValueOnce(new Error("sync caído"))

    expect(() => maybeNotifySyncLayerStatus(makeArgs())).not.toThrow()

    errSpy.mockRestore()
  })
})
