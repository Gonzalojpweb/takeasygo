/**
 * E validation — Guard de aislamiento por sede en STAGING (Oleada 1).
 *
 * Levanta Next dev (SaaS) apuntado a takeasygo-staging y, para CADA tenant
 * multisede real de staging, ejercita el guard `multisede.strictLocationId`
 * en sus 3 modos (off | log | enforce) usando tokens POS RS256 scoped a una sede.
 *
 * Matriz por tenant (token scope = Sede A):
 *   enforce:  GET /reservas?locationId=B → 403 ; GET /reservas?locationId=A → 200
 *             GET /orders?locationId=B   → 403 ; GET /orders?locationId=A   → 200
 *             POST /orders (body=B)      → 403
 *   log:      GET /reservas?locationId=B → 200 (registra, no bloquea)
 *             POST /orders (body=B)      → !=403
 *   off:      GET /reservas?locationId=B → 200
 *
 * SAFETY:
 *   - Allowlist estricta: el nombre de base del MONGODB_URI debe ser EXACTAMENTE
 *     "takeasygo-staging". Cualquier otra cosa (incluida "test" = producción, o
 *     una URI sin nombre de base) aborta con exit 2. Nunca se usa lista de bloqueo.
 *   - Restaura los flags originales de cada tenant al terminar (finally).
 *   - SYNC_LAYER_URL vacío: ninguna escritura puede llegar a la capa de sync.
 *
 * Run desde la raíz del repo:
 *   npx tsx apps/saas/scripts/e-gates/multisede-guards.ts
 */

import { spawn, type ChildProcess } from "node:child_process"
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs"
import { resolve, join } from "node:path"
import mongoose from "mongoose"
import { signJwt, verifyJwt } from "@takeasygo/business/jwt"

const ROOT = resolve(process.cwd())
const SAAS_DIR = join(ROOT, "apps", "saas")
const SYNC_DIR = join(ROOT, "apps", "sync")
// Evidencia FUERA del repo (docs/ está en .gitignore). Nada de artefactos trackeables.
const OUT_DIR = join(ROOT, "docs")
const PORT = 3199
const BASE_URL = `http://localhost:${PORT}`
const NEXT_BIN = join(SAAS_DIR, "node_modules", "next", "dist", "bin", "next")

// Allowlist estricta: única base permitida. Producción se llama "test" y es
// fácil de confundir, por eso NO se usa lista de bloqueo.
const ALLOWED_DB = "takeasygo-staging"

/**
 * Extrae el nombre de base de una URI de MongoDB.
 * Devuelve "" si la URI no declara nombre de base (lo que en Mongo resuelve al
 * default "test" = producción).
 */
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
  tenant: string
  description: string
  pass: boolean
  detail: string
}
const checks: Check[] = []

function record(id: string, tenant: string, description: string, pass: boolean, detail: string): void {
  checks.push({ id, tenant, description, pass, detail })
  console.log(`[${pass ? "PASS" : "FAIL"}] ${tenant} ${id} — ${description}`)
  if (!pass) console.log(`       ${detail}`)
}

