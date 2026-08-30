/**
 * E validation runner — multi-sede (locationId) on STAGING.
 *
 * Spawns the sync server (degraded Redis is tolerated: queues/workers only
 * log errors, rate limiter is in-memory), seeds synthetic staging data
 * (tenant + 3 locations + user with pin + 2 sync orders), executes HTTP
 * checks against the real routes, tears down the seed data and writes
 * evidence files.
 *
 * SAFETY: hard-guards on MONGODB_URI containing "takeasygo-staging".
 * It will refuse to run against any other database.
 *
 * Run from repo root:
 *   npx tsx --env-file=apps/sync/.env.staging apps/sync/scripts/e-validate/run.ts
 *
 * NOTE: Redis is required for `POST /orders` create/confirm flows
 * (BullMQ enqueue) — those are marked PENDING (validar post-infra).
 */

import { spawn, type ChildProcess } from "node:child_process"
import { writeFileSync, readFileSync, existsSync } from "node:fs"
import { resolve, join } from "node:path"
import mongoose from "mongoose"
import {
  connectMongo,
  disconnectMongo,
  LocationModel,
  UserModel,
  SyncOrderModel,
} from "@takeasygo/db"
import { verifyJwt } from "@takeasygo/business"

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

async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI ?? ""
  if (!mongoUri.includes("takeasygo-staging")) {
    console.error("ABORT: MONGODB_URI must target takeasygo-staging. Refusing to run.")
    process.exit(2)
  }

  const publicPem = existsSync(join(SYNC_DIR, "keys.public.pem"))
    ? readFileSync(join(SYNC_DIR, "keys.public.pem"), "utf-8")
    : ""

  // ─────────────────────────────────────────────────────────────────────
  // 1. Spawn the sync server (staging env, degraded Redis)
  // ─────────────────────────────────────────────────────────────────────
  const serverLog = join(OUT_DIR, "server.log")
  const logStream = await import("node:fs").then((fs) => fs.createWriteStream(serverLog, { flags: "w" }))

  console.log("[e-validate] spawning sync server (staging, degraded Redis)...")
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
        console.error("[e-validate] server exited early with code", server.exitCode)
        throw new Error("sync server crashed on boot")
      }
      try {
        const res = await fetchWithTimeout(`${BASE_URL}/api/v1/health`, {}, 3000)
        if (res.ok) {
          serverUp = true
          break
        }
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 1000))
    }
    if (!serverUp) throw new Error("server did not become healthy in time")
    console.log("[e-validate] server up →", BASE_URL)

    // ─────────────────────────────────────────────────────────────────
    // 2. Connect Mongo + seed synthetic staging data
    // ─────────────────────────────────────────────────────────────────
    await connectMongo()

    const tenantId = new mongoose.Types.ObjectId()
    const tenantIdStr = tenantId.toString()
    const locA = new mongoose.Types.ObjectId()
    const locB = new mongoose.Types.ObjectId()
    const locC = new mongoose.Types.ObjectId()
    const locAStr = locA.toString()
    const locBStr = locB.toString()
    const locCStr = locC.toString()

    const tenants = mongoose.connection.db!.collection("tenants")

    // Clean any leftovers from a previous (possibly partial) run
    await LocationModel.deleteMany({ name: /^E Sede/ })
    await UserModel.deleteMany({ email: "e-validate@takeasygo.test" })
    await tenants.deleteMany({ slug: "e-validate" })
    await SyncOrderModel.deleteMany({ $and: [{ tenantId: tenantIdStr }] })
    console.log("[e-validate] prior leftovers cleaned")

    await tenants.insertOne({
      _id: tenantId,
      name: "E Validate Staging",
      slug: "e-validate",
      isActive: true,
      features: { posLocationGate: true },
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Insert locations via raw collection (mirrors how the SaaS creates them —
    // the light LocationModel here intentionally does not define `slug`).
    const locations = mongoose.connection.db!.collection("locations")
    await locations.insertMany([
      { _id: locA, tenantId, name: "E Sede A", slug: "e-sede-a", address: "A", isActive: true, status: "active", settings: { acceptsOrders: true, orderModes: ["takeaway"] }, pos: { lastSeenAt: null }, createdAt: new Date(), updatedAt: new Date() },
      { _id: locB, tenantId, name: "E Sede B", slug: "e-sede-b", address: "B", isActive: true, status: "active", settings: { acceptsOrders: true, orderModes: ["takeaway"] }, pos: { lastSeenAt: null }, createdAt: new Date(), updatedAt: new Date() },
      { _id: locC, tenantId, name: "E Sede Inactiva", slug: "e-sede-inactiva", address: "C", isActive: false, status: "paused", settings: { acceptsOrders: false, orderModes: [] }, pos: { lastSeenAt: null }, createdAt: new Date(), updatedAt: new Date() },
    ])

    await UserModel.create({
      name: "E Validate",
      email: "e-validate@takeasygo.test",
      pin: "1234",
      role: "admin",
      tenantId,
      isActive: true,
    })

    const orderA = await SyncOrderModel.create({
      tenantId: tenantIdStr,
      locationId: locAStr,
      source: "takeasygo",
      status: "pending",
      externalOrderId: "e-val-a",
      items: [{ name: "Item A", quantity: 1, unitPrice: 100, total: 100 }],
      total: 100,
      menuVersion: 1,
      paymentMethod: "card",
    })
    const orderB = await SyncOrderModel.create({
      tenantId: tenantIdStr,
      locationId: locBStr,
      source: "takeasygo",
      status: "pending",
      externalOrderId: "e-val-b",
      items: [{ name: "Item B", quantity: 1, unitPrice: 200, total: 200 }],
      total: 200,
      menuVersion: 1,
      paymentMethod: "cash",
    })
    const orderAStr = orderA._id.toString()
    const orderBStr = orderB._id.toString()

    const internalSecret = process.env.INTERNAL_API_SECRET ?? ""

    const pinBody = (over: Record<string, unknown>) => ({
      mode: "pin",
      employeePin: "1234",
      tenantId: tenantIdStr,
      ...over,
    })

    // C1 — login with valid locationId → 200 + JWT claim locationId
    const c1 = await fetchWithTimeout(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pinBody({ locationId: locAStr })),
    })
    const c1Json = await c1.json().catch(() => ({}))
    const tokenA = (c1Json as any).accessToken as string | undefined
    const payloadA = tokenA && publicPem ? verifyJwt(tokenA, publicPem) : null
    record(
      "C1",
      "login pin con locationId válida → 200 + JWT con claim locationId",
      c1.status === 200 && !!payloadA && (payloadA as any).locationId === locAStr && (payloadA as any).deviceType === "hub" && (payloadA as any).role === "admin",
      JSON.stringify({ status: c1.status, payload: payloadA })
    )

    // C2 — login with inactive location → 400 INVALID_LOCATION
    const c2 = await fetchWithTimeout(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pinBody({ locationId: locCStr })),
    })
    const c2Json = await c2.json().catch(() => ({}))
    record(
      "C2",
      "login con sede inactiva → 400 INVALID_LOCATION",
      c2.status === 400 && (c2Json as any).code === "INVALID_LOCATION",
      JSON.stringify({ status: c2.status, body: c2Json })
    )

    // C3 — login with malformed locationId → 400 INVALID_LOCATION
    const c3 = await fetchWithTimeout(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pinBody({ locationId: "not-an-objectid" })),
    })
    const c3Json = await c3.json().catch(() => ({}))
    record(
      "C3",
      "login con locationId malformada → 400 INVALID_LOCATION",
      c3.status === 400 && (c3Json as any).code === "INVALID_LOCATION",
      JSON.stringify({ status: c3.status, body: c3Json })
    )

    // C4 — legacy login without locationId → 200, NO locationId claim
    const c4 = await fetchWithTimeout(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pinBody({})),
    })
    const c4Json = (await c4.json().catch(() => ({}))) as any
    const tokenNoLoc = c4Json.accessToken as string | undefined
    const payloadNoLoc = tokenNoLoc && publicPem ? verifyJwt(tokenNoLoc, publicPem) : null
    record(
      "C4",
      "login legacy sin locationId → 200, JWT sin claim locationId",
      c4.status === 200 && !!payloadNoLoc && (payloadNoLoc as any).locationId === undefined,
      JSON.stringify({ status: c4.status, locationId: (payloadNoLoc as any)?.locationId })
    )

    // C5 — GET /locations (JWT locA) → 2 sedes activas
    const c5 = await fetchWithTimeout(`${BASE_URL}/api/v1/locations`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    })
    const c5Json = (await c5.json().catch(() => ({}))) as any
    const locIds = (c5Json.locations ?? []).map((l: any) => l.id)
    record(
      "C5",
      "GET /locations → solo 2 sedes activas",
      c5.status === 200 && c5Json.locations?.length === 2 && locIds.includes(locAStr) && locIds.includes(locBStr) && !locIds.includes(locCStr),
      JSON.stringify(c5Json.locations)
    )

    // C6 — GET /orders/pending (JWT locA) → solo orden de sede A
    const c6 = await fetchWithTimeout(`${BASE_URL}/api/v1/orders/pending`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    })
    const c6Json = (await c6.json().catch(() => ({}))) as any
    record(
      "C6",
      "GET /orders/pending filtrado por sede → solo la de sede A",
      c6.status === 200 && Array.isArray(c6Json) && c6Json.length === 1 && c6Json[0]?.orderId === orderAStr,
      JSON.stringify(c6Json.map((o: any) => o.orderId))
    )

    // C7 — GET /orders/pending (legacy, sin sede) → ambas sedes
    const c7 = await fetchWithTimeout(`${BASE_URL}/api/v1/orders/pending`, {
      headers: { Authorization: `Bearer ${tokenNoLoc}` },
    })
    const c7Json = (await c7.json().catch(() => ({}))) as any
    record(
      "C7",
      "GET /orders/pending legacy → ambas sedes",
      c7.status === 200 && Array.isArray(c7Json) && c7Json.length === 2 && [orderAStr, orderBStr].every((id) => c7Json.some((o: any) => o.orderId === id)),
      JSON.stringify(c7Json.map((o: any) => o.orderId))
    )

    // C8 — internal GET /orders?locationId=locB → solo sede B + locationId persistido
    const c8 = await fetchWithTimeout(
      `${BASE_URL}/api/v1/internal/orders?tenantId=${tenantIdStr}&status=pending&locationId=${locBStr}`,
      { headers: { "X-Internal-Secret": internalSecret } }
    )
    const c8Json = (await c8.json().catch(() => ({}))) as any
    record(
      "C8",
      "internal GET /orders?locationId=B → solo sede B con locationId persistido",
      c8.status === 200 && Array.isArray(c8Json) && c8Json.length === 1 && c8Json[0]?.locationId === locBStr,
      JSON.stringify(c8Json)
    )

    // C9 — internal GET /orders (sin filtro) → ambas
    const c9 = await fetchWithTimeout(
      `${BASE_URL}/api/v1/internal/orders?tenantId=${tenantIdStr}&status=pending`,
      { headers: { "X-Internal-Secret": internalSecret } }
    )
    const c9Json = (await c9.json().catch(() => ({}))) as any
    record(
      "C9",
      "internal GET /orders sin filtro → ambas sedes",
      c9.status === 200 && Array.isArray(c9Json) && c9Json.length === 2,
      JSON.stringify(c9Json.map((o: any) => o.orderId))
    )

    // C10 — índice compuesto {tenantId, locationId, createdAt} presente en staging
    const indexes = await mongoose.connection.db!.collection("sync_orders").indexes()
    const hasIndex = indexes.some((ix: any) => {
      const k = Object.keys(ix.key)
      return k.join(",") === "tenantId,locationId,createdAt" && ix.key.tenantId === 1 && ix.key.locationId === 1 && ix.key.createdAt === -1
    })
    record(
      "C10",
      "índice compuesto tenantId+locationId+createdAt en sync_orders",
      hasIndex,
      JSON.stringify(indexes.map((ix: any) => ({ name: ix.name, key: ix.key })))
    )

    // ─────────────────────────────────────────────────────────────────
    // 3. Teardown seed data (staging only — guard above)
    // ─────────────────────────────────────────────────────────────────
    const delOrders = await SyncOrderModel.deleteMany({ _id: { $in: [orderA._id, orderB._id] } })
    const delLocs = await LocationModel.deleteMany({ _id: { $in: [locA, locB, locC] } })
    const delUser = await UserModel.deleteMany({ email: "e-validate@takeasygo.test" })
    const delTenant = await tenants.deleteOne({ _id: tenantId })
    console.log("[e-validate] teardown:", { delOrders: delOrders.deletedCount, delLocs: delLocs.deletedCount, delUser: delUser.deletedCount, delTenant: delTenant.deletedCount })

    await disconnectMongo()
  } finally {
    logStream.end()
    server.kill()
    // Give the graceful path a moment, then force-kill (BullMQ close hangs without Redis)
    await new Promise((r) => setTimeout(r, 6000))
    if (server.exitCode === null) {
      server.kill("SIGKILL")
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4. Write evidence
  // ─────────────────────────────────────────────────────────────────────
  const passed = checks.filter((c) => c.pass).length
  const mdLines: string[] = [
    "# E — Validación sync-layer (staging, Redis degradado)",
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
  ]
  writeFileSync(join(OUT_DIR, "evidence.md"), mdLines.join("\n"))
  writeFileSync(join(OUT_DIR, "evidence.json"), JSON.stringify(checks, null, 2))

  console.log("\n[e-validate] evidence →", join(OUT_DIR, "evidence.md"))
  process.exit(passed === checks.length ? 0 : 1)
}

main().catch((err) => {
  console.error("[e-validate] fatal:", err)
  process.exit(1)
})