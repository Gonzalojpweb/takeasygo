/**
 * MongoDB URI helpers: enforce a non-empty explicit database name
 * 
 * Production of TakeasyGO is the default database `test` of the cluster
 * `takeasygo.ssjlhfw.mongodb.net`. A URI without an explicit database name
 * resolves to `test` → risk of accidentally writing to production.
 * This guard turns that accident into an explicit error at startup.
 */

const PROD_DEFAULT_DB_NAME = "test"

function extractAfterScheme(uri: string): string {
  const s = String(uri).trim()
  const i = s.indexOf("://")
  if (i < 0) return s
  return s.slice(i + 3)
}

function extractHostAndPath(afterScheme: string): { hasPath: boolean; path: string } {
  const atIdx = afterScheme.indexOf("@")
  const afterAuth = atIdx >= 0 ? afterScheme.slice(atIdx + 1) : afterScheme
  const slash = afterAuth.indexOf("/")
  if (slash < 0) {
    return { hasPath: false, path: "" }
  }
  const path = afterAuth.slice(slash + 1).trim()
  return { hasPath: true, path: path }
}

export function resolveMongoDbName(uri: string | undefined | null): string | null {
  if (!uri) return null
  const afterScheme = extractAfterScheme(uri)
  const { hasPath, path } = extractHostAndPath(afterScheme)
  if (!hasPath) return null
  return path === "" ? null : path
}

export function assertMongoDbName(uri: string | undefined | null): void {
  // Only throw when URI is non-empty AND lacks a db name.
  // Empty URI is handled by each app's own checks.
  if (!uri) return
  const db = resolveMongoDbName(uri)
  if (!db) {
    const m =
      "MONGODB_URI no incluye un nombre de base; Mongo usaría su base por defecto (" +
      PROD_DEFAULT_DB_NAME +
      ") en este cluster. Agregá un nombre de base explícito (p.ej. /takeasygo-staging)."
    throw new Error(m)
  }
}