async function fetchWithTimeout(url: string, opts: RequestInit, ms = 60000): Promise<Response> {
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

interface TenantRow {
  _id: mongoose.Types.ObjectId
  slug: string
  flags: unknown
  locations: Array<{ _id: mongoose.Types.ObjectId; name: string; isActive?: boolean }>
}

async function main(): Promise<void> {
  const stagingUri = readStagingMongoUri()
  const dbName = resolveDbName(stagingUri)
  if (dbName !== ALLOWED_DB) {
    console.error(
      `ABORT (allowlist): la base destino debe ser exactamente "${ALLOWED_DB}". ` +
        `Detectada: "${dbName || "(sin nombre de base → resuelve a test/producción)"}".`
    )
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
  // 1. Spawn Next dev (SaaS) apuntado a staging
  // ─────────────────────────────────────────────────────────────────
  mkdirSync(OUT_DIR, { recursive: true })
  const serverLog = join(OUT_DIR, "multisede-guards-server.log")
  const logStream = await import("node:fs").then((fs) => fs.createWriteStream(serverLog, { flags: "w" }))

  console.log(`[multisede] spawning next dev :${PORT} ...`)
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
    console.log("[multisede] next up")

    // ───────────────────────────────────────────────────────────────
    // 2. Cargar tenants multisede de staging
    // ───────────────────────────────────────────────────────────────
    await mongoose.connect(stagingUri)
    const db = mongoose.connection.db!
    const tenantsCol = db.collection("tenants")
    const locationsCol = db.collection("locations")

    const allTenants = await tenantsCol.find({}).toArray()
    const allLocations = await locationsCol.find({}).toArray()
    const locsByTenant = new Map<string, any[]>()
    for (const l of allLocations) {
      const k = String(l.tenantId)
      if (!locsByTenant.has(k)) locsByTenant.set(k, [])
      locsByTenant.get(k)!.push(l)
    }

    const rows: TenantRow[] = []
    for (const t of allTenants) {
      const ls = (locsByTenant.get(String(t._id)) ?? []).filter((l) => l.isActive !== false)
      if (ls.length >= 2) {
        rows.push({ _id: t._id, slug: t.slug, flags: t.flags ?? null, locations: ls })
      }
    }
    console.log(`[multisede] tenants multisede en staging: ${rows.length} (${rows.map((r) => r.slug).join(", ")})`)

    const restore: Array<{ id: mongoose.Types.ObjectId; flags: unknown }> = []
    const setFlag = (id: mongoose.Types.ObjectId, mode: string) =>
      tenantsCol.updateOne({ _id: id }, { $set: { flags: { "multisede.strictLocationId": mode } } })

    const req = (slug: string, path: string, token: string, opts: RequestInit = {}) =>
      fetchWithTimeout(`${BASE_URL}/api/${slug}${path}`, {
        ...opts,
        headers: { Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
      })

    try {
      for (const row of rows) {
        restore.push({ id: row._id, flags: row.flags })
        const [locA, locB] = row.locations
        const token = signJwt(
          {
            sub: `probe-${row.slug}`,
            tenantId: row._id.toString(),
            role: "admin",
            deviceType: "pos",
            locationId: locA._id.toString(),
          } as any,
          privatePem,
          10 * 60 * 1000
        )
        const decoded = verifyJwt(token, publicPem)
        if (!decoded) {
          record("T0", row.slug, "token POS firmado verifica", false, "verifyJwt → null")
          continue
        }

        const postBody = {
          locationId: locB._id.toString(),
          items: [{ type: "menuItem", menuItemId: "000000000000000000000000", quantity: 1 }],
          customer: { name: "Guard Probe", phone: `+54911${Math.floor(10000000 + Math.random() * 89999999)}` },
          mode: "takeaway",
          orderTiming: "immediate",
        }
        const post = (body: unknown) =>
          req(row.slug, "/orders", token, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })

        // ── enforce ──
        await setFlag(row._id, "enforce")

        const eResB = await req(row.slug, `/reservas?locationId=${locB._id}`, token)
        record("E1", row.slug, "enforce: GET /reservas sede ajena → 403", eResB.status === 403, `status=${eResB.status}`)

        const eResA = await req(row.slug, `/reservas?locationId=${locA._id}`, token)
        record("E2", row.slug, "enforce: GET /reservas sede propia → 200", eResA.status === 200, `status=${eResA.status}`)

        const eOrdB = await req(row.slug, `/orders?locationId=${locB._id}`, token)
        record("E3", row.slug, "enforce: GET /orders sede ajena → 403", eOrdB.status === 403, `status=${eOrdB.status}`)

        const eOrdA = await req(row.slug, `/orders?locationId=${locA._id}`, token)
        record("E4", row.slug, "enforce: GET /orders sede propia → 200", eOrdA.status === 200, `status=${eOrdA.status}`)

        const ePost = await post(postBody)
        record("E5", row.slug, "enforce: POST /orders sede ajena → 403", ePost.status === 403, `status=${ePost.status}`)

        // ── log ──
        await setFlag(row._id, "log")

        const lResB = await req(row.slug, `/reservas?locationId=${locB._id}`, token)
        record("L1", row.slug, "log: GET /reservas sede ajena → 200 (no bloquea)", lResB.status === 200, `status=${lResB.status}`)

        const lPost = await post(postBody)
        record("L2", row.slug, "log: POST /orders sede ajena → !=403 (no bloquea)", lPost.status !== 403, `status=${lPost.status}`)

        // ── off ──
        await setFlag(row._id, "off")

        const oResB = await req(row.slug, `/reservas?locationId=${locB._id}`, token)
        record("O1", row.slug, "off: GET /reservas sede ajena → 200 (sin cambios)", oResB.status === 200, `status=${oResB.status}`)
      }
    } finally {
      // Restaurar flags originales
      for (const r of restore) {
        if (r.flags === null || r.flags === undefined) {
          await tenantsCol.updateOne({ _id: r.id }, { $unset: { flags: "" } })
        } else {
          await tenantsCol.updateOne({ _id: r.id }, { $set: { flags: r.flags } })
        }
      }
      await mongoose.disconnect()
    }
  } finally {
    logStream.end()
    server.kill()
    await new Promise((r) => setTimeout(r, 6000))
    if (server.exitCode === null) server.kill("SIGKILL")
  }

  const passed = checks.filter((c) => c.pass).length
  const md = [
    "# E — Guard de aislamiento por sede en staging (multisede, off|log|enforce)",
    "",
    `Fecha: ${new Date().toISOString()}`,
    "",
    `Resultado: **${passed}/${checks.length} checks**`,
    "",
    "| ID | Tenant | Check | Resultado |",
    "|----|--------|-------|-----------|",
    ...checks.map((c) => `| ${c.id} | ${c.tenant} | ${c.description} | ${c.pass ? "PASS" : "FAIL"} |`),
    "",
    "## Detalle",
    "",
    ...checks.map((c) => `- **${c.tenant} ${c.id}** ${c.description}: ${c.pass ? "PASS" : "FAIL"} — \`${c.detail}\``),
  ]
  writeFileSync(join(OUT_DIR, "multisede-guards-evidence.md"), md.join("\n"))
  writeFileSync(join(OUT_DIR, "multisede-guards-evidence.json"), JSON.stringify(checks, null, 2))

  console.log(`\n[multisede] evidence → ${join(OUT_DIR, "multisede-guards-evidence.md")}`)
  console.log(`[multisede] resultado: ${passed}/${checks.length}`)
  process.exit(passed === checks.length ? 0 : 1)
}

main().catch((err) => {
  console.error("[multisede] fatal:", err)
  process.exit(1)
})
