/**
 * E validation — Socket room isolation test (staging).
 *
 * Validates that multi-sede POS socket connections only receive orders
 * for their own location. Connects two socket clients (Sede A, Sede B),
 * creates an order for Sede A, and verifies:
 *   - Sede A socket receives order:created
 *   - Sede B socket does NOT receive order:created
 *
 * Run from repo root:
 *   npx tsx --env-file=apps/sync/.env.staging apps/sync/scripts/e-validate/socket-isolation.ts
 *
 * Requires: Redis running locally, staging MongoDB accessible.
 * SAFETY: hard-guard on MONGODB_URI containing "takeasygo-staging".
 */

import { spawn, type ChildProcess } from "node:child_process"
import { writeFileSync, readFileSync, existsSync } from "node:fs"
import { resolve, join } from "node:path"
import mongoose from "mongoose"
import { io as SocketClient, type Socket } from "socket.io-client"
import {
  connectMongo,
  disconnectMongo,
  LocationModel,
  UserModel,
  SyncOrderModel,
} from "@takeasygo/db"
import { signJwt, verifyJwt } from "@takeasygo/business"

const ROOT = resolve(process.cwd())
const SYNC_DIR = join(ROOT, "apps", "sync")
const BASE_URL = "http://localhost:3001"
const OUT_DIR = join(SYNC_DIR, "scripts", "e-validate")

interface Check {
  id: string
  description: string
  pass: boolean
  detail: string
}

const checks: Check[] = []

function record(id: string, description: string, pass: boolean, detail: string): void {
  checks.push({ id, description, pass, detail })
  console.log(`[${pass ? "PASS" : "FAIL"}] ${id} — ${description}`)
  if (!pass) console.log(`       ${detail}`)
}

async function fetchWithTimeout(url: string, opts: RequestInit, ms = 15000): Promise<Response> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), ms)
  try {
    return await fetch(url, { ...opts, signal: ac.signal })
  } finally {
    clearTimeout(t)
  }
}

function connectSocket(jwt: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = SocketClient(BASE_URL, {
      auth: { token: jwt },
      transports: ["websocket"],
      reconnection: false,
      timeout: 5000,
    })

    socket.on("connect", () => resolve(socket))
    socket.on("connect_error", (err) => reject(err))
    setTimeout(() => reject(new Error("socket connect timeout")), 8000)
  })
}

