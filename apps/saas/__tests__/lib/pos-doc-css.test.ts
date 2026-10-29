import { describe, expect, it } from "vitest"
import { readFileSync } from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { scopePosDocCss, splitPosDocHtml } from "@/lib/posDocCss"

const here = path.dirname(fileURLToPath(import.meta.url))
const docPath = path.resolve(here, "../../docs/pos-root-interface.html")

/** Devuelve los selectores de cada regla, entrando en @media/@supports. */
function ruleSelectors(css: string): string[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "")
  const selectors: string[] = []
  let i = 0

  while (i < clean.length) {
    const open = clean.indexOf("{", i)
    if (open === -1) break
    const prelude = clean.slice(i, open).trim()
    let depth = 0
    let j = open
    for (; j < clean.length; j++) {
      if (clean.charAt(j) === "{") depth++
      else if (clean.charAt(j) === "}") {
        depth--
        if (depth === 0) break
      }
    }
    const inner = clean.slice(open + 1, j)

    if (prelude.startsWith("@")) {
      if (/^@(media|supports|container|layer|scope)\b/.test(prelude)) {
        selectors.push(...ruleSelectors(inner))
      }
      // @keyframes y @font-face se dejan intactos: sus selectores no son
      // selectores de elementos (0%, from, to) y no pueden scopearse.
    } else if (prelude) {
      selectors.push(...prelude.split(",").map((s) => s.trim()))
    }

    i = j + 1
  }

  return selectors
}

describe("scopePosDocCss", () => {
  it("reubica :root, html y body bajo el contenedor", () => {
    const scoped = scopePosDocCss(
      ":root{--a:1} html{color:red} body{margin:0}"
    )
    expect(scoped).toBe(".posdoc{--a:1}.posdoc{color:red}.posdoc{margin:0}")
  })

  it("prefija selectores simples y de lista", () => {
    const scoped = scopePosDocCss("h3, p{color:blue} .btn{display:flex}")
    expect(scoped).toBe(".posdoc h3, .posdoc p{color:blue}.posdoc .btn{display:flex}")
  })

  it("reescribe main porque el layout del SaaS ya tiene el suyo", () => {
    expect(scopePosDocCss("main{padding:0 40px}")).toBe(
      ".posdoc .doc-main{padding:0 40px}"
    )
  })

  it("entra en @media pero no toca @keyframes", () => {
    const scoped = scopePosDocCss(
      "@media (max-width:760px){.card{padding:16px}}" +
        "@keyframes bootgrow{0%{width:12%}100%{width:96%}}"
    )
    expect(scoped).toContain("@media (max-width:760px){.posdoc .card{padding:16px}}")
    expect(scoped).toContain("@keyframes bootgrow{0%{width:12%}100%{width:96%}}")
    expect(scoped).not.toContain("@keyframes bootgrow{.posdoc 0%")
  })

  it("descarta los comentarios sin romper el parseo", () => {
    const scoped = scopePosDocCss("/* hola, mundo {con llaves} */\n.a{color:red}")
    expect(scoped).toBe(".posdoc .a{color:red}")
  })
})

describe("splitPosDocHtml", () => {
  it("separa estilos y cuerpo y reemplaza el <main>", () => {
    const html =
      "<!DOCTYPE html><html><head><style>.a{color:red}</style></head>" +
      '<body><main><p>hola</p></main></body></html>'
    expect(splitPosDocHtml(html)).toEqual({
      css: ".a{color:red}",
      body: '<div class="doc-main"><p>hola</p></div>',
    })
  })

  it("devuelve documentos vacíos ante HTML incompleto", () => {
    expect(splitPosDocHtml("<html><body>")).toEqual({ css: "", body: "" })
  })
})

describe("documento real docs/pos-root-interface.html", () => {
  const html = readFileSync(docPath, "utf-8")
  const { css, body } = splitPosDocHtml(html)

  it("extrae el CSS completo y el cuerpo", () => {
    expect(css).toContain("--brand-orange:#F74211")
    expect(body).toContain('class="shell"')
    expect(body).toContain("id=\"s15\"")
    expect(body).not.toContain("<main>")
    expect(body).toContain('class="doc-main"')
  })

  it("scopea todos los selectores: nada puede pisar la UI del SaaS", () => {
    const unscoped = ruleSelectors(scopePosDocCss(css)).filter(
      (selector) => !selector.startsWith(".posdoc")
    )
    expect(unscoped).toEqual([])
  })

  it("conserva los tokens y los mockups a escala", () => {
    const scoped = scopePosDocCss(css)
    expect(scoped).not.toContain(":root")
    expect(scoped).toContain("--sc:.70")
    expect(scoped).toContain("--ph:.92")
    expect(scoped).toContain(".posdoc .frame{")
    expect(scoped).toContain("@media (max-width:1180px)")
  })
})
