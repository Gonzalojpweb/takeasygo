/**
 * Evidencia end-to-end de la sombra rbac.sedeScope en STAGING — chopisburger.
 *
 * Objetivo: probar el pipeline completo `log` (usuario → rol → ruta → sede →
 * permiso) con data REAL de staging, sin tocar los flags del tenant (el modo se
 * fuerza por env NEXT_PUBLIC_FF_rbac.sedeScope=log, precedencia 1 sobre BD).
 *
 * Escenario:
 *   - Usuario e2e con fila ULR `staff` en sede A (user_location_roles).
 *   - Token POS firmado con role 'admin' (rol de SESIÓN distinto al de la fila,
 *     para demostrar que el registro guarda el rol EFECTIVO de la fila).
 *   - E1: GET /reservas?locationId=sedeA (staff NO tiene reservations.read)
 *         → log NO bloquea (status !== 403).
 *   - E2: existe bitácora rbac.shadow_denied con usuario/rol/ruta/sede/permiso
 *         + effectiveRole=staff (fila) y role=admin (sesión).
 *   - E3 control: GET /orders?locationId=sedeA (staff SÍ tiene orders.read)
 *         → 200 y SIN registro de sombra (no genera falsos positivos).
 *   - E4: los flags reales del tenant quedan intactos.
 *   - E5: rbac-shadow-report.mjs agrupa la denegación (salida como evidencia).
 *
 * SAFETY:
 *   - Allowlist: la base destino debe ser exactamente "takeasygo-staging".
 *   - SYNC_LAYER_URL vacío: ninguna escritura llega a prod.
 *   - finally: borra usuario e2e + fila ULR + mata el server (la bitácora de
 *     sombra se conserva en staging como evidencia y se refleja en docs/).
 *
 * Run desde la raíz del repo:
 *   npx tsx apps/saas/scripts/e-gates/rbac-shadow-e2e.ts
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
const PORT = 3199
const BASE_URL = `http://localhost:${PORT}`
const NEXT_BIN = join(SAAS_DIR, "node_modules", "next", "dist", "bin", "next")

const ALLOWED_DB = "takeasygo-staging"
const TENANT_SLUG = "chopisburger"
const E2E_EMAIL = "rbac-shadow-e2e@takeasygo.test"

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

  await mongoose.connect(stagingUri, { dbName: ALLOWED_DB })
  const db = mongoose.connection.db!
  const tenantsCol = db.collection("tenants")
  const locationsCol = db.collection("locations")
  const usersCol = db.collection("users")
  const ulrCol = db.collection("user_location_roles")
  const auditCol = db.collection("auditlogs")

  const tenant = await tenantsCol.findOne({ slug: TENANT_SLUG })
  if (!tenant) {
    console.error(`ABORT: tenant ${TENANT_SLUG} no existe en staging`)
    process.exit(2)
  }
  const tenantId = tenant._id as mongoose.Types.ObjectId
  const flagsOriginales = JSON.parse(JSON.stringify(tenant.flags ?? {}))

  const location = await locationsCol.findOne({ tenantId, isActive: true })
  if (!location) {
    console.error(`ABORT: ${TENANT_SLUG} no tiene sedes activas`)
    process.exit(2)
  }
  const sedeA = (location._id as mongoose.Types.ObjectId).toString()
  console.log(`[shadow-e2e] tenant=${TENANT_SLUG} sedeA=${sedeA} (${location.name})`)
  console.log(`[shadow-e2e] flag real rbac.sedeScope en BD = ${JSON.stringify(flagsOriginales["rbac.sedeScope"] ?? "(ausente=off)")}`)

  let server: ChildProcess | null = null

  try {
    // ─────────────────────────────────────────────────────────────────
    // 1. Setup idempotente: usuario e2e + fila ULR staff en sede A
    // ─────────────────────────────────────────────────────────────────
    const now = new Date()
    const updUser = await usersCol.findOneAndUpdate(
      { email: E2E_EMAIL },
      {
        $setOnInsert: {
          name: "RBAC Shadow E2E",
          email: E2E_EMAIL,
          password: "x".repeat(60),
          role: "admin", // rol de sesión en DB; el token manda el claim role
          tenantId,
          assignedLocations: [location._id],
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true, returnDocument: "after" }
    )
    const userTestId = updUser!._id as mongoose.Types.ObjectId

    await ulrCol.updateOne(
      { tenantId, userId: userTestId, locationId: location._id },
      {
        $setOnInsert: {
          tenantId,
          userId: userTestId,
          locationId: location._id,
          role: "staff",
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true }
    )
    console.log(`[shadow-e2e] usuario e2e=${userTestId} fila ULR staff@sedeA creadas`)

    // Bitácora de sombra existente (para contar deltas) y corte temporal.
    const desde = new Date()
    // Nota: AuditLog castea tenantId/userId/locationId a ObjectId en la DB,
    // aunque logAudit reciba strings — las queries de este script deben usar
    // ObjectId crudo (un string no matchea).
    const shadowCountAntes = await auditCol.countDocuments({
      tenantId,
      action: "rbac.shadow_denied",
      createdAt: { $gte: desde },
    })

    // ─────────────────────────────────────────────────────────────────
    // 2. Spawn Next dev con el modo sombra forzado por env (sin tocar BD)
    // ─────────────────────────────────────────────────────────────────
    mkdirSync(OUT_DIR, { recursive: true })
    const serverLog = join(OUT_DIR, "rbac-shadow-e2e-server.log")
    const logStream = (await import("node:fs")).createWriteStream(serverLog, { flags: "w" })

    console.log(`[shadow-e2e] spawning next dev :${PORT} con NEXT_PUBLIC_FF_rbac.sedeScope=log ...`)
    const env = {
      ...process.env,
      MONGODB_URI: stagingUri,
      SYNC_LAYER_URL: "",
      NEXTAUTH_URL: BASE_URL,
      NEXT_TELEMETRY_DISABLED: "1",
      // Precedencia 1 de feature-flags: gana sobre tenant.flags de la BD.
      "NEXT_PUBLIC_FF_rbac.sedeScope": "log",
    }
    server = spawn(
      process.execPath,
      [NEXT_BIN, "dev", "--webpack", "--port", String(PORT)],
      { cwd: SAAS_DIR, env: env as NodeJS.ProcessEnv, stdio: ["ignore", "pipe", "pipe"], shell: false }
    )
    server.stdout?.pipe(logStream)
    server.stderr?.pipe(logStream)

    let serverUp = false
    for (let i = 0; i < 24; i++) {
      if (server.exitCode !== null) throw new Error(`next dev exited early (${server.exitCode})`)
      try {
        const res = await fetchWithTimeout(`${BASE_URL}/api/__ready__`, {}, 30000)
        if (res.status < 500) { serverUp = true; break }
      } catch { /* not ready */ }
      await new Promise((r) => setTimeout(r, 5000))
    }
    if (!serverUp) throw new Error("next dev did not become ready in time")
    console.log("[shadow-e2e] next up")

    // Warm-up de las rutas que ejercitamos (compilación lazy en dev).
    for (const path of ["/orders", "/reservas"]) {
      try { await fetchWithTimeout(`${BASE_URL}/api/${TENANT_SLUG}${path}`, {}, 180000) } catch { /* best-effort */ }
    }

    // Token POS: sub = usuario e2e real, role 'admin' (sesión), sede A.
    const token = signJwt(
      {
        sub: userTestId.toString(),
        tenantId: tenantId.toString(),
        role: "admin",
        deviceType: "pos",
        locationId: sedeA,
      } as any,
      privatePem,
      10 * 60 * 1000
    )
    const reqAuth = (path: string, opts: RequestInit = {}) =>
      fetchWithTimeout(`${BASE_URL}/api/${TENANT_SLUG}${path}`, {
        ...opts,
        headers: { Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
      })

    // ─────────────────────────────────────────────────────────────────
    // 3. E1: denegación simulada (staff no tiene reservations.read)
    // ─────────────────────────────────────────────────────────────────
    const hoy = new Date().toISOString().slice(0, 10)
    const e1 = await reqAuth(`/reservas?date=${hoy}&locationId=${sedeA}`)
    const e1Body = await e1.json().catch(() => ({}) as any)
    record(
      "E1",
      "modo log NO bloquea: GET /reservas (reservations.read denegado para staff) → status != 403",
      e1.status !== 403,
      `status=${e1.status} body=${JSON.stringify(e1Body).slice(0, 200)}`
    )

    // ─────────────────────────────────────────────────────────────────
    // 4. E2: la bitácora tiene el registro completo usuario/rol/ruta/sede
    // ─────────────────────────────────────────────────────────────────
    let shadowDoc: any = null
    for (let i = 0; i < 10 && !shadowDoc; i++) {
      shadowDoc = await auditCol.findOne(
        {
          tenantId,
          action: "rbac.shadow_denied",
          userId: userTestId,
          createdAt: { $gte: desde },
        },
        { sort: { createdAt: -1 } }
      )
      if (!shadowDoc) await new Promise((r) => setTimeout(r, 1000))
    }
    const d: any = shadowDoc?.details ?? {}
    record(
      "E2",
      "bitácora rbac.shadow_denied con usuario/rol/ruta/sede/permiso + rol efectivo de la fila ULR",
      Boolean(shadowDoc) &&
        shadowDoc.locationId?.toString() === sedeA &&
        d.permission === "reservations.read" &&
        String(d.route ?? "").endsWith("/reservas") &&
        d.effectiveRole === "staff" && // fila ULR
        d.via === "ulr" &&
        d.role === "admin", // sesión (token)
      `doc=${JSON.stringify(shadowDoc ?? null)?.slice(0, 600)}`
    )

    // ─────────────────────────────────────────────────────────────────
    // 5. E3 control: permiso PERMITIDO para staff no genera registro
    // ─────────────────────────────────────────────────────────────────
    const e3 = await reqAuth(`/orders?locationId=${sedeA}`)
    record("E3", "control: GET /orders (orders.read OK para staff) → 200", e3.status === 200, `status=${e3.status}`)

    const shadowTrasControl = await auditCol.countDocuments({
      tenantId,
      action: "rbac.shadow_denied",
      userId: userTestId,
      "details.route": { $regex: "/orders$" },
      createdAt: { $gte: desde },
    })
    record(
      "E4",
      "control: la petición permitida NO dejó registro de sombra (sin falsos positivos)",
      shadowTrasControl === 0,
      `registros con route /orders = ${shadowTrasControl}`
    )

    // ─────────────────────────────────────────────────────────────────
    // 6. E5: flags reales del tenant intactos (el modo vino del env)
    // ─────────────────────────────────────────────────────────────────
    const tenantDespues = await tenantsCol.findOne({ slug: TENANT_SLUG }, { projection: { flags: 1 } })
    const flagsDespues = JSON.parse(JSON.stringify(tenantDespues?.flags ?? {}))
    const sinCambios =
      JSON.stringify(flagsOriginales["rbac.sedeScope"] ?? null) ===
      JSON.stringify(flagsDespues["rbac.sedeScope"] ?? null)
    record(
      "E5",
      "flags reales del tenant intactos (modo sombra forzado solo por env del server)",
      sinCambios,
      `antes=${JSON.stringify(flagsOriginales["rbac.sedeScope"] ?? null)} después=${JSON.stringify(flagsDespues["rbac.sedeScope"] ?? null)}`
    )

    // ─────────────────────────────────────────────────────────────────
    // 7. E6: rbac-shadow-report.mjs agrupa la denegación
    // ─────────────────────────────────────────────────────────────────
    console.log("[shadow-e2e] corriendo rbac-shadow-report.mjs ...")
    const report = await new Promise<string>((res) => {
      const child = spawn(
        process.execPath,
        [join(SAAS_DIR, "scripts", "audit", "rbac-shadow-report.mjs"), "--tenant", TENANT_SLUG, "--db", ALLOWED_DB, "--dias", "1"],
        { cwd: SAAS_DIR, env: { ...process.env, MONGODB_URI: stagingUri }, shell: false }
      )
      let out = ""
      child.stdout?.on("data", (c) => { out += String(c) })
      child.stderr?.on("data", (c) => { out += String(c) })
      child.on("close", () => res(out))
    })
    // Exigir el permiso agrupado (solo aparece si hay filas reales); el mero
    // título "rbac.shadow_denied" aparece aunque el reporte esté vacío.
    const reportOk = /reservations\.read/.test(report)
    record("E6", "rbac-shadow-report.mjs muestra la denegación simulada (usuario/rol/ruta/sede)", reportOk, report.slice(0, 800))

    // ─────────────────────────────────────────────────────────────────
    // 8. Evidencia local
    // ─────────────────────────────────────────────────────────────────
    const todosPass = checks.every((c) => c.pass)
    const evidence = {
      cuando: new Date().toISOString(),
      tenant: TENANT_SLUG,
      sedeA,
      usuarioE2e: { email: E2E_EMAIL, _id: userTestId.toString(), filaUlr: "staff", tokenRole: "admin" },
      flagRealEnBd: flagsOriginales["rbac.sedeScope"] ?? null,
      modoForzadoPorEnv: "NEXT_PUBLIC_FF_rbac.sedeScope=log",
      shadowAntesDelCorte: shadowCountAntes,
      totalShadowDesdeCorte: await auditCol.countDocuments({
        tenantId, action: "rbac.shadow_denied", userId: userTestId, createdAt: { $gte: desde },
      }),
      checks,
      registroSombra: shadowDoc ?? null,
      reporte: report,
      resultado: todosPass ? "PASS" : "FAIL",
    }
    writeFileSync(join(OUT_DIR, "rbac-shadow-evidence.json"), JSON.stringify(evidence, null, 2))
    writeFileSync(
      join(OUT_DIR, "rbac-shadow-evidence.md"),
      [
        "# Evidencia e2e — sombra rbac.sedeScope (staging)",
        "",
        `- **Cuándo:** ${evidence.cuando}`,
        `- **Tenant:** ${TENANT_SLUG} — sede A: ${sedeA}`,
        `- **Usuario e2e:** ${E2E_EMAIL} (${userTestId}) — fila ULR \`staff\` en sede A; token POS con \`role=admin\` (sesión)`,
        `- **Flag real en BD (sin tocar):** ${JSON.stringify(evidence.flagRealEnBd)}`,
        `- **Modo forzado solo por env:** \`${evidence.modoForzadoPorEnv}\``,
        `- **Resultado:** ${evidence.resultado}`,
        "",
        "## Checks",
        "",
        "| id | check | resultado | detalle |",
        "|----|-------|-----------|---------|",
        ...checks.map((c) => `| ${c.id} | ${c.description} | ${c.pass ? "PASS" : "FAIL"} | \`${String(c.detail).slice(0, 160).replace(/\|/g, "/")}\` |`),
        "",
        "## Registro de sombra capturado",
        "",
        "```json",
        JSON.stringify(shadowDoc ?? null, null, 2),
        "```",
        "",
        "## Salida de rbac-shadow-report.mjs",
        "",
        "```text",
        report,
        "```",
        "",
      ].join("\n")
    )
    console.log(`[shadow-e2e] evidencia en docs/rbac-shadow-evidence.{md,json}`)

    console.log(`\n[shadow-e2e] RESULTADO: ${todosPass ? "PASS" : "FAIL"} (${checks.filter((c) => c.pass).length}/${checks.length})`)
    if (!todosPass) process.exitCode = 1
  } finally {
    if (server && server.exitCode === null) {
      server.kill()
      await new Promise((r) => setTimeout(r, 1500))
      if (server.exitCode === null) server.kill("SIGKILL")
    }
    // Limpieza: fila ULR + usuario e2e (la bitácora de sombra queda como evidencia).
    try {
      const u = await db.collection("users").findOne({ email: E2E_EMAIL })
      if (u) {
        await db.collection("user_location_roles").deleteMany({ userId: u._id })
        await db.collection("users").deleteOne({ _id: u._id })
      }
      console.log("[shadow-e2e] residuos e2e borrados (usuario + filas ULR)")
    } catch (e) {
      console.warn("[shadow-e2e] cleanup falló:", e)
    }
    await mongoose.disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
