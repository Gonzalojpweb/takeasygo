// ============================================================================
// Calculadora de apoyo (piloto 06/11/2026)
// ============================================================================
// «Nadie tiene que sumar de cabeza ni sacar el celular». Evalúa expresiones
// simples con + − × ÷ y %, con precedencia normal y coma o punto decimal.
// Sin eval: un parser propio y chico, así nada de lo tipeado se ejecuta.
//
// `%` funciona como en una calculadora de caja:
//   43450 × 10%   → 4345     (porcentaje del número)
//   43450 + 10%   → 47795    (suma el 10 % del número anterior)
//   43450 − 10%   → 39105
// ============================================================================

type Token = { kind: "num"; value: number } | { kind: "op"; value: "+" | "-" | "*" | "/" } | { kind: "pct" }

const OP_ALIASES: Record<string, "+" | "-" | "*" | "/"> = {
  "+": "+",
  "-": "-",
  "−": "-",
  "*": "*",
  "×": "*",
  "x": "*",
  "X": "*",
  "/": "/",
  "÷": "/",
}

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = []
  let i = 0
  const s = input.replace(/\s+/g, "")
  while (i < s.length) {
    const ch = s[i]
    if (/[0-9.,]/.test(ch)) {
      let j = i
      while (j < s.length && /[0-9.,]/.test(s[j])) j++
      const raw = s.slice(i, j)
      // «43.450,50» o «43450.5» o «43450,5»: el último separador es el decimal
      // si le siguen 1 o 2 dígitos; si no, son miles.
      const lastSep = Math.max(raw.lastIndexOf(","), raw.lastIndexOf("."))
      let normalized = raw
      if (lastSep >= 0 && raw.length - lastSep - 1 <= 2 && raw.length - lastSep - 1 > 0) {
        normalized = raw.slice(0, lastSep).replace(/[.,]/g, "") + "." + raw.slice(lastSep + 1)
      } else {
        normalized = raw.replace(/[.,]/g, "")
      }
      const value = Number(normalized)
      if (!Number.isFinite(value)) return null
      tokens.push({ kind: "num", value })
      i = j
      continue
    }
    if (ch === "%") {
      tokens.push({ kind: "pct" })
      i++
      continue
    }
    const op = OP_ALIASES[ch]
    if (op) {
      tokens.push({ kind: "op", value: op })
      i++
      continue
    }
    return null
  }
  return tokens
}

/**
 * Resultado de la expresión, o null si está incompleta o es inválida
 * (división por cero incluida). Redondea a 2 decimales.
 */
export function evaluate(input: string): number | null {
  const tokens = tokenize(input)
  if (!tokens || tokens.length === 0) return null

  // Signo inicial: «-500 + 200».
  if (tokens[0].kind === "op" && tokens[0].value === "-" && tokens[1]?.kind === "num") {
    tokens.splice(0, 2, { kind: "num", value: -tokens[1].value })
  }

  // Términos: número [%]  (op número [%])*
  const nums: number[] = []
  const ops: ("+" | "-" | "*" | "/")[] = []
  let expectNum = true
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k]
    if (expectNum) {
      if (t.kind !== "num") return null
      let value = t.value
      if (tokens[k + 1]?.kind === "pct") {
        const op = ops[ops.length - 1]
        const base = nums[nums.length - 1]
        // + y − con %: porcentaje del número anterior. × y ÷: el número / 100.
        value = (op === "+" || op === "-") && base !== undefined ? (base * value) / 100 : value / 100
        k++
      }
      nums.push(value)
      expectNum = false
    } else {
      if (t.kind !== "op") return null
      ops.push(t.value)
      expectNum = true
    }
  }
  if (expectNum) return null

  // Precedencia: primero × y ÷.
  const n2: number[] = [nums[0]]
  const o2: ("+" | "-")[] = []
  for (let k = 0; k < ops.length; k++) {
    const op = ops[k]
    const next = nums[k + 1]
    if (op === "*") n2[n2.length - 1] = n2[n2.length - 1] * next
    else if (op === "/") {
      if (next === 0) return null
      n2[n2.length - 1] = n2[n2.length - 1] / next
    } else {
      o2.push(op)
      n2.push(next)
    }
  }
  let result = n2[0]
  for (let k = 0; k < o2.length; k++) result = o2[k] === "+" ? result + n2[k + 1] : result - n2[k + 1]
  if (!Number.isFinite(result)) return null
  return Math.round(result * 100) / 100
}

/** Número en formato argentino: 43.450,5 → «43.450,50» solo si tiene decimales. */
export function formatCalc(value: number): string {
  const hasDecimals = Math.round(value * 100) % 100 !== 0
  return value.toLocaleString("es-AR", { minimumFractionDigits: hasDecimals ? 2 : 0, maximumFractionDigits: 2 })
}
