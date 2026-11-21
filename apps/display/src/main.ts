// ============================================================================
// TakeasyGO Pantallas — entrada
// ============================================================================
// /diagnostico → chequeos del equipo (Entrega A)
// /            → reproductor (Entrega C; por ahora, acceso al diagnóstico)
// ============================================================================

import { CURRENT_BUILD } from './build'
import { mountDiagnostico } from './diagnostico/page'

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || CURRENT_BUILD.version === 'dev') return
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  } catch (e) {
    console.warn('[display] no se pudo registrar el service worker', e)
  }
}

function mountHome(root: HTMLElement) {
  root.innerHTML = `
    <main style="min-height:100vh;display:grid;place-items:center;padding:24px;text-align:center">
      <div>
        <h1 style="font-size:24px;margin:0 0 8px">TakeasyGO Pantallas</h1>
        <p style="color:var(--muted);margin:0 0 16px">El reproductor llega en la próxima entrega.</p>
        <a href="/diagnostico" style="display:inline-block;min-height:48px;line-height:48px;padding:0 20px;border-radius:12px;background:#fff;color:#000;font-weight:700;text-decoration:none">Abrir diagnóstico del equipo</a>
        <p style="color:var(--muted);font-size:12px;margin-top:16px">Versión ${CURRENT_BUILD.version}</p>
      </div>
    </main>`
}

const root = document.getElementById('app')!
if (location.pathname.replace(/\/+$/, '') === '/diagnostico') mountDiagnostico(root)
else mountHome(root)
void registerServiceWorker()
