// ============================================================================
// Teclado en pantalla (obs. UX 30/10, pantallas 100 % táctiles)
// ============================================================================
// Al abrir el teclado, el panel derecho (carrito, total, Cobrar) tiene que
// seguir visible. Android (con interactive-widget=resizes-content en el
// viewport) ya achica la página; iPad/iPhone NO: el teclado tapa y el
// navegador desplaza la página. Acá se mide el alto realmente visible
// (visualViewport) y la app se ajusta a ese alto mientras el teclado está
// abierto (--app-vh, ver pos.css). Al cerrarlo, vuelve a 100dvh.
// ============================================================================

/** Diferencia mínima (px) para considerar que hay un teclado abierto. */
const KEYBOARD_MIN_PX = 120

export function keyboardInset(layoutHeight: number, visibleHeight: number): number {
  const inset = Math.round(layoutHeight - visibleHeight)
  return inset >= KEYBOARD_MIN_PX ? inset : 0
}

export function bootKeyboardViewport(): void {
  if (typeof window === "undefined" || !window.visualViewport) return
  const vv = window.visualViewport
  const root = document.documentElement

  const update = () => {
    const inset = keyboardInset(window.innerHeight, vv.height)
    if (inset > 0) {
      root.style.setProperty("--app-vh", `${Math.round(vv.height)}px`)
      root.classList.add("keyboard-open")
      // iOS desplaza la página para mostrar el campo: con la app ya del alto
      // visible, se vuelve arriba (header y panel quedan en su lugar).
      if (window.scrollY !== 0) window.scrollTo(0, 0)
    } else {
      root.style.removeProperty("--app-vh")
      root.classList.remove("keyboard-open")
    }
  }

  vv.addEventListener("resize", update)
  vv.addEventListener("scroll", update)
  update()
}
