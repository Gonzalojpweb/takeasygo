// ============================================================================
// Notification Sound — Reproduce un sonido al recibir un pedido nuevo
// ============================================================================
// Usa el archivo LLAMADA.mp3 que ya existe en /public.
// El Audio context se crea bajo demanda (requiere interacción del usuario
// en móviles antes de poder reproducir audio).
// ============================================================================

let audioElement: HTMLAudioElement | null = null

function getAudio(): HTMLAudioElement {
  if (!audioElement) {
    audioElement = new Audio("/LLAMADA.mp3")
    audioElement.volume = 0.7
  }
  return audioElement
}

/**
 * Reproduce el sonido de notificación de pedido nuevo.
 * Fire-and-forget: si falla (autoplay bloqueado), silenciosamente ignora.
 */
export function playOrderNotification(): void {
  try {
    const audio = getAudio()
    audio.currentTime = 0
    audio.play().catch(() => {
      // Autoplay bloqueado — primera interacción del usuario aún no ocurrió.
      // El sonido se reproducirá en el próximo intento.
    })
  } catch {
    // Audio no soportado o archivo no disponible — ignorar
  }
}
