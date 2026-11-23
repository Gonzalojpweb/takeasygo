// ============================================================================
// TakeasyGO Pantallas — entrada
// ============================================================================
// /diagnostico → chequeos del equipo (Entrega A)
// /preview     → vista previa de composiciones para el panel (iframe)
// /            → reproductor (vinculación si no tiene token)
// ============================================================================

import { CURRENT_BUILD } from './build'
import { mountDiagnostico } from './diagnostico/page'
import { mountPreview } from './preview'
import { mountPairing } from './player/pairing'
import { mountPlayer } from './player/player'
import { store } from './player/store'

declare global {
  interface Window { __tgdBooted?: boolean; __tgdUnsupported?: boolean; __tgdSwError?: string }
}
// El chequeo previo de index.html (sin módulos) espera esta marca: si no
// aparece, muestra «no se pudo iniciar» en lugar de una pantalla en blanco.
window.__tgdBooted = true

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || CURRENT_BUILD.version === 'dev') return
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    // Si el SW instaló pero falla, queda registrado el motivo para el diagnóstico.
    const watch = (w: ServiceWorker | null) => w?.addEventListener('statechange', () => {
      if (w.state === 'redundant' && !navigator.serviceWorker.controller) window.__tgdSwError = 'la instalación del service worker falló (redundant)'
    })
    watch(reg.installing)
    reg.addEventListener('updatefound', () => watch(reg.installing))
  } catch (e) {
    window.__tgdSwError = `no se pudo registrar: ${(e as Error).message}`
    console.warn('[display] no se pudo registrar el service worker', e)
  }
}

/** Reproductor: si la pantalla tiene token, reproduce; si no (o la revocan), vinculación. */
function mountApp(root: HTMLElement) {
  const startPairing = () => mountPairing(root, startPlayer)
  const startPlayer = () => mountPlayer(root, startPairing)
  if (store.token()) startPlayer()
  else startPairing()
}

const root = document.getElementById('app')!
const route = location.pathname.replace(/\/+$/, '')
if (window.__tgdUnsupported) { /* el chequeo previo ya mostró el mensaje */ }
else if (route === '/diagnostico') mountDiagnostico(root)
// Vista previa del panel (iframe): sin vincular, sin token y sin service worker.
else if (route === '/preview') mountPreview(root)
else mountApp(root)
if (!window.__tgdUnsupported && route !== '/preview') void registerServiceWorker()
