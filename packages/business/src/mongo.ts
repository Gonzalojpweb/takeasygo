/**
 * Guard: exige que MONGODB_URI declare nombre de base explícito.
 *
 * Producción de TakeasyGO es la base default `test` del cluster
 * `takeasygo.ssjlhfw.mongodb.net`. Un URI sin nombre de base resuelve ahí sin
 * que nadie lo note, así que un tipeo o un entorno mal copiado puede caer en
 * producción. Este guard convierte ese accidente en un error explícito al
 * arrancar, en vez de dejar que MongoDB use el default.
 */

/** Nombre de base por defecto de MongoDB (= producción en este cluster). */
export const PROD_DEFAULT_DB_NAME = "test"

/** Extrae el nombre de base explícito del URI; "" si no lo declara. */
export function resolveMongoDbName(uri: string | undefined | null): string {
  if (!uri) return ""
  const noQuery = String(uri).trim().split("?")[0]
  const afterScheme = noQuery.replace(/^[a-z0-9+.-]+:\/\//i, "")
  const slash = afterScheme.indexOf("/")
  if (slash === -1) return ""
  return afterScheme.slice(slash + 1).split("/")[0].trim()
}

/**
 * Falla con un mensaje claro si el URI no declara nombre de base.
 * @returns el nombre de base (siempre string no vacío).
 */
export function assertMongoDbName(uri: string | undefined | null): string {
  const db = resolveMongoDbName(uri)
  if (!db) {
    throw new Error(
      "MONGODB_URI no incluye un nombre de base. Mongo usaría su base por defecto " +
        `(\`${PROD_DEFAULT_DB_NAME}\` = PRODUCCIÓN en este cluster). ` +
        "Agregá el nombre de base explícito, p. ej. " +
        "...mongodb.net/takeasygo-staging?retryWrites=true."
    )
  }
  return db
}

/** true si el nombre de base resuelve al default de producción. */
export function isProdDefaultDbName(db: string): boolean {
  return db === PROD_DEFAULT_DB_NAME
}
