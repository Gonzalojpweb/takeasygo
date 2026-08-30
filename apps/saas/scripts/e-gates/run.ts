/**
 * E gates validation — SaaS `POST /api/[tenant]/orders` (ORDERS_CLOSED / NO_POS_ACTIVE) on STAGING.
 *
 * Spawns Next dev (SaaS) pointed at takeasygo-staging (MONGODB_URI override),
 * with SYNC_LAYER_URL forced empty so no push can ever reach the prod sync
 * layer. Seeds a synthetic tenant + sede, runs the gate matrix, tears down.
 *
 * SAFETY: refuses to run unless MONGODB_URI (from .env.staging) contains
 * "takeasygo-staging".
 *
 * Run from repo root:
 *   npx tsx apps/saas/scripts/e-gates/run.ts
 */

import { spawn, type ChildProcess } from "node:child_process"
import { writeFileSync, readFileSync, existsSync } from "node:fs"
import { resolve, join } from "node:path"
import mongoose from "mongoose"

const ROOT = resolve(process.cwd())
const SAAS_DIR = join(ROOT, "apps", "saas")
const OUT_DIR = join(SAAS_DIR, "scripts", "e-gates")
const BASE_URL = "http://localhost:3000"
const NEXT_BIN = join(SAAS_DIR, "node_modules", "next", "dist", "bin", "next")
const SLUG = "e-gates"

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

