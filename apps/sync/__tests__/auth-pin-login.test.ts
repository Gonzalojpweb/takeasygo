import { describe, it, expect, beforeAll, afterAll } from "vitest"
import express from "express"
import type { Server } from "node:http"
import mongoose from "mongoose"
import { UserModel } from "@takeasygo/db"
import { decodeJwt } from "@takeasygo/business/jwt"
import { posPinLookup, resolvePosPinPepper } from "@takeasygo/business/pos-pin"
import "./setup"
import { authRouter } from "../src/routes/auth"
import { __setAccountLockRedisForTests } from "../src/middleware/rate-limiter"

/**
 * Login por PIN (hallazgo de la validación de la Auditoría POS Online V1).
 *
 * Antes: findOne({ tenantId, isActive }) tomaba UN usuario cualquiera del
 * tenant y comparaba el PIN solo contra ése → con más de un empleado, el
 * resto no podía entrar. Ahora: lookup HMAC por tenant + bcrypt, con fallback
 * legacy que migra el lookup.
 */

const PEPPER = "test-pepper-0123456789abcdef"
const TENANT = "64b0000000000000000000b2"

let server: Server
let baseUrl: string

beforeAll(async () => {
  process.env.POS_PIN_PEPPER = PEPPER
  __setAccountLockRedisForTests(null) // sin Redis: el lock queda fail-open (lo cubre account-lockout.test)
  const app = express()
  app.use(express.json())
  app.use("/auth", authRouter)
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`
})

afterAll(async () => {
  delete process.env.POS_PIN_PEPPER
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

async function createUser(role: string, pin: string, withLookup = true) {
  const user = await UserModel.create({
    name: `${role}-${pin}`,
    email: `${role}-${pin}-${Math.random().toString(36).slice(2)}@test.com`,
    role,
    tenantId: new mongoose.Types.ObjectId(TENANT),
    isActive: true,
    pin, // el pre-save de @takeasygo/db lo hashea con bcrypt
  })
  if (withLookup) {
    await UserModel.updateOne(
      { _id: user._id },
      { $set: { posPinLookup: posPinLookup(resolvePosPinPepper(process.env)!, TENANT, pin) } }
    )
  }
  return user
}

function login(pin: string, tenantId = TENANT): Promise<Response> {
  return fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "pin", employeePin: pin, tenantId }),
  })
}

describe("login por PIN", () => {
  it("cada empleado entra con SU PIN (no solo el primero del tenant)", async () => {
    const ana = await createUser("cashier", "482915")
    const beto = await createUser("manager", "730264")

    const resAna = await login("482915")
    expect(resAna.status).toBe(200)
    expect(decodeJwt((await resAna.json()).accessToken)!.sub).toBe(ana._id.toString())

    const resBeto = await login("730264")
    expect(resBeto.status).toBe(200)
    expect(decodeJwt((await resBeto.json()).accessToken)!.sub).toBe(beto._id.toString())
  })

  it("PIN incorrecto → 401", async () => {
    await createUser("cashier", "482915")
    expect((await login("111999")).status).toBe(401)
  })

  it("PIN de OTRO tenant no sirve", async () => {
    await createUser("cashier", "482915")
    expect((await login("482915", "64b0000000000000000000ff")).status).toBe(401)
  })

  it("legacy (PIN sin lookup) entra y queda migrado", async () => {
    const legacy = await createUser("cashier", "582613", false)
    const res = await login("582613")
    expect(res.status).toBe(200)

    const stored = await UserModel.findById(legacy._id).select("+posPinLookup").lean()
    expect((stored as { posPinLookup?: string }).posPinLookup).toBe(
      posPinLookup(PEPPER, TENANT, "582613")
    )
  })

  it("rol sin acceso de hub (staff) → 403 en vez de un token inútil", async () => {
    await createUser("staff", "604917")
    const res = await login("604917")
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe("ROLE_NOT_ALLOWED")
  })

  it("el token del PIN trae authTime (base del refresh)", async () => {
    await createUser("cashier", "482915")
    const body = await (await login("482915")).json()
    expect(typeof decodeJwt(body.accessToken)!.authTime).toBe("number")
  })
})
