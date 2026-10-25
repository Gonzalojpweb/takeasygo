import { useEffect, useRef } from "react"

// ============================================================================
// Esc = volver al contexto previo (obs. UX 25/10)
// ============================================================================
// Un empleado abre una mesa para mirarla y con Esc vuelve al salón, sin
// buscar el botón. Regla única: Esc hace EXACTAMENTE lo mismo que el botón
// «Volver / Cancelar» visible en esa pantalla — nunca otra cosa.
//
// Protecciones (en este orden):
//   · Hay un diálogo abierto (PIN, descuento, comensales, confirmación…):
//     Esc es del diálogo, no se navega.
//   · Se está escribiendo (textarea, select, input con texto, editable): Esc
//     no borra lo tipeado navegando. Un input VACÍO no bloquea (p. ej. el
//     buscador del selector, ya limpio).
//   · Otro componente ya usó el Esc (preventDefault): p. ej. el selector de
//     productos limpia la búsqueda con el primer Esc; el segundo vuelve.
//     Se decide en un microtask, cuando ya corrieron todos los listeners del
//     evento, así el orden de registro no importa.
//   · Tecla mantenida apretada o con modificadores: se ignora.
// Cada vista monta UN hook con la acción de su escena (null = no hace nada).
// ============================================================================

export function isTypingBlocker(el: Element | null): boolean {
  if (!el) return false
  if ((el as HTMLElement).isContentEditable) return true
  const tag = el.tagName
  if (tag === "TEXTAREA" || tag === "SELECT") return true
  if (tag === "INPUT") {
    const input = el as HTMLInputElement
    const type = (input.type || "text").toLowerCase()
    if (["button", "submit", "checkbox", "radio", "range", "color", "reset"].includes(type)) return false
    return input.value !== ""
  }
  return false
}

export function hasOpenDialog(root: ParentNode = document): boolean {
  return Boolean(root.querySelector('[role="dialog"], [role="alertdialog"], [aria-modal="true"]'))
}

export function useEscapeBack(action: (() => void) | null | false | undefined): void {
  const ref = useRef(action)
  useEffect(() => { ref.current = action }, [action])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return
      if (!ref.current) return
      // Se mira ANTES de que los otros listeners cierren su diálogo.
      if (hasOpenDialog() || isTypingBlocker(document.activeElement)) return
      queueMicrotask(() => {
        if (e.defaultPrevented) return
        const run = ref.current
        if (run) run()
      })
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
}
