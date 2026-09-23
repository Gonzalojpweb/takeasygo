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
// de ancho - 1 (1x a 8x cada uno). Los tres tamaños "grandes" comparten
// ancho 2x -- así ninguno empeora el wrap de texto respecto al otro, y
// solo el alto va escalando. Bytes quedan consecutivos (0x11/0x12/0x13)
// a propósito, para que sea fácil verificar a simple vista que están bien.
export interface SizePreset {
  width: number
  height: number
}

export const SIZE_PRESETS: Record<string, SizePreset> = {
  normal: { width: 1, height: 1 }, // 0x00
  large: { width: 2, height: 2 },  // 0x11 — sin cambios, ya funcionaba
  double: { width: 2, height: 3 }, // 0x12
  triple: { width: 2, height: 4 }, // 0x13 — el más grande de los tres
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

// Caracteres por línea según ancho de papel (dots) y multiplicador de
// ANCHO real (no el nombre del tamaño) — large/double/triple comparten
// ancho 2x, así que comparten el mismo cálculo de wrap automáticamente,
// sin necesidad de una entrada por nombre.
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

export class TicketBuilder {
  paperWidth: number
  width: number
  codepage: CodepageName | undefined
  bodySize: string
  private chunks: Buffer[]

  constructor({
    paperWidth = 576,
    fontSize = 'normal',
    codepage,
    lineSpacingDots,
  }: TicketBuilderOptions = {}) {
    this.paperWidth = paperWidth
    const bodyMag = resolveSize(fontSize) || SIZE_PRESETS.normal
    this.width = lineWidth(paperWidth, bodyMag.width)
    // fontSize pasa a ser el tamaño POR DEFECTO de cada text()/row() del
    // cuerpo del ticket — antes solo se usaba para calcular el ancho de
    // wrap y nunca se mandaba el comando de magnificación real, así que
    // un printer configurado en 'large' imprimía en tamaño normal.
    this.bodySize = fontSize
    this.codepage = codepage
    this.chunks = [CMD.INIT, codepageCommand(codepage)]
    // Solo se manda ESC 3 n si se pasa explícitamente — no inventamos un
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

  // `size` sin especificar hereda el tamaño de cuerpo configurado para
  // esta impresora/rol (this.bodySize); pasar `size` explícito (por
  // ejemplo el encabezado, que siempre va en 'triple' sin importar la
  // config) lo overridea puntualmente para esa línea.
  text(
    str: string,
    {
      bold = false,
      size,
      align = 'left',
    }: { bold?: boolean; size?: string | SizePreset; align?: 'left' | 'center' | 'right' } = {}
  ): this {
    const resolved = size !== undefined ? (size as string) : this.bodySize
    const mag = resolveSize(resolved)

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
