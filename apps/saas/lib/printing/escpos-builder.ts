import { EscPosBuilder, type TicketBuilderOptions } from '@takeasygo/business/escpos'
import { encodeText } from './encoding'

// ============================================================================
// escpos-builder.ts
// ============================================================================
// La composición ESC/POS vive en @takeasygo/business/escpos (builder.ts)
// desde la etapa 4 del POS offline (12/11/2026), para que el POS arme sin
// internet los mismos tickets. El server conserva iconv-lite para el texto
// (mismos bytes que las tablas del paquete) y devuelve Buffer.
// ============================================================================

export { SIZE_PRESETS, sizeCommand, lineWidth, type SizePreset, type TicketBuilderOptions } from '@takeasygo/business/escpos'

export class TicketBuilder extends EscPosBuilder {
  constructor(options: TicketBuilderOptions = {}) {
    super(options)
  }

  protected override encodeText(str: string): Uint8Array {
    return encodeText(str, this.codepage)
  }

  toBuffer(): Buffer {
    return Buffer.from(this.toBytes())
  }
}
