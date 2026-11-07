import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest"
import express from "express"
import type { Server } from "node:http"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import mongoose from "mongoose"
import bcrypt from "bcryptjs"
import { UserModel, LocationModel, PosCredentialModel } from "@takeasygo/db"
import { decodeJwt, signJwt } from "@takeasygo/business/jwt"
import { posPinLookup, resolvePosPinPepper } from "@takeasygo/business/pos-pin"
import "./setup"
import { authRouter, logoutRouter } from "../src/routes/auth"
import { authMiddleware } from "../src/auth/middleware"
import { __setAccountLockRedisForTests, __resetLogoutLimitersForTests } from "../src/middleware/rate-limiter"
import { __setDenyRedisForTests, __resetJtiDenylistForTests } from "../src/auth/jtiDenylist"
import { __resetOrgPosCacheForTests, grantLocation } from "../src/auth/org-pos-access"

/**
 * POS multimarca (D6): un miembro de la organización entra al POS de otra
 * marca del grupo con SU PIN de esa marca (pos_credentials). Rol y sedes
 * salen de la membresía, re-validada en cada login y renovación.
 */

const PEPPER = "test-pepper-0123456789abcdef"
const PRIVATE_PEM = readFileSync(fileURLToPath(new URL("../keys.private.pem", import.meta.url)), "utf-8").trim()
const oid = () => new mongoose.Types.ObjectId()

let server: Server
let baseUrl: string
let orgId: mongoose.Types.ObjectId, brandA: mongoose.Types.ObjectId, brandB: mongoose.Types.ObjectId, outside: mongoose.Types.ObjectId
let locA1: string, locA2: string

