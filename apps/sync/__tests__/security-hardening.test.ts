import { describe, it, expect } from "vitest"
import { isInternalSecretValid } from "../src/routes/internal"
import { escapeHtml } from "../src/routes/z-report-view"

// Auditoría de seguridad 30/10/2026.
describe("secreto interno (M3): fail-closed y en tiempo constante", () => {
  it("sin secreto configurado nadie entra (antes \"\" === \"\" dejaba pasar)", () => {
    expect(isInternalSecretValid("", "")).toBe(false)
    expect(isInternalSecretValid(undefined, "")).toBe(false)
  })

  it("header correcto pasa; ausente, distinto o de otro largo no", () => {
    expect(isInternalSecretValid("s3cret-abc", "s3cret-abc")).toBe(true)
    expect(isInternalSecretValid(undefined, "s3cret-abc")).toBe(false)
    expect(isInternalSecretValid("s3cret-abd", "s3cret-abc")).toBe(false)
    expect(isInternalSecretValid("s3cret", "s3cret-abc")).toBe(false)
    expect(isInternalSecretValid(["s3cret-abc"], "s3cret-abc")).toBe(false)
  })
})

describe("HTML del reporte Z (M8): texto del comercio escapado", () => {
  it("neutraliza etiquetas y comillas", () => {
    expect(escapeHtml(`<img src=x onerror="alert(1)">`)).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;")
    expect(escapeHtml("Keke & Larry's")).toBe("Keke &amp; Larry&#39;s")
    expect(escapeHtml(undefined)).toBe("")
  })
})
