// ============================================================================
// Actualización de la app (service worker) — una sola versión viva del POS
// ============================================================================
// Problema que resuelve: el SW precacheaba index.html y lo servía cache-first.
// Al abrir el POS se veía la versión GUARDADA mientras la nueva se instalaba en
// segundo plano; como logout/login no recargan la página, convivían dos
// versiones según hubiera o no un F5 de por medio. "Borrar caché" no lo
// arregla porque el SW y su Cache Storage son almacenamiento del sitio.
//
// Política:
//  1. Las navegaciones (index.html) van NetworkFirst (vite.config.ts): con
//     internet siempre se carga la última versión publicada. El precache queda
//     solo para JS/CSS con hash y para funcionar sin conexión.
//  2. El SW nuevo se activa apenas se instala (skipWaiting + clientsClaim) y
//     esta página se entera por `controllerchange`.
//  3. Si no hay sesión activa (login / carga) se recarga sola al instante.
//     Con sesión activa NO se recarga sola (podría haber un pedido a medio
//     cargar): muestra un aviso persistente para actualizar, y al cerrar
//     sesión se aplica automáticamente (App.tsx).
//  4. Se buscan versiones nuevas cada 5 min, al volver a la pestaña y al
//     recuperar la conexión, así un POS abierto todo el día no queda viejo.
// ============================================================================

const CHECK_INTERVAL_MS = 5 * 60 * 1000
/** Evita bucles de recarga si algo sale mal (una recarga cada 30 s como máximo). */
const RELOAD_GUARD_KEY = "pos:sw-reload-at"
const RELOAD_GUARD_MS = 30 * 1000

let updateReady = false
const listeners = new Set<() => void>()

function setUpdateReady() {
  if (updateReady) return
  updateReady = true
  listeners.forEach((l) => l())
}

export function subscribeAppUpdate(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function isAppUpdateReady(): boolean {
  return updateReady
}

/** Recarga para tomar la versión nueva. Devuelve false si el guard lo impidió. */
export function applyAppUpdate(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0)
    if (Date.now() - last < RELOAD_GUARD_MS) return false
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()))
  } catch {
    // sessionStorage bloqueado: recargamos igual (sin guard).
  }
  window.location.reload()
  return true
}

export function registerAppUpdates(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return

  // Sin controller = primera instalación: la página ya vino de la red, el
  // `controllerchange` del clientsClaim inicial no es una versión nueva.
  const hadController = Boolean(navigator.serviceWorker.controller)
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) setUpdateReady()
  })

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        const check = () => {
          registration.update().catch(() => {
            // Sin red o deploy en curso: se reintenta en el próximo ciclo.
          })
        }
        setInterval(check, CHECK_INTERVAL_MS)
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") check()
        })
        window.addEventListener("online", check)
      })
      .catch((err) => {
        console.error("[app-update] no se pudo registrar el service worker:", err)
      })
  })
}
