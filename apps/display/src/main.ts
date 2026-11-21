// ============================================================================
// TakeasyGO Pantallas — entrada
// ============================================================================
// /diagnostico → chequeos del equipo (Entrega A)
// /            → reproductor (vinculación si no tiene token)
// ============================================================================

import { CURRENT_BUILD } from './build'
import { mountDiagnostico } from './diagnostico/page'
import { mountPairing } from './player/pairing'
import { mountPlayer } from './player/player'
import { store } from './player/store'

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || CURRENT_BUILD.version === 'dev') return
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  } catch (e) {
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
if (location.pathname.replace(/\/+$/, '') === '/diagnostico') mountDiagnostico(root)
else mountApp(root)
void registerServiceWorker()
