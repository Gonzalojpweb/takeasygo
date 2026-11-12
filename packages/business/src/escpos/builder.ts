import { encodeEscPosText, escPosCodepageCommand, type CodepageName } from "./encoding"

// ============================================================================
// Composición de comandos ESC/POS — compartida server ↔ POS
// ============================================================================
// POS offline V2 — etapa 4 (12/11/2026). Es el builder que vivía en
// apps/saas/lib/printing/escpos-builder.ts, sin Buffer ni iconv para que el
// POS arme sin internet la MISMA comanda que arma el server. El server
// extiende esta clase (TicketBuilder) y solo cambia el codificador de texto
// por iconv-lite (mismos bytes) y devuelve un Buffer.
//
//  - Cada ticket arranca con reset + selección de codepage explícitos.
//  - Cada text() vuelve a estado normal después de imprimir su línea.
//  - row() alinea el precio a la derecha según el ancho real del papel; si
//    el nombre no entra, el precio va en su propia línea.
// ============================================================================

const ESC = 0x1b
const GS = 0x1d

const CMD = {
  INIT: Uint8Array.from([ESC, 0x40]),
  BOLD_ON: Uint8Array.from([ESC, 0x45, 1]),
  BOLD_OFF: Uint8Array.from([ESC, 0x45, 0]),
  ALIGN_LEFT: Uint8Array.from([ESC, 0x61, 0]),
  ALIGN_CENTER: Uint8Array.from([ESC, 0x61, 1]),
  ALIGN_RIGHT: Uint8Array.from([ESC, 0x61, 2]),
  SIZE_NORMAL: Uint8Array.from([GS, 0x21, 0x00]),
  CUT: Uint8Array.from([GS, 0x56, 1]), // GS V 1 = corte parcial
  LF: Uint8Array.from([0x0a]),
} as const

export interface SizePreset {
  width: number
  height: number
}

/** Ancho fijo 2x para los tres grandes; solo escala el alto. */
export const SIZE_PRESETS: Record<string, SizePreset> = {
  normal: { width: 1, height: 1 }, // 0x00
  large: { width: 2, height: 2 }, // 0x11
  double: { width: 2, height: 3 }, // 0x12
  triple: { width: 2, height: 4 }, // 0x13
}

export function sizeCommand(width = 1, height = 1): Uint8Array {
  const w = Math.min(Math.max(width, 1), 8) - 1
  const h = Math.min(Math.max(height, 1), 8) - 1
  return Uint8Array.from([GS, 0x21, (w << 4) | h])
}

function resolveSize(size: string | SizePreset | undefined): SizePreset | null {
  if (!size || size === "normal") return null
  if (typeof size === "string") return SIZE_PRESETS[size] || null
  if (typeof size === "object") return size
  return null
}

const CHARS_PER_LINE: Record<number, Record<number, number>> = {
  384: { 1: 32, 2: 16 }, // 58mm
  576: { 1: 48, 2: 24 }, // 80mm
}

export function lineWidth(paperWidth: number, widthMultiplier: number): number {
  const table = CHARS_PER_LINE[paperWidth] || CHARS_PER_LINE[576]
  return table[widthMultiplier] || table[1]
}

export interface TicketBuilderOptions {
  paperWidth?: number
  fontSize?: string
  codepage?: CodepageName
  lineSpacingDots?: number
}

export type TextOptions = { bold?: boolean; size?: string | SizePreset; align?: "left" | "center" | "right" }

export class EscPosBuilder {
  paperWidth: number
  width: number
  codepage: CodepageName | undefined
  bodySize: string
  private chunks: Uint8Array[]

  constructor({ paperWidth = 576, fontSize = "normal", codepage, lineSpacingDots }: TicketBuilderOptions = {}) {
    this.paperWidth = paperWidth
    const bodyMag = resolveSize(fontSize) || SIZE_PRESETS.normal
    this.width = lineWidth(paperWidth, bodyMag.width)
    this.bodySize = fontSize
    this.codepage = codepage
    this.chunks = [CMD.INIT, escPosCodepageCommand(codepage)]
    if (lineSpacingDots != null) {
      this.chunks.push(Uint8Array.from([ESC, 0x33, lineSpacingDots & 0xff]))
    }
  }

  /** Texto → bytes de la tabla. El server lo reemplaza por iconv (mismos bytes). */
  protected encodeText(str: string): Uint8Array {
    return encodeEscPosText(str, this.codepage)
  }

  protected _raw(buf: Uint8Array): this {
    this.chunks.push(buf)
    return this
  }

  text(str: string, { bold = false, size, align = "left" }: TextOptions = {}): this {
    const resolved = size !== undefined ? size : this.bodySize
    const mag = resolveSize(resolved)

    if (align === "center") this._raw(CMD.ALIGN_CENTER)
    else if (align === "right") this._raw(CMD.ALIGN_RIGHT)
    if (bold) this._raw(CMD.BOLD_ON)
    if (mag) this._raw(sizeCommand(mag.width, mag.height))

    this._raw(this.encodeText(str))
    this._raw(CMD.LF)

    if (mag) this._raw(CMD.SIZE_NORMAL)
    if (bold) this._raw(CMD.BOLD_OFF)
    if (align === "center" || align === "right") this._raw(CMD.ALIGN_LEFT)
    return this
  }

  blank(): this {
    return this._raw(CMD.LF)
  }

  rule(char = "-"): this {
    return this.text(char.repeat(this.width))
  }

  ruleDouble(): this {
    return this.rule("=")
  }

  wrapped(str: string, opts: TextOptions = {}): this {
    const words = String(str).split(/\s+/)
    let line = ""
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w
      if (candidate.length > this.width && line) {
        this.text(line, opts)
        line = w
      } else {
        line = candidate
      }
    }
    if (line) this.text(line, opts)
    return this
  }

  row(name: string, price: string | number | null | undefined, opts: TextOptions = {}): this {
    if (!price) return this.wrapped(name, opts)
    const priceStr = String(price)
    const available = this.width - priceStr.length - 1
    if (name.length <= available) {
      const pad = " ".repeat(Math.max(this.width - name.length - priceStr.length, 0))
      return this.text(name + pad + priceStr, opts)
    }
    this.wrapped(name, opts)
    const pad = " ".repeat(Math.max(this.width - priceStr.length, 0))
    return this.text(pad + priceStr, opts)
  }

  box(str: string, opts: TextOptions = {}): this {
    this.rule("-")
    this.wrapped(str, { bold: true, ...opts })
    this.rule("-")
    return this
  }

  cut(): this {
    this.blank()
    this.blank()
    return this._raw(CMD.CUT)
  }

  toBytes(): Uint8Array {
    const size = this.chunks.reduce((s, c) => s + c.length, 0)
    const out = new Uint8Array(size)
    let offset = 0
    for (const c of this.chunks) {
      out.set(c, offset)
      offset += c.length
    }
    return out
  }
}
