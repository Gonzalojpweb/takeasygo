// ============================================================================
// /preview — vista previa de una composición dentro del panel (iframe)
// ============================================================================
// El panel de Pantallas manda la composición ya armada por postMessage y acá
// se dibuja con el MISMO motor que la pantalla (lienzo, módulos y GSAP), en
// bucle. Solo acepta mensajes de los orígenes del panel; no usa token, no se
// vincula, no guarda nada y no registra el service worker. Las fotos y
// fuentes se cargan directo (el panel tiene internet).
// ============================================================================

import { playCompositionBoard } from './player/templates/composition-board'
import type { CompositionBoard } from './player/board'

const ALLOWED = new Set(['https://www.takeasygo.com', 'https://takeasygo.com', 'http://localhost:3000'])

interface PreviewMsg { type: 'tgd-preview'; board: CompositionBoard; orderUrl?: string | null; timezone?: string | null }

export function mountPreview(root: HTMLElement) {
  document.body.style.cssText = 'margin:0;background:#111;overflow:hidden'
  root.innerHTML = ''
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;inset:0'
  root.append(host)
  let stop: (() => void) | null = null
  let current: PreviewMsg | null = null

  const play = () => {
    if (!current) return
    stop?.()
    host.innerHTML = ''
    const stage = document.createElement('div')
    host.append(stage)
    stop = playCompositionBoard({
      host: stage,
      board: current.board,
      nowMs: () => Date.now(),
      timeZone: current.timezone ?? null,
      freshness: 'fresh',
      objectUrl: async (u) => u,
      orderUrl: current.orderUrl ?? null,
      onShown: () => {},
      // En bucle, como en la pantalla.
      onDone: (ok, reason) => { if (reason !== 'cancelada') setTimeout(play, ok ? 300 : 1500) },
    })
  }

  window.addEventListener('message', (e: MessageEvent) => {
    if (!ALLOWED.has(e.origin)) return
    const d = e.data as PreviewMsg
    if (!d || d.type !== 'tgd-preview' || !d.board || d.board.kind !== 'composition') return
    current = d
    play()
  })
  // Aviso al panel de que ya puede mandar la composición (sin datos).
  window.parent?.postMessage({ type: 'tgd-preview-ready' }, '*')
}