beforeAll(async () => {
  process.env.POS_PIN_PEPPER = PEPPER
  __setAccountLockRedisForTests(null)
  __setDenyRedisForTests({ get: async () => null, set: async () => "OK" })
  const app = express()
  app.use(express.json())
  app.use("/auth", authRouter)
  app.use("/s", authMiddleware)
  app.use("/s/auth", logoutRouter)
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", resolve) })
  const address = server.address()
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`
})

afterAll(async () => {
  delete process.env.POS_PIN_PEPPER
  __setDenyRedisForTests(null)
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

beforeEach(async () => {
  __resetOrgPosCacheForTests()
  __resetJtiDenylistForTests()
  __resetLogoutLimitersForTests()
  process.env.POS_MULTIBRAND_MODE = "on"
  process.env.ORG_ACCESS_MODE = "enforce"
  const db = mongoose.connection
  orgId = oid(); brandA = oid(); brandB = oid(); outside = oid()
  await db.collection("organizations").insertOne({ _id: orgId, name: "Grupo", slug: "grupo", status: "active" })
  await db.collection("tenants").insertMany([
    { _id: brandA, name: "Alfa", slug: "alfa", status: "active", isActive: true, organizationId: orgId },
    { _id: brandB, name: "Beta", slug: "beta", status: "active", isActive: true, organizationId: orgId },
    { _id: outside, name: "Afuera", slug: "afuera", status: "active", isActive: true },
  ])
  locA1 = String((await LocationModel.create({ tenantId: brandA, name: "Centro", isActive: true, status: "active" }))._id)
  locA2 = String((await LocationModel.create({ tenantId: brandA, name: "Norte", isActive: true, status: "active" }))._id)
})

afterEach(() => {
  delete process.env.POS_MULTIBRAND_MODE
  delete process.env.ORG_ACCESS_MODE
})

/** Miembro (sin comercio de origen) con membresía y PIN en `tenant`. */
async function member(orgRole: string, scope: Record<string, unknown>, pin: string, tenant = brandA, extra: Record<string, unknown> = {}) {
  const _id = oid()
  await mongoose.connection.collection("users").insertOne({ _id, name: `m-${pin}`, email: `m-${pin}-${String(_id)}@t.test`, role: "member", tenantId: null, isActive: true })
  await mongoose.connection.collection("org_memberships").insertOne({ organizationId: orgId, userId: _id, orgRole, scope, status: "active", ...extra })
  await PosCredentialModel.create({ userId: _id, tenantId: tenant, pin: await bcrypt.hash(pin, 4), posPinLookup: posPinLookup(resolvePosPinPepper(process.env)!, String(tenant), pin) })
  return _id
}

function login(pin: string, tenantId: mongoose.Types.ObjectId, locationId?: string): Promise<Response> {
  return fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "pin", employeePin: pin, tenantId: String(tenantId), ...(locationId ? { locationId } : {}) }),
  })
}

describe("login por PIN de miembro", () => {
  it("el propietario entra al POS de la marca como admin", async () => {
    const id = await member("owner", { allTenants: true }, "482915")
    const res = await login("482915", brandA)
    expect(res.status).toBe(200)
    const payload = decodeJwt((await res.json()).accessToken)!
    expect(payload).toMatchObject({ sub: String(id), tenantId: String(brandA), role: "admin" })
  })

  it("con el interruptor apagado (o org.access no activo) el PIN de miembro no sirve", async () => {
    await member("owner", { allTenants: true }, "482915")
    process.env.POS_MULTIBRAND_MODE = "off"
    __resetOrgPosCacheForTests()
    expect((await login("482915", brandA)).status).toBe(401)
    process.env.POS_MULTIBRAND_MODE = "on"
    process.env.ORG_ACCESS_MODE = "log"
    __resetOrgPosCacheForTests()
    expect((await login("482915", brandA)).status).toBe(401)
  })

  it("también se prende desde PlatformConfig (sin variables)", async () => {
    await member("owner", { allTenants: true }, "482915")
    delete process.env.POS_MULTIBRAND_MODE
    delete process.env.ORG_ACCESS_MODE
    await mongoose.connection.collection("platformconfigs").insertOne({ _id: "platform" as never, posMultiBrand: "on", orgAccess: "enforce" })
    __resetOrgPosCacheForTests()
    expect((await login("482915", brandA)).status).toBe(200)
  })

  it("membresía revocada, organización suspendida o marca fuera del alcance → 401", async () => {
    const id = await member("brand_manager", { tenantIds: [brandB] }, "482915") // PIN en A pero gerente de B
    expect((await login("482915", brandA)).status).toBe(401)
    await mongoose.connection.collection("org_memberships").updateOne({ userId: id }, { $set: { scope: { tenantIds: [brandA] } } })
    expect((await login("482915", brandA)).status).toBe(200)
    await mongoose.connection.collection("organizations").updateOne({ _id: orgId }, { $set: { status: "suspended" } })
    expect((await login("482915", brandA)).status).toBe(401)
    await mongoose.connection.collection("organizations").updateOne({ _id: orgId }, { $set: { status: "active" } })
    await mongoose.connection.collection("org_memberships").updateOne({ userId: id }, { $set: { status: "revoked" } })
    expect((await login("482915", brandA)).status).toBe(401)
  })

  it("el PIN de una marca no sirve en otra ni en un comercio de afuera", async () => {
    await member("owner", { allTenants: true }, "482915")
    expect((await login("482915", brandB)).status).toBe(401)
    expect((await login("482915", outside)).status).toBe(401)
  })

  it("gerente de sede: solo en sus sedes; con una sola, la toma sola", async () => {
    await member("location_manager", { locations: [{ tenantId: brandA, locationId: new mongoose.Types.ObjectId(locA1) }] }, "730264")
    const own = await login("730264", brandA, locA1)
    expect(own.status).toBe(200)
    expect(decodeJwt((await own.json()).accessToken)).toMatchObject({ role: "manager", locationId: locA1 })
    const other = await login("730264", brandA, locA2)
    expect(other.status).toBe(403)
    expect((await other.json()).code).toBe("LOCATION_NOT_ALLOWED")
    const auto = await login("730264", brandA)
    expect(decodeJwt((await auto.json()).accessToken)!.locationId).toBe(locA1)
  })

  it("contador (solo lectura) no tiene rol de POS → 403", async () => {
    await member("accountant", { allTenants: true }, "591736")
    expect((await login("591736", brandA)).status).toBe(403)
  })

  it("un empleado de la marca sigue entrando por su User como siempre", async () => {
    const staff = await UserModel.create({ name: "Caja", email: `caja-${Math.random()}@t.test`, role: "cashier", tenantId: brandA, isActive: true, pin: "264819" })
    await UserModel.updateOne({ _id: staff._id }, { $set: { posPinLookup: posPinLookup(PEPPER, String(brandA), "264819") } })
    const res = await login("264819", brandA)
    expect(decodeJwt((await res.json()).accessToken)).toMatchObject({ sub: String(staff._id), role: "cashier" })
  })
})

describe("renovación del token de un miembro", () => {
  const tokenFor = (sub: mongoose.Types.ObjectId, extra: Record<string, unknown> = {}) =>
    signJwt({ sub: String(sub), tenantId: String(brandA), role: "admin", deviceType: "hub", locationId: null, authTime: Math.floor(Date.now() / 1000), ...extra } as never, PRIVATE_PEM)
  const refresh = (t: string) => fetch(`${baseUrl}/s/auth/refresh`, { method: "POST", headers: { Authorization: `Bearer ${t}` } })

  it("renueva mientras la membresía alcance la marca y tenga PIN; si no, 401", async () => {
    const id = await member("owner", { allTenants: true }, "482915")
    const ok = await refresh(tokenFor(id))
    expect(ok.status).toBe(200)
    expect(decodeJwt((await ok.json()).accessToken)).toMatchObject({ sub: String(id), role: "admin" })

    await PosCredentialModel.deleteMany({ userId: id })
    expect((await refresh(tokenFor(id))).status).toBe(401)
  })

  it("membresía revocada → no renueva", async () => {
    const id = await member("owner", { allTenants: true }, "482915")
    await mongoose.connection.collection("org_memberships").updateOne({ userId: id }, { $set: { status: "revoked" } })
    expect((await refresh(tokenFor(id))).status).toBe(401)
  })
})

describe("grantLocation", () => {
  it("sin sedes restringidas respeta la pedida; restringidas: solo las suyas", () => {
    expect(grantLocation({ role: "admin", locationIds: [] }, "x")).toBe("x")
    expect(grantLocation({ role: "admin", locationIds: [] }, undefined)).toBeNull()
    expect(grantLocation({ role: "manager", locationIds: ["a"] }, undefined)).toBe("a")
    expect(grantLocation({ role: "manager", locationIds: ["a", "b"] }, undefined)).toBeUndefined()
    expect(grantLocation({ role: "manager", locationIds: ["a"] }, "b")).toBeUndefined()
  })
})
