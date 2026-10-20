// ============================================================================
// site-url.ts — Dirección canónica única de la plataforma
// ============================================================================
// Toda URL que se le muestra al cliente o se le pasa a Mercado Pago (avisos
// de pago por WhatsApp/push, back_urls de preferencias, notification_url,
// links de tracking) debe salir de acá, no del origin de la request: el
// mismo recurso es alcanzable por www / apex / staging y un aviso con host
// distinto al de la preferencia genera saltos entre dominios.
//
// Precedencia:
//   1. NEXT_PUBLIC_URL  — variable definida por entorno (prod: https://www.takeasygo.com)
//   2. NEXTAUTH_URL     — fallback (ya existe y apunta al dominio canónico de auth)
//   3. origin de la request — último recurso (dev local / requests sin env)
//
// OJO: esto solo cambia las URLs que creamos AHORA. Las preferencias ya
// creadas conservan sus back_urls/notification_url originales y el webhook
// de MP no valida el host de origen — siguen llegando y procesándose igual.
// ============================================================================

import type { NextRequest } from 'next/server'

/** Dirección canónica (sin barra final) para URLs de avisos y retornos. */
export function getBaseUrl(request?: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_URL || process.env.NEXTAUTH_URL
  if (envUrl) return envUrl.replace(/\/+$/, '')
  if (request) return request.nextUrl.origin.replace(/\/+$/, '')
  return ''
}

/**
 * Para componentes client-side (window no existe en el server).
 * En client el bundle ya inlinó NEXT_PUBLIC_URL; si no, cae al origin.
 */
export function getClientBaseUrl(): string {
  if (typeof window === 'undefined') return ''
  const envUrl = process.env.NEXT_PUBLIC_URL
  if (envUrl) return envUrl.replace(/\/+$/, '')
  return window.location.origin
}
