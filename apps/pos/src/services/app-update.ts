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
//  5. Sello de versión (2026-10-23), independiente del SW: cada build lleva
//     su commit adentro (__POS_BUILD__) y en /version.json (sin caché). Al
//     abrir, si no coinciden, esta página vino de una copia vieja (un SW
//     anterior, un caché): se desregistra el SW, se borra Cache Storage y se
//     recarga. Tope: 2 limpiezas cada 2 minutos (anti-bucle).
//  6. Salida manual: pos.takeasygo.com/?reset=1 hace la misma limpieza.
// ============================================================================

const CHECK_INTERVAL_MS = 5 * 60 * 1000
/** Evita bucles de recarga si algo sale mal (una recarga cada 30 s como máximo). */
const RELOAD_GUARD_KEY = "pos:sw-reload-at"
const RELOAD_GUARD_MS = 30 * 1000

/** Versión de ESTE bundle. En tests y desarrollo, 'dev'. */
export const CURRENT_BUILD: { version: string; builtAt: string } =
  typeof __POS_BUILD__ !== "undefined" ? __POS_BUILD__ : { version: "dev", builtAt: "" }

/** «Versión 273436d2 · 23/10 18:40» — para saber qué versión tiene cada equipo. */
export function versionLabel(b = CURRENT_BUILD): string {
  if (!b.builtAt) return `Versión ${b.version}`
  const d = new Date(b.builtAt)
  const when = d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
  return `Versión ${b.version} · ${when}`
}

const RESET_GUARD_KEY = "pos:hard-reset"
const RESET_WINDOW_MS = 2 * 60 * 1000
const RESET_MAX = 2
const VERSION_TIMEOUT_MS = 3000

/** ¿Este bundle quedó viejo frente a lo publicado? */
let staleBuild = false

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

/** Versión publicada (lo que sirve el servidor ahora). null sin red o en desarrollo. */
export async function fetchPublishedVersion(): Promise<string | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), VERSION_TIMEOUT_MS)
  try {
    const res = await fetch(`/version.json?ts=${Date.now()}`, { cache: "no-store", signal: ctrl.signal })
    if (!res.ok) return null
    const data = (await res.json()) as { version?: unknown }
    return typeof data.version === "string" ? data.version : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Anti-bucle: como mucho RESET_MAX limpiezas por ventana (localStorage sobrevive al reload). */
export function canHardReset(now = Date.now()): boolean {
  try {
    const raw = localStorage.getItem(RESET_GUARD_KEY)
    const times = (raw ? (JSON.parse(raw) as number[]) : []).filter((t) => now - t < RESET_WINDOW_MS)
    if (times.length >= RESET_MAX) return false
    localStorage.setItem(RESET_GUARD_KEY, JSON.stringify([...times, now]))
    return true
  } catch {
    return true
  }
}

/**
 * Limpieza total del sitio: desregistra los service workers, borra Cache
 * Storage y recarga desde la red. No toca la sesión ni los datos locales
 * del POS (IndexedDB): solo la copia de la aplicación.
 */
export async function hardReset(): Promise<void> {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? []
    await Promise.all(regs.map((r) => r.unregister()))
  } catch {
    // seguimos igual
  }
  try {
    const keys = (await caches?.keys?.()) ?? []
    await Promise.all(keys.map((k) => caches.delete(k)))
  } catch {
    // seguimos igual
  }
  const url = new URL(window.location.href)
  url.searchParams.delete("reset")
  window.location.replace(url.toString())
}

/**
 * Al abrir: si el bundle no es el publicado (o se pidió ?reset=1), limpia y
 * recarga. Devuelve 'reloading' si va a recargar (no hace falta renderizar).
 */
export async function ensureLatestBuild(): Promise<"ok" | "reloading"> {
  if (!import.meta.env.PROD) return "ok"
  const wantsReset = new URL(window.location.href).searchParams.get("reset") === "1"
  if (wantsReset) {
    await hardReset()
    return "reloading"
  }
  const published = await fetchPublishedVersion()
  if (published && published !== CURRENT_BUILD.version) {
    staleBuild = true
    if (canHardReset()) {
      console.warn(`[app-update] versión vieja (${CURRENT_BUILD.version}); publicada ${published}: limpiando`)
      await hardReset()
      return "reloading"
    }
    // Tope alcanzado: se muestra el aviso para actualizar a mano.
    setUpdateReady()
  }
  return "ok"
}

/** Recarga para tomar la versión nueva. Devuelve false si el guard lo impidió. */
export function applyAppUpdate(): boolean {
  // Bundle viejo frente a lo publicado: una recarga común podría volver a
  // servir la copia guardada; se hace la limpieza total.
  if (staleBuild && canHardReset()) {
    void hardReset()
    return true
  }
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
          // Control independiente del SW: ¿hay una versión publicada distinta?
          void fetchPublishedVersion().then((published) => {
            if (published && published !== CURRENT_BUILD.version) {
              staleBuild = true
              setUpdateReady()
            }
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
