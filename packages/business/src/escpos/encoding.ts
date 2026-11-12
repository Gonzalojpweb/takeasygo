import { HIGH_HALF } from "./tables"

// ============================================================================
// Codificación ESC/POS sin dependencias (corre en el navegador y en Node)
// ============================================================================
// POS offline V2 — etapa 4 (12/11/2026). Misma regla que el server
// (apps/saas/lib/printing/encoding.ts, con iconv-lite):
//   · CP437 por defecto (la tabla con la que arranca cualquier clon ESC/POS);
//   · comillas y guiones tipográficos → ASCII;
//   · una letra que la tabla no tiene pierde el acento (Á → A);
//   · lo que no se puede representar sale como «?» (una por unidad UTF-16,
//     igual que iconv).
// Las tablas salen de iconv-lite (tables.ts): los bytes son idénticos.
// ============================================================================

const ESC = 0x1b

export const CODEPAGES = {
  cp437: { escposIndex: 0 },
  cp850: { escposIndex: 2 },
  cp858: { escposIndex: 19 }, // verificar por modelo antes de usar
} as const

export type CodepageName = keyof typeof CODEPAGES

export const DEFAULT_CODEPAGE: CodepageName = "cp437"

const PUNCTUATION_REPLACEMENTS: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "–": "-",
  "—": "-",
  "…": "...",
}

const reverseTables = new Map<CodepageName, Map<number, number>>()

function reverseTable(codepage: CodepageName): Map<number, number> {
  let table = reverseTables.get(codepage)
  if (!table) {
    table = new Map()
    const high = HIGH_HALF[codepage]
    for (let i = 0; i < high.length; i++) table.set(high.charCodeAt(i), 0x80 + i)
    reverseTables.set(codepage, table)
  }
  return table
}

const QUESTION = 0x3f

function encodeUnits(str: string, codepage: CodepageName): number[] {
  const table = reverseTable(codepage)
  const out: number[] = []
  for (let i = 0; i < str.length; i++) {
    const unit = str.charCodeAt(i)
    out.push(unit < 0x80 ? unit : (table.get(unit) ?? QUESTION))
  }
  return out
}

function isSupported(ch: string, codepage: CodepageName): boolean {
  const encoded = encodeUnits(ch, codepage)
  return encoded.length > 0 && !(encoded.length === 1 && encoded[0] === QUESTION && ch !== "?")
}

function stripIfUnsupported(ch: string, codepage: CodepageName): string {
  if (isSupported(ch, codepage)) return ch
  const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "")
  if (base && isSupported(base, codepage)) return base
  return ch
}

function resolve(codepage: CodepageName | undefined): CodepageName {
  return codepage && codepage in CODEPAGES ? codepage : DEFAULT_CODEPAGE
}

export function normalizeForCodepage(str: string, codepage?: CodepageName): string {
  const cp = resolve(codepage)
  const withPunctuation = String(str).replace(/[‘’“”–—…]/g, (c) => PUNCTUATION_REPLACEMENTS[c] || c)
  return Array.from(withPunctuation).map((ch) => stripIfUnsupported(ch, cp)).join("")
}

export function encodeEscPosText(str: string, codepage?: CodepageName): Uint8Array {
  const cp = resolve(codepage)
  return Uint8Array.from(encodeUnits(normalizeForCodepage(str, cp), cp))
}

/** ESC t n: selecciona la tabla en la impresora. */
export function escPosCodepageCommand(codepage?: CodepageName): Uint8Array {
  return Uint8Array.from([ESC, 0x74, CODEPAGES[resolve(codepage)].escposIndex])
}

/** Base64 de los bytes (para mandarlos al agente por JSON). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}
