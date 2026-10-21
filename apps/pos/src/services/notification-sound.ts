// ============================================================================
// Notification Sound — Reproduce un sonido al recibir un pedido nuevo
// ============================================================================
// Usa el archivo LLAMADA.mp3 que ya existe en /public. Un ÚNICO elemento de
// audio para todo el POS: si dos avisos llegan juntos (socket + cola de
// entrantes) suenan una vez, no superpuestos.
//
// Autoplay (Auditoría POS Online V1 §7.4): los navegadores bloquean el audio
// hasta la primera interacción del usuario. Si el POS quedó abierto sin
// clics, el primer pedido no sonaba. installAudioUnlock() "desbloquea" el
// elemento en el primer toque/tecla (play silencioso + pausa) y emite
// `audio:unlocked`; mientras tanto el Header muestra "Activar sonido".
// ============================================================================

let audioElement: HTMLAudioElement | null = null
let unlocked = false

function getAudio(): HTMLAudioElement {
  if (!audioElement) {
    audioElement = new Audio("/LLAMADA.mp3")
    audioElement.volume = 0.7
  }
  return audioElement
}

export function isAudioUnlocked(): boolean {
  return unlocked
}

/** Intenta desbloquear el audio (debe correr dentro de un gesto del usuario). */
export async function unlockAudio(): Promise<boolean> {
  if (unlocked) return true
  try {
    const audio = getAudio()
    audio.muted = true
    await audio.play()
    audio.pause()
    audio.currentTime = 0
    audio.muted = false
    unlocked = true
    window.dispatchEvent(new CustomEvent("audio:unlocked"))
    return true
  } catch {
    if (audioElement) audioElement.muted = false
    return false
  }
}

/**
 * Engancha el desbloqueo al primer gesto del usuario en cualquier parte del
 * POS. Idempotente; devuelve la función para desengancharlo.
 */
export function installAudioUnlock(): () => void {
  if (typeof window === "undefined") return () => {}
  const events = ["pointerdown", "keydown", "touchstart"] as const
  const handler = () => {
    void unlockAudio().then((ok) => {
      if (ok) events.forEach((e) => window.removeEventListener(e, handler))
    })
  }
  events.forEach((e) => window.addEventListener(e, handler, { passive: true }))
  return () => events.forEach((e) => window.removeEventListener(e, handler))
}

/**
 * Reproduce el sonido de notificación de pedido nuevo.
 * Fire-and-forget: si el autoplay sigue bloqueado no lanza (el Header ya
 * está mostrando "Activar sonido").
 */
export function playOrderNotification(): void {
  try {
    const audio = getAudio()
    audio.currentTime = 0
    audio.play().catch(() => {
      // Autoplay bloqueado: falta la primera interacción del usuario.
    })
  } catch {
    // Audio no soportado o archivo no disponible — ignorar
  }
}
