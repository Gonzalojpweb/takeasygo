/**
 * Prueba integral multisede en STAGING — tenant chopisburger, 6 flags ON.
 *
 * Cobertura (por bloque, con evidencia):
 *   A. Numeración por sede: pedido público en Recoleta → número con prefijo REC-,
 *      pedido en Saavedra → SAA-. (flag numbering.perLocation ON + prefijos completos)
 *   B. Aislamiento por sede (strictLocationId=enforce): token POS sede A no lee
 *      ni escribe en sede B (403), sí en la propia (200).
 *   C. Reserva concurrente en Recoleta (modo automático, maxPerSlot=1): dos POST
 *      simultáneos al mismo slot → exactamente 1×201 y 1×409 (nunca 2×201).
 *   D. Numeración de reservas por sede: reservationNumber con prefijo REC-.
 *
 * Setup previo (idempotente, con backup): habilita reservationConfig en la sede
 * Recoleta de chopisburger (staging) para poder ejercitar el flujo de reservas.
 *
 * SAFETY:
 *   - Allowlist estricta: la base destino debe ser exactamente "takeasygo-staging".
 *   - SYNC_LAYER_URL vacío: ninguna escritura llega a la capa de sync de prod.
 *   - Restaura reservationConfig al terminar (finally).
 *
 * Run desde la raíz del repo:
 *   npx tsx apps/saas/scripts/e-gates/multisede-integral.ts
 */

import { spawn, type ChildProcess } from "node:child_process"
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs"
import { resolve, join } from "node:path"
import mongoose from "mongoose"
import { signJwt } from "@takeasygo/business/jwt"

const ROOT = resolve(process.cwd())
const SAAS_DIR = join(ROOT, "apps", "saas")
const SYNC_DIR = join(ROOT, "apps", "sync")
const OUT_DIR = join(ROOT, "docs")
const PORT = 3198
const BASE_URL = `http://localhost:${PORT}`
const NEXT_BIN = join(SAAS_DIR, "node_modules", "next", "dist", "bin", "next")

const ALLOWED_DB = "takeasygo-staging"
const TENANT_SLUG = "chopisburger"

function resolveDbName(uri: string): string {
  const withoutQuery = uri.split("?")[0]
  const afterScheme = withoutQuery.split("://").pop() ?? withoutQuery
  const afterHost = afterScheme.split("@").pop() ?? afterScheme
  const slash = afterHost.indexOf("/")
  if (slash === -1) return ""
  return (afterHost.slice(slash + 1).trim().split("/")[0] ?? "").trim()
}

interface Check {
  id: string
  block: string
  description: string
  pass: boolean
  detail: string
}
const checks: Check[] = []

function record(id: string, block: string, description: string, pass: boolean, detail: string): void {
  checks.push({ id, block, description, pass, detail })
  console.log(`[${pass ? "PASS" : "FAIL"}] ${id} (${block}) — ${description}`)
  if (!pass) console.log(`       ${detail}`)
}

async function fetchWithTimeout(url: string, opts: RequestInit, ms = 180000): Promise<Response> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), ms)
  try {
    return await fetch(url, { ...opts, signal: ac.signal })
  } finally {
    clearTimeout(t)
  }
}

