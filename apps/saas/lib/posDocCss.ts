/**
 * Utilidades para incrustar el documento estático de diseño del POS Root
 * (docs/pos-root-interface.html) dentro de una vista del SaaS.
 *
 * El documento nació como HTML autocontenido: su CSS está pensado para
 * aplicarse a `:root`, `html` y `body`. Dentro del superadmin eso pisaría los
 * tokens de Tailwind de toda la app, así que antes de inyectarlo lo "scopeamos"
 * bajo una clase contenedora (.posdoc) sin tocar el archivo original.
 */

const COMMENT = /\/\*[\s\S]*?\*\//g

/** At-rules que envuelven reglas normales: hay que entrar y scopear su interior. */
const CONDITIONAL_AT_RULE = /^@(media|supports|container|layer|scope)\b/

function scopeSelectorList(prelude: string, scope: string): string {
  return prelude
    .split(",")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((selector) => {
      if (selector === ":root" || selector === "html" || selector === "body") {
        return scope
      }
      // El documento usa <main>; en el SaaS ya existe el <main> del layout,
      // así que se reemplaza por un <div class="doc-main"> al incrustarlo.
      if (selector === "main") return `${scope} .doc-main`
      return `${scope} ${selector}`
    })
    .join(", ")
}

function walk(css: string, scope: string): string {
  let out = ""
  let i = 0

  while (i < css.length) {
    const open = css.indexOf("{", i)
    if (open === -1) {
      out += css.slice(i)
      break
    }

    const prelude = css.slice(i, open).trim()
    let depth = 0
    let j = open
    for (; j < css.length; j++) {
      if (css.charAt(j) === "{") depth++
      else if (css.charAt(j) === "}") {
        depth--
        if (depth === 0) break
      }
    }

    const inner = css.slice(open + 1, j)

    if (prelude.startsWith("@")) {
      out += CONDITIONAL_AT_RULE.test(prelude)
        ? `${prelude}{${walk(inner, scope)}}`
        : `${prelude}{${inner}}`
    } else if (prelude) {
      out += `${scopeSelectorList(prelude, scope)}{${inner}}`
    } else {
      out += `{${inner}}`
    }

    i = j + 1
  }

  return out
}

/** Devuelve el CSS del documento con todos los selectores bajo `scope`. */
export function scopePosDocCss(css: string, scope = ".posdoc"): string {
  return walk(css.replace(COMMENT, ""), scope)
}

/** Extrae el <style> y el contenido de <body> de un documento HTML completo. */
export function splitPosDocHtml(html: string): { css: string; body: string } {
  const styleTag = html.match(/<style>([\s\S]*?)<\/style>/)
  const css = styleTag?.[1] ?? ""

  const bodyStart = html.indexOf("<body")
  const bodyOpen = bodyStart === -1 ? -1 : html.indexOf(">", bodyStart)
  const bodyEnd = html.lastIndexOf("</body>")
  const raw =
    bodyOpen !== -1 && bodyEnd > bodyOpen
      ? html.slice(bodyOpen + 1, bodyEnd)
      : ""

  const body = raw
    .replace("<main>", '<div class="doc-main">')
    .replace("</main>", "</div>")

  return { css, body }
}
