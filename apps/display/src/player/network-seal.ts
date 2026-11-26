// ============================================================================
// Sello de red: «somos parte de la red · TakeasyGO»
// ============================================================================
// Va en TODO lo que muestra una pantalla de TakeasyGO: plantillas de Studio,
// secuencias, composiciones, carta y promos automáticas, e imágenes y videos
// subidos. Está montado por encima de la escena (no dentro de cada pieza), así
// ninguna plantilla ni archivo lo puede tapar ni sacar. Discreto: una píldora
// chica, semitransparente, abajo al centro; legible sobre fondo claro u oscuro.
// Mismo texto que el pie del checkout. El ícono es SVG propio: sin internet.
// ============================================================================

export const NETWORK_SEAL_TEXT = 'somos parte de la red'

export function networkSeal(): HTMLElement {
  const seal = document.createElement('div')
  seal.setAttribute('aria-label', 'Somos parte de la red TakeasyGO')
  seal.dataset.tgoSeal = '1'
  seal.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:1.1vmin', 'transform:translateX(-50%)', 'z-index:2147483000',
    'display:flex', 'align-items:center', 'gap:.8vmin', 'padding:.55vmin 1.5vmin .55vmin 1.3vmin',
    'border-radius:999px', 'background:rgba(0,0,0,.42)', 'color:rgba(255,255,255,.88)',
    'font:500 1.35vmin/1 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif', 'letter-spacing:.12em',
    'text-transform:uppercase', 'white-space:nowrap', 'pointer-events:none', 'user-select:none',
  ].join(';')
  const label = document.createElement('span')
  label.textContent = NETWORK_SEAL_TEXT
  const brand = document.createElement('span')
  brand.style.cssText = 'display:inline-flex;align-items:center;gap:.4vmin;font-weight:800;letter-spacing:-.01em;text-transform:none;font-size:1.6vmin;color:#fff'
  brand.innerHTML = '<svg width="1.6vmin" height="1.6vmin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true" style="width:1.6vmin;height:1.6vmin"><path d="M3 9h18v10a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path d="M3 9l2.45-4.9A2 2 0 017.24 3h9.52a2 2 0 011.8 1.1L21 9"/><path d="M12 3v6"/></svg>'
  brand.append('TakeasyGO')
  seal.append(label, brand)
  return seal
}
