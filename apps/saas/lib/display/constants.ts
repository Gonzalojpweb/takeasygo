// Constantes de pantallas compartidas entre rutas, reporte y tests.

/** «En línea» = último latido hace menos de 10 minutos. */
export const ONLINE_WINDOW_MS = 10 * 60 * 1000

/** Tope por comercio: piezas de pantalla activas y peso total de la biblioteca. */
export const SCREEN_MAX_ACTIVE_PIECES = 20
export const SCREEN_MAX_LIBRARY_BYTES = 1.5 * 1024 * 1024 * 1024

/** Imagen en pantalla: tiempo por defecto y rango permitido. */
export const SCREEN_IMAGE_DEFAULT_MS = 10_000
export const SCREEN_IMAGE_MIN_MS = 5_000
export const SCREEN_IMAGE_MAX_MS = 60_000

/** El reproductor vuelve a pedir el manifiesto cada 60 s (con desfase al azar). */
export const MANIFEST_POLL_S = 60