async function fetchWithTimeout(url: string, opts: RequestInit, ms = 30000): Promise<Response> {
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

async function main(): Promise<void> {
  const stagingUri = readStagingMongoUri()
  if (!stagingUri.includes("takeasygo-staging")) {
    console.error("ABORT: MONGODB_URI must target takeasygo-staging. Refusing to run.")
    process.exit(2)
  }
  if (!existsSync(NEXT_BIN)) {
    console.error("ABORT: next binary not found at", NEXT_BIN)
    process.exit(2)
  }

  // ─────────────────────────────────────────────────────────────────────
  // 1. Spawn Next dev (SaaS) against staging, sync push disabled
  // ─────────────────────────────────────────────────────────────────────
  const serverLog = join(OUT_DIR, "server.log")
  const logStream = await import("node:fs").then((fs) =>
    fs.createWriteStream(serverLog, { flags: "w" })
  )

  console.log("[e-gates] spawning Next dev (SaaS, staging, sync push disabled)...")
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    MONGODB_URI: stagingUri,
    SYNC_LAYER_URL: "",
    NEXTAUTH_URL: BASE_URL,
    NEXT_TELEMETRY_DISABLED: "1",
  }
  const server: ChildProcess = spawn(
    process.execPath,
    [NEXT_BIN, "dev", "--port", "3000"],
    { cwd: SAAS_DIR, env, stdio: ["ignore", "pipe", "pipe"], shell: false }
  )
  server.stdout?.pipe(logStream)
  server.stderr?.pipe(logStream)

  let serverUp = false
  try {
    for (let i = 0; i < 6; i++) {
      if (server.exitCode !== null) {
        console.error("[e-gates] next exited early with code", server.exitCode)
        throw new Error("next dev crashed on boot")
      }
      try {
        const res = await fetchWithTimeout(`${BASE_URL}/api/${SLUG}/orders`, {}, 30000)
        if (res.status !== 500 && res.status !== 503) {
          serverUp = true
          console.log(`[e-gates] next up (GET /orders → ${res.status})`)
          break
        }
      } catch {
        /* not ready yet */
      }
      await new Promise((r) => setTimeout(r, 5000))
    }
    if (!serverUp) throw new Error("next dev did not become ready in time")

    // ─────────────────────────────────────────────────────────────────
    // 2. Seed synthetic staging data (tenant + sede)
    // ─────────────────────────────────────────────────────────────────
    await mongoose.connect(stagingUri)

    const tenants = mongoose.connection.db!.collection("tenants")
    const locations = mongoose.connection.db!.collection("locations")
    await tenants.deleteMany({ slug: SLUG })
    await locations.deleteMany({ name: /^E Gate Sede/ })
    console.log("[e-gates] prior leftovers cleaned")

    const tenantId = new mongoose.Types.ObjectId()
    const locationId = new mongoose.Types.ObjectId()
    const now = new Date()

    await tenants.insertOne({
      _id: tenantId,
      name: "E Gates Staging",
      slug: SLUG,
      status: "active",
      isActive: true,
      features: { posLocationGate: true },
      createdAt: now,
      updatedAt: now,
    })
    await locations.insertOne({
      _id: locationId,
      tenantId,
      name: "E Gate Sede",
      slug: "e-gate-sede",
      address: "Test",
      isActive: true,
      status: "active",
      settings: { acceptsOrders: true, orderModes: ["takeaway"] },
      pos: { lastSeenAt: null },
      createdAt: now,
      updatedAt: now,
    })

    const phone = `+54911${Math.floor(10000000 + Math.random() * 89999999)}`
    const body = {
      locationId: locationId.toString(),
      items: [{ type: "menuItem", menuItemId: "000000000000000000000000", quantity: 1 }],
      customer: { name: "Gate Test", phone },
      mode: "takeaway",
      orderTiming: "immediate",
    }
    const post = async () => {
      const res = await fetchWithTimeout(`${BASE_URL}/api/${SLUG}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      return { status: res.status, body: json as any }
    }
    const setLocation = (patch: Record<string, unknown>) =>
      locations.updateOne({ _id: locationId }, { $set: patch })
    const setTenant = (patch: Record<string, unknown>) =>
      tenants.updateOne({ _id: tenantId }, { $set: patch })

    // G2 — posLocationGate on, no heartbeat → 409 NO_POS_ACTIVE
    await setLocation({ "settings.acceptsOrders": true, "pos.lastSeenAt": null })
    const g2 = await post()
    record(
      "G2",
      "posLocationGate:true sin heartbeat POS → 409 NO_POS_ACTIVE",
      g2.status === 409 && g2.body.code === "NO_POS_ACTIVE",
      JSON.stringify({ status: g2.status, code: g2.body.code })
    )

    // G3 — fresh heartbeat → gate pasa (sigue a 404 menú, NOT 409)
    await setLocation({ "pos.lastSeenAt": new Date() })
    const g3 = await post()
    record(
      "G3",
      "posLocationGate:true con heartbeat fresco → NO 409 (404 menú = gate superado)",
      g3.status === 404 && g3.body.error?.toLowerCase().includes("menú"),
      JSON.stringify({ status: g3.status, body: g3.body })
    )

    // G4 — legacy: posLocationGate off, sin heartbeat → NO gate
    await setTenant({ "features.posLocationGate": false })
    await setLocation({ "pos.lastSeenAt": null })
    const g4 = await post()
    record(
      "G4",
      "posLocationGate off sin heartbeat → NO gate (404 menú = legacy intacto)",
      g4.status === 404 && g4.body.error?.toLowerCase().includes("menú"),
      JSON.stringify({ status: g4.status, body: g4.body })
    )

    // G1 — acceptsOrders=false (gate off) → 409 ORDERS_CLOSED
    await setTenant({ "features.posLocationGate": false })
    await setLocation({ "settings.acceptsOrders": false, "pos.lastSeenAt": null })
    const g1 = await post()
    record(
      "G1",
      "acceptsOrders=false → 409 ORDERS_CLOSED (gate real del admin)",
      g1.status === 409 && g1.body.code === "ORDERS_CLOSED",
      JSON.stringify({ status: g1.status, code: g1.body.code })
    )

    // ─────────────────────────────────────────────────────────────────
    // 3. Teardown seed data
    // ─────────────────────────────────────────────────────────────────
    const delTenant = await tenants.deleteOne({ _id: tenantId })
    const delLoc = await locations.deleteOne({ _id: locationId })
    console.log("[e-gates] teardown:", { delTenant: delTenant.deletedCount, delLoc: delLoc.deletedCount })
    await mongoose.disconnect()
  } finally {
    logStream.end()
    server.kill()
    await new Promise((r) => setTimeout(r, 6000))
    if (server.exitCode === null) server.kill("SIGKILL")
  }

  const passed = checks.filter((c) => c.pass).length
  const md = [
    "# E — Gates SaaS en staging (ORDERS_CLOSED / NO_POS_ACTIVE)",
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
  writeFileSync(join(OUT_DIR, "evidence.md"), md.join("\n"))
  writeFileSync(join(OUT_DIR, "evidence.json"), JSON.stringify(checks, null, 2))

  console.log("\n[e-gates] evidence →", join(OUT_DIR, "evidence.md"))
  process.exit(passed === checks.length ? 0 : 1)
}

main().catch((err) => {
  console.error("[e-gates] fatal:", err)
  process.exit(1)
})