function readStagingMongoUri(): string {
  const dotenvPath = join(SAAS_DIR, ".env.staging")
  if (!existsSync(dotenvPath)) throw new Error("apps/saas/.env.staging not found")
  for (const raw of readFileSync(dotenvPath, "utf-8").split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith("MONGODB_URI=")) {
      return line.slice("MONGODB_URI=".length).trim().replace(/^["']|["']$/g, "")
    }
  }
  throw new Error("MONGODB_URI not found in apps/saas/.env.staging")
}

interface SedeRow {
  _id: mongoose.Types.ObjectId
  name: string
  prefix?: string
  menuId?: mongoose.Types.ObjectId
  menuItemId?: mongoose.Types.ObjectId
  menuItemName?: string
  firstVariantName?: string
  firstVariantPrice?: number
}

async function main(): Promise<void> {
  const stagingUri = readStagingMongoUri()
  const dbName = resolveDbName(stagingUri)
  if (dbName !== ALLOWED_DB) {
    console.error(
      `ABORT (allowlist): la base destino debe ser exactamente "${ALLOWED_DB}". Detectada: "${dbName || "(sin nombre → prod)"}".`
    )
    process.exit(2)
  }

  const privatePem = existsSync(join(SYNC_DIR, "keys.private.pem"))
    ? readFileSync(join(SYNC_DIR, "keys.private.pem"), "utf-8")
    : ""
  if (!privatePem) {
    console.error("ABORT: JWT private key not found in apps/sync/")
    process.exit(2)
  }

  // ─────────────────────────────────────────────────────────────────
  // 1. Cargar tenant + sedes + menú de chopisburger (staging)
  // ─────────────────────────────────────────────────────────────────
  await mongoose.connect(stagingUri, { dbName: ALLOWED_DB })
  const db = mongoose.connection.db!
  const tenantsCol = db.collection("tenants")
  const locationsCol = db.collection("locations")
  const menusCol = db.collection("menus")

  const tenant = await tenantsCol.findOne({ slug: TENANT_SLUG })
  if (!tenant) {
    console.error(`ABORT: tenant ${TENANT_SLUG} no existe en staging`)
    process.exit(2)
  }
  const tenantId = tenant._id as mongoose.Types.ObjectId

  const locations = await locationsCol.find({ tenantId, isActive: true }).toArray()
  if (locations.length < 2) {
    console.error(`ABORT: ${TENANT_SLUG} necesita >=2 sedes activas (tiene ${locations.length})`)
    process.exit(2)
  }

  const sedes: SedeRow[] = []
  for (const l of locations) {
    const menu = await menusCol.findOne({ tenantId, locationId: l._id, isActive: true })
    let menuItemId: mongoose.Types.ObjectId | undefined
    let menuItemName: string | undefined
    if (menu && Array.isArray(menu.categories)) {
      outer: for (const c of menu.categories) {
        if (!Array.isArray(c.items)) continue
        for (const it of c.items) {
          if (it.isAvailable !== false && it._id) {
            menuItemId = it._id
            menuItemName = it.name
            if (Array.isArray(it.variants) && it.variants.length > 0) {
              firstVariantName = it.variants[0].name
              firstVariantPrice = Number(it.variants[0].price) || 0
            }
            break outer
          }
        }
      }
    }
    sedes.push({
      _id: l._id as mongoose.Types.ObjectId,
      name: l.name,
      prefix: (l as any).prefix,
      menuId: menu?._id as mongoose.Types.ObjectId | undefined,
      menuItemId,
      menuItemName,
      firstVariantName,
      firstVariantPrice,
    })
  }
  console.log(
    `[setup] sedes: ${sedes.map((s) => `${s.name}(${s.prefix}) item=${s.menuItemName ?? "NONE"}`).join(", ")}`
  )

  // ─────────────────────────────────────────────────────────────────
  // 2. Setup: habilitar reservationConfig en la sede Reconleta (backup)
  // ─────────────────────────────────────────────────────────────────
  const targetSede = sedes[0]
  const locDoc = await locationsCol.findOne({ _id: targetSede._id })
  const prevReservationConfig = locDoc?.reservationConfig ?? null

  // Ventana: mañana, 12:00–14:00, intervalo 30min, 1 por slot.
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const dayStr = tomorrow.toISOString().slice(0, 10)

  // Limpiar residuos de corridas anteriores: reservas "integral e2e" en la
  // fecha objetivo. Sin esto, la reserva ganadora previa (blockDuration 90min)
  // tapa el slot y ambas intents dan 409.
  const reservationsCol = db.collection("reservations")
  const cleanup = await reservationsCol.deleteMany({
    locationId: targetSede._id,
    date: dayStr,
    notes: /integral e2e/,
  })
  console.log(`[setup] residuos de reservas limpiados: ${cleanup.deletedCount}`)

  const enabledConfig = {
    enabled: true,
    minPayment: 0,
    maxPartySize: 10,
    timeSlots: [],
    slotConfig: {
      enabled: true,
      operatingHours: [{ days: [0, 1, 2, 3, 4, 5, 6], open: "12:00", close: "14:00" }],
      slotIntervalMinutes: 30,
      blockDurationMinutes: 90,
      maxReservationsPerSlot: 1,
    },
  }
  await locationsCol.updateOne(
    { _id: targetSede._id },
    { $set: { reservationConfig: enabledConfig } }
  )
  console.log(
    `[setup] reservationConfig habilitado en ${targetSede.name} para ${dayStr} 12:00–14:00 (backup previo en memoria)`
  )

  // Saavedra tiene serviceHours.takeaway con ventanas reales (12:00–15:30 etc).
  // Si "ahora" cae fuera, el pedido takeaway se rechaza y A2 no prueba
  // numeración. Neutralizamos (backup + restore en finally).
  const sedeBRow = sedes[1]
  const locBDoc = await locationsCol.findOne({ _id: sedeBRow._id })
  const prevServiceHours = locBDoc?.serviceHours ?? null
  await locationsCol.updateOne(
    { _id: sedeBRow._id },
    { $set: { serviceHours: { takeaway: [], dineIn: [], delivery: [] } } }
  )
  console.log(`[setup] serviceHours de ${sedeBRow.name} neutralizado (backup en memoria)`)

  // ─────────────────────────────────────────────────────────────────
  // 3. Spawn Next dev (SaaS) apuntado a staging
  // ─────────────────────────────────────────────────────────────────
  mkdirSync(OUT_DIR, { recursive: true })
  const serverLog = join(OUT_DIR, "multisede-integral-server.log")
  const logStream = await import("node:fs").then((fs) => fs.createWriteStream(serverLog, { flags: "w" }))

  console.log(`[integral] spawning next dev :${PORT} ...`)
  const env = {
    ...process.env,
    MONGODB_URI: stagingUri,
    SYNC_LAYER_URL: "",
    NEXTAUTH_URL: BASE_URL,
    NEXT_TELEMETRY_DISABLED: "1",
  }
  const server: ChildProcess = spawn(
    process.execPath,
    [NEXT_BIN, "dev", "--webpack", "--port", String(PORT)],
    { cwd: SAAS_DIR, env, stdio: ["ignore", "pipe", "pipe"], shell: false }
  )
  server.stdout?.pipe(logStream)
  server.stderr?.pipe(logStream)

  let serverUp = false
  try {
    for (let i = 0; i < 24; i++) {
      if (server.exitCode !== null) throw new Error(`next dev exited early (${server.exitCode})`)
      try {
        const res = await fetchWithTimeout(`${BASE_URL}/api/__ready__`, {}, 30000)
        if (res.status < 500) { serverUp = true; break }
      } catch { /* not ready */ }
      await new Promise((r) => setTimeout(r, 5000))
    }
    if (!serverUp) throw new Error("next dev did not become ready in time")
    console.log("[integral] next up")

    // Warm-up: compilar las rutas que vamos a ejercitar (compilación lazy en dev).
    console.log("[integral] warming up routes (orders, reservas)...")
    for (const path of ["/orders", "/reservas"]) {
      try {
        await fetchWithTimeout(`${BASE_URL}/api/${TENANT_SLUG}${path}`, {}, 180000)
      } catch { /* warm-up best-effort */ }
    }
    console.log("[integral] warm-up done")

    // ───────────────────────────────────────────────────────────────
    // 4. A. Numeración por sede (pedido público)
    // ───────────────────────────────────────────────────────────────
    const phone = () => `+54911${Math.floor(10000000 + Math.random() * 89999999)}`
    const postOrder = async (sede: SedeRow) => {
      if (!sede.menuItemId) throw new Error(`sin menuItemId para ${sede.name}`)
      const item: Record<string, unknown> = {
        type: "menuItem",
        menuItemId: sede.menuItemId.toString(),
        quantity: 1,
      }
      if (sede.firstVariantName) {
        item.selectedVariant = { name: sede.firstVariantName, price: sede.firstVariantPrice ?? 0 }
      }
      const res = await fetchWithTimeout(`${BASE_URL}/api/${TENANT_SLUG}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId: sede._id.toString(),
          items: [item],
          customer: { name: "Integral Test", phone: phone() },
          mode: "takeaway",
          orderTiming: "immediate",
        }),
      })
      const body = await res.json().catch(() => ({}) as any)
      return { status: res.status, body: body as any }
    }

    const orderA = await postOrder(sedeA(sedes))
    const orderB = await postOrder(sedeB(sedes))

    const numA = orderA.body?.order?.orderNumber ?? orderA.body?.orderNumber ?? orderA.body?.number
    const numB = orderB.body?.order?.orderNumber ?? orderB.body?.orderNumber ?? orderB.body?.number
    const prefixA = sedeA(sedes).prefix
    const prefixB = sedeB(sedes).prefix

    record(
      "A1", "numeracion",
      `pedido ${sedeA(sedes).name} → número con prefijo ${prefixA}-`,
      orderA.status < 400 && typeof numA === "string" && numA.startsWith(`${prefixA}-`),
      `status=${orderA.status} num=${numA} body=${JSON.stringify(orderA.body).slice(0, 200)}`
    )
    record(
      "A2", "numeracion",
      `pedido ${sedeB(sedes).name} → número con prefijo ${prefixB}-`,
      orderB.status < 400 && typeof numB === "string" && numB.startsWith(`${prefixB}-`),
      `status=${orderB.status} num=${numB} body=${JSON.stringify(orderB.body).slice(0, 300)}`
    )

    // ───────────────────────────────────────────────────────────────
    // 5. B. Aislamiento por sede (strictLocationId=enforce)
    // ───────────────────────────────────────────────────────────────
    const [sA, sB] = [sedeA(sedes), sedeB(sedes)]
    // sub debe ser un ObjectId (los tokens reales del POS usan el _id del
    // usuario). Un string no-ObjectId revienta UserLocationRole.find con
    // CastError cuando rbac.sedeScope está ON (no es un bug de prod).
    const probeUserId = new mongoose.Types.ObjectId().toString()
    const token = signJwt(
      {
        sub: probeUserId,
        tenantId: tenantId.toString(),
        role: "admin",
        deviceType: "pos",
        locationId: sA._id.toString(),
      } as any,
      privatePem,
      10 * 60 * 1000
    )
    const reqAuth = (path: string, opts: RequestInit = {}) =>
      fetchWithTimeout(`${BASE_URL}/api/${TENANT_SLUG}${path}`, {
        ...opts,
        headers: { Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
      })

    const own = await reqAuth(`/orders?locationId=${sA._id}`)
    record("B1", "aislamiento", "enforce: GET /orders sede propia → 200", own.status === 200, `status=${own.status}`)

    const foreign = await reqAuth(`/orders?locationId=${sB._id}`)
    record("B2", "aislamiento", "enforce: GET /orders sede ajena → 403", foreign.status === 403, `status=${foreign.status}`)

    const foreignRes = await reqAuth(`/reservas?locationId=${sB._id}`)
    const foreignResBody = await foreignRes.json().catch(() => ({})) as any
    record(
      "B3", "aislamiento",
      "enforce: GET /reservas sede ajena → 403",
      foreignRes.status === 403,
      `status=${foreignRes.status} body=${JSON.stringify(foreignResBody).slice(0, 300)}`
    )

    // ───────────────────────────────────────────────────────────────
    // 6. C+D. Reserva concurrente en Reconleta + numeración de reserva
    // ───────────────────────────────────────────────────────────────
    const slotTime = "12:30"
    const reservaNBody = (nm: string) => ({
      locationId: sA._id.toString(),
      date: dayStr,
      time: slotTime,
      partySize: 2,
      name: nm,
      phone: phone(),
      email: `${nm.toLowerCase().replace(/\s/g, "-")}@e2e.test`,
      notes: "integral e2e",
    })

    const [r1, r2] = await Promise.all([
      fetchWithTimeout(`${BASE_URL}/api/${TENANT_SLUG}/reservas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reservaNBody("Concurrente Uno")),
      }).then(async (res) => ({ status: res.status, body: await res.json().catch(() => ({})) as any })),
      fetchWithTimeout(`${BASE_URL}/api/${TENANT_SLUG}/reservas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reservaNBody("Concurrente Dos")),
      }).then(async (res) => ({ status: res.status, body: await res.json().catch(() => ({})) as any })),
    ])

    const statuses = [r1.status, r2.status].sort()
    const winners = [r1, r2].filter((r) => r.status === 201)
    const losers = [r1, r2].filter((r) => r.status === 409)
    record(
      "C1", "concurrencia",
      `2 reservas concurrentes mismo slot → exactamente 1×201 y 1×409 (maxPerSlot=1)`,
      winners.length === 1 && losers.length === 1,
      `statuses=[${statuses.join(",")}] r1=${r1.status} r2=${r2.status} err=${JSON.stringify(losers[0]?.body).slice(0, 120)}`
    )

    const winnerRes = winners[0]?.body?.reservation
    const resNum = winnerRes?.reservationNumber
    record(
      "D1", "numeracion-reserva",
      `reservationNumber de reserva ${sA.name} → prefijo ${sA.prefix}-`,
      typeof resNum === "string" && resNum.startsWith(`${sA.prefix}-`),
      `reservationNumber=${resNum}`
    )
  } finally {
    // ───────────────────────────────────────────────────────────────
    // 7. Restore reservationConfig original
    // ───────────────────────────────────────────────────────────────
    if (prevReservationConfig === null) {
      await locationsCol.updateOne({ _id: targetSede._id }, { $unset: { reservationConfig: "" } })
    } else {
      await locationsCol.updateOne(
        { _id: targetSede._id },
        { $set: { reservationConfig: prevReservationConfig } }
      )
    }
    console.log("[integral] reservationConfig restaurado")

    if (prevServiceHours === null) {
      await locationsCol.updateOne({ _id: sedeBRow._id }, { $unset: { serviceHours: "" } })
    } else {
      await locationsCol.updateOne(
        { _id: sedeBRow._id },
        { $set: { serviceHours: prevServiceHours } }
      )
    }
    console.log("[integral] serviceHours restaurado")

    await mongoose.disconnect()

    logStream.end()
    server.kill()
    await new Promise((r) => setTimeout(r, 6000))
    if (server.exitCode === null) server.kill("SIGKILL")
  }

  // ─────────────────────────────────────────────────────────────────
  // 8. Evidencia
  // ─────────────────────────────────────────────────────────────────
  const passed = checks.filter((c) => c.pass).length
  const md = [
    "# Prueba integral multisede en staging — chopisburger (6 flags ON)",
    "",
    `Fecha: ${new Date().toISOString()}`,
    "",
    `Resultado: **${passed}/${checks.length} checks**`,
    "",
    "| ID | Bloque | Check | Resultado |",
    "|----|--------|-------|-----------|",
    ...checks.map((c) => `| ${c.id} | ${c.block} | ${c.description} | ${c.pass ? "PASS" : "FAIL"} |`),
    "",
    "## Detalle",
    "",
    ...checks.map((c) => `- **${c.id}** (${c.block}) ${c.description}: ${c.pass ? "PASS" : "FAIL"} — \`${c.detail}\``),
  ]
  writeFileSync(join(OUT_DIR, "multisede-integral-evidence.md"), md.join("\n"))
  writeFileSync(join(OUT_DIR, "multisede-integral-evidence.json"), JSON.stringify(checks, null, 2))

  console.log(`\n[integral] evidence → ${join(OUT_DIR, "multisede-integral-evidence.md")}`)
  console.log(`[integral] resultado: ${passed}/${checks.length}`)
  process.exit(passed === checks.length ? 0 : 1)
}

function sedeA(sedes: SedeRow[]): SedeRow {
  return sedes[0]
}
function sedeB(sedes: SedeRow[]): SedeRow {
  return sedes[1]
}

main().catch((err) => {
  console.error("[integral] fatal:", err)
  process.exit(1)
})
