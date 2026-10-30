import { describe, it, expect } from "vitest"
import { menuThumbUrl } from "../utils/images"

// Configuración › Mostrador (30/10): las mismas fotos del menú, en miniatura.
describe("menuThumbUrl", () => {
  it("Cloudinary: miniatura cuadrada liviana de la misma imagen", () => {
    expect(menuThumbUrl("https://res.cloudinary.com/demo/image/upload/v1/menu/mila.jpg"))
      .toBe("https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_200,h_200,c_fill/v1/menu/mila.jpg")
  })

  it("otras URLs pasan tal cual; sin foto, vacío", () => {
    expect(menuThumbUrl("https://example.com/a.jpg")).toBe("https://example.com/a.jpg")
    expect(menuThumbUrl(undefined)).toBe("")
    expect(menuThumbUrl("")).toBe("")
  })
})
