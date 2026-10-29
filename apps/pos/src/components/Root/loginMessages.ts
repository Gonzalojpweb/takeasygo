import type { LoginErrorInfo } from "../../hooks/AuthContext"

// ============================================================================
// R5 — Fragmentos de error del root (copy ES-AR, voz de la operación)
// ============================================================================
// Ningún error se muestra como texto crudo del servidor: cada uno tiene
// título, explicación (qué pasó / qué hacer) y tono (color + texto).
// No se inventan datos que el servidor no da (p. ej. intentos restantes).
// ============================================================================

export type NoticeTone = "warning" | "error" | "brand"

export interface LoginNotice {
  title: string
  body: string
  tone: NoticeTone
  /** El root reintenta solo (sin conexión). */
  autoRetry?: boolean
}

export function loginNoticeFor(info: LoginErrorInfo, mode: "pin" | "email"): LoginNotice {
  switch (info.kind) {
    case "network":
      return {
        title: "Sin conexión al servidor",
        body: "Guardamos lo que tipeaste. Reintentamos solos cada 5 s; también podés reintentar ahora.",
        tone: "warning",
        autoRetry: true,
      }
    case "credentials":
      return {
        title: mode === "pin" ? "PIN incorrecto" : "Email o contraseña incorrectos",
        body: "Revisalo y volvé a intentar. Si te equivocás varias veces seguidas, el acceso se bloquea unos minutos por seguridad.",
        tone: "error",
      }
    case "locked":
      return {
        title: "Acceso bloqueado por seguridad",
        body: "Hubo varios intentos fallidos con este usuario. Esperá a que termine la cuenta regresiva o pedile ayuda al encargado.",
        tone: "error",
      }
    case "rate_limited":
      return {
        title: "Demasiados intentos desde este equipo",
        body: "Esperá un momento antes de volver a intentar.",
        tone: "warning",
      }
    case "role":
      return {
        title: "Tu usuario no tiene acceso al POS",
        body: "Pedile al administrador que te asigne un rol de caja, encargado o mozo.",
        tone: "brand",
      }
    case "location":
      return {
        title: "Ese local ya no está disponible",
        body: "Puede que lo hayan dado de baja. Volvé a entrar y elegí otro local.",
        tone: "warning",
      }
    case "server":
      return {
        title: "El servidor no respondió bien",
        body: "Es un problema nuestro, no de tus datos. Probá de nuevo en unos segundos.",
        tone: "warning",
        autoRetry: true,
      }
    default:
      return {
        title: "No pudimos validar el ingreso",
        body: "Probá de nuevo. Si sigue pasando, avisale al encargado.",
        tone: "error",
      }
  }
}

/** mm:ss para la cuenta regresiva de un bloqueo. */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}
