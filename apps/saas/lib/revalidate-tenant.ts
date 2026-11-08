import { revalidatePath } from 'next/cache'

/**
 * Invalida las páginas públicas cacheadas del tenant (menús con
 * `revalidate = 300`) para que un cambio de identidad o del menú se vea al
 * recargar, sin esperar a que venza el caché. Solo toca rutas bajo /{slug}.
 */
export function revalidateTenantPublicPages(tenantSlug: string) {
  try {
    revalidatePath(`/${tenantSlug}`, 'layout')
  } catch (error) {
    // Fuera de un request de Next (tests, scripts) no hay caché que invalidar.
    console.warn('[revalidateTenantPublicPages]', error instanceof Error ? error.message : error)
  }
}