async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI ?? ""
  if (!mongoUri.includes("takeasygo-staging")) {
    console.error("ABORT: MONGODB_URI must target takeasygo-staging.")
    process.exit(2)
  }

  const privatePem = existsSync(join(SYNC_DIR, "keys.private.pem"))
    ? readFileSync(join(SYNC_DIR, "keys.private.pem"), "utf-8")
    : ""
  const publicPem = existsSync(join(SYNC_DIR, "keys.public.pem"))
    ? readFileSync(join(SYNC_DIR, "keys.public.pem"), "utf-8")
    : ""

  if (!privatePem || !publicPem) {
    console.error("ABORT: JWT keypair not found in apps/sync/")
    process.exit(2)
  }

  // ─────────────────────────────────────────────────────────────────
  // 1. Spawn sync server
  // ─────────────────────────────────────────────────────────────────
  const serverLog = join(OUT_DIR, "socket-server.log")
  const logStream = await import("node:fs").then((fs) => fs.createWriteStream(serverLog, { flags: "w" }))

  console.log("[socket-test] spawning sync server...")
  const server: ChildProcess = spawn(
    process.execPath,
    [join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"), "--env-file=.env.staging", "src/index.ts"],
    { cwd: SYNC_DIR, stdio: ["ignore", "pipe", "pipe"], shell: false }
  )
  server.stdout?.pipe(logStream)
  server.stderr?.pipe(logStream)

  let serverUp = false
  try {
    for (let i = 0; i < 60; i++) {
      if (server.exitCode !== null) {
        throw new Error("sync server crashed on boot")
      }
      try {
        const res = await fetchWithTimeout(`${BASE_URL}/api/v1/health`, {}, 3000)
        if (res.ok) { serverUp = true; break }
      } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 1000))
    }
    if (!serverUp) throw new Error("server did not become healthy in time")
    console.log("[socket-test] server up")

    // ─────────────────────────────────────────────────────────────────
    // 2. Seed test data
    // ─────────────────────────────────────────────────────────────────
    await connectMongo()

    const tenantId = new mongoose.Types.ObjectId()
    const tenantIdStr = tenantId.toString()
    const locA = new mongoose.Types.ObjectId()
    const locB = new mongoose.Types.ObjectId()
    const locAStr = locA.toString()
    const locBStr = locB.toString()

    const tenants = mongoose.connection.db!.collection("tenants")
    const locations = mongoose.connection.db!.collection("locations")

    // Clean leftovers
    await LocationModel.deleteMany({ name: /^Socket Test/ })
    await UserModel.deleteMany({ email: "socket-test@takeasygo.test" })
    await tenants.deleteMany({ slug: "socket-test" })
    await SyncOrderModel.deleteMany({ tenantId: tenantIdStr })

    await tenants.insertOne({
      _id: tenantId,
      name: "Socket Test Tenant",
      slug: "socket-test",
      isActive: true,
      features: { posLocationGate: true },
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await locations.insertMany([
      { _id: locA, tenantId, name: "Socket Test Sede A", slug: "st-sede-a", address: "A", isActive: true, status: "active", settings: { acceptsOrders: true, orderModes: ["takeaway"] }, pos: { lastSeenAt: null }, createdAt: new Date(), updatedAt: new Date() },
      { _id: locB, tenantId, name: "Socket Test Sede B", slug: "st-sede-b", address: "B", isActive: true, status: "active", settings: { acceptsOrders: true, orderModes: ["takeaway"] }, pos: { lastSeenAt: null }, createdAt: new Date(), updatedAt: new Date() },
    ])

    await UserModel.create({
      name: "Socket Test User",
      email: "socket-test@takeasygo.test",
      pin: "5678",
      role: "admin",
      tenantId,
      isActive: true,
    })

    console.log("[socket-test] seed data created")

    // ─────────────────────────────────────────────────────────────────
    // 3. Create JWTs for each location (using private key for signing)
    // ─────────────────────────────────────────────────────────────────
    const jwtA = signJwt(
      { sub: "socket-test-user", tenantId: tenantIdStr, role: "admin", deviceType: "hub", locationId: locAStr },
      privatePem,
      5 * 60 * 1000 // 5 min TTL
    )
    const jwtB = signJwt(
      { sub: "socket-test-user", tenantId: tenantIdStr, role: "admin", deviceType: "hub", locationId: locBStr },
      privatePem,
      5 * 60 * 1000
    )
    const jwtLegacy = signJwt(
      { sub: "socket-test-user", tenantId: tenantIdStr, role: "admin", deviceType: "hub" },
      privatePem,
      5 * 60 * 1000
    )

    // Verify JWTs contain correct locationId
    const payloadA = verifyJwt(jwtA, publicPem)
    const payloadB = verifyJwt(jwtB, publicPem)
    const payloadLegacy = verifyJwt(jwtLegacy, publicPem)

    record(
      "S1",
      "JWT Sede A contiene locationId correcto",
      !!payloadA && (payloadA as any).locationId === locAStr,
      JSON.stringify(payloadA)
    )
    record(
      "S2",
      "JWT Sede B contiene locationId correcto",
      !!payloadB && (payloadB as any).locationId === locBStr,
      JSON.stringify(payloadB)
    )
    record(
      "S3",
      "JWT legacy NO contiene locationId",
      !!payloadLegacy && (payloadLegacy as any).locationId === undefined,
      JSON.stringify(payloadLegacy)
    )

    // ─────────────────────────────────────────────────────────────────
    // 4. Connect socket clients
    // ─────────────────────────────────────────────────────────────────
    console.log("[socket-test] connecting socket clients...")
    const socketA = await connectSocket(jwtA)
    const socketB = await connectSocket(jwtB)
    const socketLegacy = await connectSocket(jwtLegacy)

    record("S4", "Socket Sede A conectado", socketA.connected, `id=${socketA.id}`)
    record("S5", "Socket Sede B conectado", socketB.connected, `id=${socketB.id}`)
    record("S6", "Socket legacy conectado", socketLegacy.connected, `id=${socketLegacy.id}`)

    // Wait for server-side room assignment
    await new Promise((r) => setTimeout(r, 500))

    // ─────────────────────────────────────────────────────────────────
    // 5. Set up event listeners BEFORE creating order
    // ─────────────────────────────────────────────────────────────────
    const receivedA: any[] = []
    const receivedB: any[] = []
    const receivedLegacy: any[] = []

    socketA.on("order:created", (data) => receivedA.push(data))
    socketB.on("order:created", (data) => receivedB.push(data))
    socketLegacy.on("order:created", (data) => receivedLegacy.push(data))

    // ─────────────────────────────────────────────────────────────────
    // 6. Create order for Sede A via HTTP (using Sede A JWT)
    // ─────────────────────────────────────────────────────────────────
    console.log("[socket-test] creating order for Sede A...")
    const orderRes = await fetchWithTimeout(`${BASE_URL}/api/v1/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwtA}`,
      },
      body: JSON.stringify({
        items: [{ name: "Socket Test Item", quantity: 1, unitPrice: 500, total: 500 }],
        total: 500,
        paymentMethod: "cash",
      }),
    })
    const orderJson = await orderRes.json().catch(() => ({})) as any
    record(
      "S7",
      "POST /orders para Sede A → 201",
      orderRes.status === 201 && !!orderJson.orderId,
      JSON.stringify({ status: orderRes.status, body: orderJson })
    )

    // Wait for socket delivery
    await new Promise((r) => setTimeout(r, 2000))

    // ─────────────────────────────────────────────────────────────────
    // 7. Validate socket isolation
    // ─────────────────────────────────────────────────────────────────
    record(
      "S8",
      "Socket Sede A RECIBE order:created (su sede)",
      receivedA.length === 1 && receivedA[0]?.orderId === orderJson.orderId,
      JSON.stringify({ count: receivedA.length, orders: receivedA.map((e) => e.orderId) })
    )
    record(
      "S9",
      "Socket Sede B NO recibe order:created (sede ajena)",
      receivedB.length === 0,
      JSON.stringify({ count: receivedB.length, orders: receivedB.map((e) => e.orderId) })
    )
    record(
      "S10",
      "Socket legacy SÍ recibe order:created (todas las sedes)",
      receivedLegacy.length === 1 && receivedLegacy[0]?.orderId === orderJson.orderId,
      JSON.stringify({ count: receivedLegacy.length, orders: receivedLegacy.map((e) => e.orderId) })
    )

    // ─────────────────────────────────────────────────────────────────
    // 8. Verify order persisted with correct locationId
    // ─────────────────────────────────────────────────────────────────
    if (orderJson.orderId) {
      const syncOrder = await SyncOrderModel.findById(orderJson.orderId).lean()
      record(
        "S11",
        "sync_order persistido con locationId = Sede A",
        !!syncOrder && syncOrder.locationId === locAStr,
        JSON.stringify({ locationId: syncOrder?.locationId, expected: locAStr })
      )
    } else {
      record("S11", "sync_order persistido con locationId = Sede A", false, "orderId missing")
    }

    // ─────────────────────────────────────────────────────────────────
    // 9. Disconnect sockets
    // ─────────────────────────────────────────────────────────────────
    socketA.disconnect()
    socketB.disconnect()
    socketLegacy.disconnect()

    // ─────────────────────────────────────────────────────────────────
    // 10. Teardown
    // ─────────────────────────────────────────────────────────────────
    if (orderJson.orderId) {
      await SyncOrderModel.deleteOne({ _id: orderJson.orderId })
    }
    await UserModel.deleteMany({ email: "socket-test@takeasygo.test" })
    await LocationModel.deleteMany({ name: /^Socket Test/ })
    await tenants.deleteOne({ _id: tenantId })
    console.log("[socket-test] teardown complete")

    await disconnectMongo()
  } finally {
    logStream.end()
    server.kill()
    await new Promise((r) => setTimeout(r, 6000))
    if (server.exitCode === null) server.kill("SIGKILL")
  }

  // ─────────────────────────────────────────────────────────────────
  // 11. Write evidence
  // ─────────────────────────────────────────────────────────────────
  const passed = checks.filter((c) => c.pass).length
  const mdLines: string[] = [
    "# E — Socket Room Isolation Validation (staging)",
    "",
    `Fecha: ${new Date().toISOString()}`,
    "",
    `Resultado: **${passed}/${checks.length} checks**`,
    "",
    "| ID | Check | Resultado |",
    "|----|-------|-----------|",
    ...checks.map((c) => `| ${c.id} | ${c.description} | ${c.pass ? "PASS" : "FAIL"} |`),
    "",
    "## Detalle",
    "",
    ...checks.map((c) => `- **${c.id}** ${c.description}: ${c.pass ? "PASS" : "FAIL"} — \`${c.detail}\``),
    "",
    "## Diagrama de flujo",
    "",
    "```",
    "POS Sede A (JWT + locationId=A)          POS Sede B (JWT + locationId=B)",
    "  │                                          │",
    "  ├─ socket.join(tenant:X:location:A)        ├─ socket.join(tenant:X:location:B)",
    "  │  (NO join tenant:X)                      │  (NO join tenant:X)",
    "  │                                          │",
    "  │         POST /orders (JWT A)             │",
    "  │              │                           │",
    "  │              ▼                           │",
    "  │    emit tenant:X:location:A ◄─── receives │",
    "  │    emit tenant:X (legacy)    ◄─── receives│",
    "  │                                          │",
    "  │    emit tenant:X:location:B ──X── ignores│",
    "  │                                          │",
    "```",
  ]
  writeFileSync(join(OUT_DIR, "socket-evidence.md"), mdLines.join("\n"))
  writeFileSync(join(OUT_DIR, "socket-evidence.json"), JSON.stringify(checks, null, 2))

  console.log("\n[socket-test] evidence →", join(OUT_DIR, "socket-evidence.md"))
  process.exit(passed === checks.length ? 0 : 1)
}

main().catch((err) => {
  console.error("[socket-test] fatal:", err)
  process.exit(1)
})
