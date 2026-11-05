import { describe, it, expect } from "vitest"
import { isInvoiceChoiceValid, type InvoiceChoice } from "../services/fiscal"

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

  it("sin factura no valida nada", () => {
    expect(isInvoiceChoiceValid({ ...base, type: "none", docNumber: "123" })).toBe(true)
  })
})
