import iconv from 'iconv-lite'

// ============================================================================
// encoding.ts
// ============================================================================
// Convierte strings JS (UTF-8) al byte encoding que la impresora térmica
// realmente entiende, más el comando ESC/POS que selecciona esa tabla.
//
// DEFAULT: CP437, no CP858.
//
// Por qué el cambio: CP437 es la tabla en la que arranca (power-on default,
// índice 0) prácticamente cualquier clon de controladora ESC/POS, así que
// seleccionarla no depende de que el firmware del fabricante numere sus
// codepages igual que Epson. Ya cubre á é í ó ú ñ Ñ ü Ü ¿ ¡ — todo lo que
// hace falta para español. CP858 (Latin-1 + Euro) se deja disponible para
// un modelo puntual donde se haya confirmado que funciona con test-ticket.js,
// pero ya no es el default: en varios clones el índice ESC/POS que
// "debería" ser CP858 apunta a otra tabla (o a nada), que es la causa más
// probable de los acentos rotos que estaban viendo.
// ============================================================================

const ESC = 0x1b

export const CODEPAGES = {
  cp437: { iconvName: 'cp437', escposIndex: 0 },
  cp850: { iconvName: 'cp850', escposIndex: 2 },
  cp858: { iconvName: 'cp858', escposIndex: 19 }, // verificar por modelo antes de usar
} as const

export type CodepageName = keyof typeof CODEPAGES

export const DEFAULT_CODEPAGE: CodepageName = 'cp437'

// Puntuación tipográfica que no existe en ninguna tabla de 8 bits —
// mapeo explícito porque no son letras con acento, no hay forma de
// "resolverlas solas" quitando un diacrítico.
const PUNCTUATION_REPLACEMENTS: Record<string, string> = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201c': '"',
  '\u201d': '"',
  '\u2013': '-',
  '\u2014': '-',
  '\u2026': '...',
}

// Cache por codepage: qué caracteres YA se probaron y si hace falta
// quitarles el acento. En la práctica el universo de caracteres de
// nombres de productos/clientes es chico y esto se estabiliza rápido,
// pero le ponemos un tope igual por higiene — si se pasa, se resetea
// entero en vez de armar un LRU real, que sería sobre-ingeniería para
// un keyspace de este tamaño.
const MAX_CACHE_ENTRIES = 2000
const supportCache = new Map<string, boolean>()

function isSupported(ch: string, iconvName: string): boolean {
  const key = iconvName + '\u0000' + ch
  const cached = supportCache.get(key)
  if (cached !== undefined) return cached
  if (supportCache.size >= MAX_CACHE_ENTRIES) supportCache.clear()
  const encoded = iconv.encode(ch, iconvName)
  const ok =
    encoded.length > 0 &&
    !(encoded.length === 1 && encoded[0] === 0x3f && ch !== '?')
  supportCache.set(key, ok)
  return ok
}

// Para CUALQUIER letra que la tabla no sepa representar (hoy Á Í Ó Ú en
// CP437, mañana la que sea — no hace falta enumerarlas a mano), la
// descompone en letra base + acento (NFD) y descarta el acento. Á se
// resuelve a A automáticamente, sin que nadie tenga que agregarla a una
// lista después de verla romperse en un ticket real.
function stripIfUnsupported(ch: string, iconvName: string): string {
  if (isSupported(ch, iconvName)) return ch
  const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (base && isSupported(base, iconvName)) return base
  return ch // no es una letra con acento descomponible (ej. un emoji) — se deja
            // que iconv la resuelva como pueda más abajo, nunca explota
}

function normalize(str: string, iconvName: string): string {
  const withPunctuation = String(str).replace(
    /[\u2018\u2019\u201c\u201d\u2013\u2014\u2026]/g,
    (c) => PUNCTUATION_REPLACEMENTS[c] || c
  )
  return Array.from(withPunctuation)
    .map((ch) => stripIfUnsupported(ch, iconvName))
    .join('')
}

export function encodeText(str: string, codepage: CodepageName = DEFAULT_CODEPAGE): Buffer {
  const table = CODEPAGES[codepage] || CODEPAGES[DEFAULT_CODEPAGE]
  return iconv.encode(normalize(str, table.iconvName), table.iconvName)
}

export function codepageCommand(codepage: CodepageName = DEFAULT_CODEPAGE): Buffer {
  const table = CODEPAGES[codepage] || CODEPAGES[DEFAULT_CODEPAGE]
  return Buffer.from([ESC, 0x74, table.escposIndex]) // ESC t n
}
