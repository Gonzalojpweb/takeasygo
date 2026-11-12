import { describe, it, expect } from "vitest"
import { OFF_CONFIG, invoiceUnavailableNotice, isInvoiceChoiceValid, type InvoiceChoice } from "../services/fiscal"

// El server rechaza un CUIT con dígito verificador incorrecto DESPUÉS del cobro:
// el POS tiene que frenarlo antes, con la misma regla.

const base: InvoiceChoice = { type: "company", companyCondition: "responsable_inscripto", docNumber: "", name: "" }
const VALID = "30712345671"
const WRONG_CHECK_DIGIT = "30712345672"

describe("isInvoiceChoiceValid", () => {
  it("con CUIT: exige el dígito verificador, no solo 11 números", () => {
    expect(isInvoiceChoiceValid({ ...base, docNumber: VALID })).toBe(true)
    expect(isInvoiceChoiceValid({ ...base, docNumber: "30-71234567-1" })).toBe(true)
    expect(isInvoiceChoiceValid({ ...base, docNumber: WRONG_CHECK_DIGIT })).toBe(false)
    expect(isInvoiceChoiceValid({ ...base, docNumber: "123" })).toBe(false)
    expect(isInvoiceChoiceValid({ ...base, docNumber: "" })).toBe(false)
  })

  it("consumidor final: documento opcional, DNI o CUIT válido", () => {
    const final: InvoiceChoice = { ...base, type: "final" }
    expect(isInvoiceChoiceValid({ ...final, docNumber: "" })).toBe(true)
    expect(isInvoiceChoiceValid({ ...final, docNumber: "30111222" })).toBe(true)
    expect(isInvoiceChoiceValid({ ...final, docNumber: VALID })).toBe(true)
    expect(isInvoiceChoiceValid({ ...final, docNumber: WRONG_CHECK_DIGIT })).toBe(false)
    expect(isInvoiceChoiceValid({ ...final, docNumber: "123456" })).toBe(false)
  })

  it("el domicilio solo es obligatorio si el local lo pide", () => {
    const company = { ...base, docNumber: VALID }
    expect(isInvoiceChoiceValid(company, { requireBuyerAddress: false })).toBe(true)
    expect(isInvoiceChoiceValid(company, { requireBuyerAddress: true })).toBe(false)
    expect(isInvoiceChoiceValid({ ...company, address: "Calle 1" }, { requireBuyerAddress: true })).toBe(true)
  })

  it("sin factura no valida nada", () => {
    expect(isInvoiceChoiceValid({ ...base, type: "none", docNumber: "123" })).toBe(true)
  })
})

// 12/11/2026: sin facturación, el cobro mostraba la sección «Comprobante»
// vacía. Ahora dice por qué no hay comprobante.
describe("invoiceUnavailableNotice", () => {
  it("con facturación activa no hay aviso", () => {
    expect(invoiceUnavailableNotice({ ...OFF_CONFIG, enabled: true, mode: "ask", modality: "electronic" })).toBeNull()
  })

  it("sede sin configurar", () => {
    expect(invoiceUnavailableNotice({ ...OFF_CONFIG, modality: "none" })).toMatch(/no configurada en esta sede/)
    expect(invoiceUnavailableNotice(OFF_CONFIG)).toMatch(/no configurada en esta sede/)
  })

  it("configurada pero apagada en el POS", () => {
    expect(invoiceUnavailableNotice({ ...OFF_CONFIG, modality: "controller" })).toMatch(/apagada en el POS/)
  })

  it("error al leer la configuración: no se confunde con «no configurada»", async () => {
    expect(invoiceUnavailableNotice({ ...OFF_CONFIG, unavailable: true })).toMatch(/No se pudo leer/)
  })
})
