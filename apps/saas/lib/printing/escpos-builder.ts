import { encodeText, codepageCommand, type CodepageName } from './encoding'

// ============================================================================
// escpos-builder.ts
// ============================================================================
// Composición de comandos ESC/POS. No toca red ni USB — solo devuelve
// Buffers; el agente es quien los manda al socket/spooler.
//
// Fixes respecto al render anterior:
//  - Cada ticket arranca con reset + selección de codepage explícitos
//    (ESC/POS es stateful: si un ticket anterior dejó negrita o doble-ancho
//    prendido y el siguiente no lo resetea, ese modo se "pega" — es la
//    causa más probable del ancho de fuente inconsistente que se veía).
//  - Cada text() vuelve a estado normal después de imprimir su línea, en
//    vez de depender de que la línea siguiente lo resetee.
//  - row() alinea el precio a la derecha con padding calculado según el
//    ancho real del papel, y si el nombre no entra, el precio va en su
//    propia línea — nunca se pega con el ítem siguiente.
// ============================================================================

const ESC = 0x1b
const GS = 0x1d

const CMD = {
  INIT: Buffer.from([ESC, 0x40]),
  BOLD_ON: Buffer.from([ESC, 0x45, 1]),
  BOLD_OFF: Buffer.from([ESC, 0x45, 0]),
  ALIGN_LEFT: Buffer.from([ESC, 0x61, 0]),
  ALIGN_CENTER: Buffer.from([ESC, 0x61, 1]),
  ALIGN_RIGHT: Buffer.from([ESC, 0x61, 2]),
  SIZE_NORMAL: Buffer.from([GS, 0x21, 0x00]),
  CUT: Buffer.from([GS, 0x56, 1]), // GS V 1 = partial cut (3 bytes)
  LF: Buffer.from([0x0a]),
} as const

// GS ! n : bits 0-3 = magnificación de alto - 1, bits 4-7 = magnificación
// de ancho - 1 (1x a 8x cada uno). Reemplaza la lista fija anterior
// (normal/tall/double) por magnificación arbitraria, así "triple" u otro
// valor que agreguen a futuro no necesita que yo hardcodee un nuevo caso.
// Los presets de abajo son solo azúcar sintáctico para los usos más
// comunes -- el mapeo real de printSettings.fontSize a magnificación
// (qué significa 'large' vs 'double' vs 'triple' en su modelo) se decide
// en ticket-renderer.ts, no acá.
export interface SizePreset {
  width: number
  height: number
}

export const SIZE_PRESETS: Record<string, SizePreset> = {
  normal: { width: 1, height: 1 },
  tall: { width: 1, height: 2 },
  double: { width: 2, height: 2 },
  triple: { width: 3, height: 3 },
}

export function sizeCommand(width = 1, height = 1): Buffer {
  const w = Math.min(Math.max(width, 1), 8) - 1
  const h = Math.min(Math.max(height, 1), 8) - 1
  return Buffer.from([GS, 0x21, (w << 4) | h])
}

function resolveSize(size: string | SizePreset | undefined): SizePreset | null {
  if (!size || size === 'normal') return null
  if (typeof size === 'string') return SIZE_PRESETS[size] || null
  if (typeof size === 'object') return size // { width, height } explícito
  return null
}

// Caracteres por línea según ancho de papel (dots) y tamaño de fuente.
// Son valores típicos de Font A en térmicas de 58mm/80mm — si un modelo
// puntual imprime distinto, ajustar acá (usar test-ticket.js para medir).
// triple: magnificación 3x reduce los caracteres por línea a ~1/3.
const CHARS_PER_LINE: Record<number, Record<string, number>> = {
  384: { normal: 32, large: 24, triple: 10 }, // 58mm
  576: { normal: 48, large: 32, triple: 16 }, // 80mm
}

export function lineWidth(paperWidth: number, fontSize: string): number {
  const table = CHARS_PER_LINE[paperWidth] || CHARS_PER_LINE[576]
  return table[fontSize] || table.normal
}

export interface TicketBuilderOptions {
  paperWidth?: number
  fontSize?: string
  codepage?: CodepageName
  lineSpacingDots?: number
}

export class TicketBuilder {
  paperWidth: number
  width: number
  codepage: CodepageName | undefined
  private chunks: Buffer[]

  constructor({
    paperWidth = 576,
    fontSize = 'normal',
    codepage,
    lineSpacingDots,
  }: TicketBuilderOptions = {}) {
    this.paperWidth = paperWidth
    this.width = lineWidth(paperWidth, fontSize)
    this.codepage = codepage
    this.chunks = [CMD.INIT, codepageCommand(codepage)]
    // Solo se manda ESC 3 n si se pasa explícitamente -- no inventamos un
    // valor default; sin esto, el ticket usa el espaciado de fábrica de
    // la impresora, que es un default seguro mientras no tengamos el
    // valor real que usa el sistema actual.
    if (lineSpacingDots != null) {
      this.chunks.push(Buffer.from([ESC, 0x33, lineSpacingDots & 0xff]))
    }
  }

  private _raw(buf: Buffer): this {
    this.chunks.push(buf)
    return this
  }

  text(
    str: string,
    {
      bold = false,
      size = 'normal',
      align = 'left',
    }: { bold?: boolean; size?: string | SizePreset; align?: 'left' | 'center' | 'right' } = {}
  ): this {
    const mag = resolveSize(size as string | undefined)

    if (align === 'center') this._raw(CMD.ALIGN_CENTER)
    else if (align === 'right') this._raw(CMD.ALIGN_RIGHT)
    if (bold) this._raw(CMD.BOLD_ON)
    if (mag) this._raw(sizeCommand(mag.width, mag.height))

    this._raw(encodeText(str, this.codepage))
    this._raw(CMD.LF)

    if (mag) this._raw(CMD.SIZE_NORMAL)
    if (bold) this._raw(CMD.BOLD_OFF)
    if (align === 'center' || align === 'right') this._raw(CMD.ALIGN_LEFT)
    return this
  }

  blank(): this {
    return this._raw(CMD.LF)
  }

  rule(char = '-'): this {
    return this.text(char.repeat(this.width))
  }

  ruleDouble(): this {
    return this.rule('=')
  }

  wrapped(str: string, opts: Parameters<TicketBuilder['text']>[1] = {}): this {
    const words = String(str).split(/\s+/)
    let line = ''
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

  // Fila nombre/precio. Si entran los dos, alinea el precio a la derecha.
  // Si no entra, envuelve el nombre y pone el precio solo en su propia
  // línea derecha-alineada.
  row(
    name: string,
    price: string | number | null | undefined,
    opts: Parameters<TicketBuilder['text']>[1] = {}
  ): this {
    if (!price) return this.wrapped(name, opts)
    const priceStr = String(price)
    const available = this.width - priceStr.length - 1
    if (name.length <= available) {
      const pad = ' '.repeat(Math.max(this.width - name.length - priceStr.length, 0))
      return this.text(name + pad + priceStr, opts)
    }
    this.wrapped(name, opts)
    const pad = ' '.repeat(Math.max(this.width - priceStr.length, 0))
    return this.text(pad + priceStr, opts)
  }

  box(str: string, opts: Parameters<TicketBuilder['text']>[1] = {}): this {
    this.rule('-')
    this.wrapped(str, { bold: true, ...opts })
    this.rule('-')
    return this
  }

  cut(): this {
    this.blank()
    this.blank()
    return this._raw(CMD.CUT)
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.chunks)
  }
}
