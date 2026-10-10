// ============================================================================
// _safety.mjs — Protección anti-producción para scripts de auditoría
// ============================================================================
// TakeasyGO: **producción es la base default `test`** del cluster
// `takeasygo.ssjlhfw.mongodb.net` (staging comparte cluster pero usa otra base).
// Un URI sin nombre de base explícito resuelve a `test` → riesgo de tocar prod
// por error. Este guard corta la ejecución salvo override explícito.
//
// Los scripts de auditoría son READ-ONLY, pero igual deben fallar ruidosamente
// si por accidente apuntan a producción.
// ============================================================================

/** Nombre de la base de producción (default de MongoDB cuando el URI no la trae). */
export const PROD_DB_NAME = 'test'

const OVERRIDE_FLAG = '--allow-prod'
const OVERRIDE_ENV = 'AUDIT_ALLOW_PROD'

/** Extrae el nombre de base efectivo del URI (o el explícito). '' => default `test`. */
export function resolveDbName(uri, explicitDb) {
  if (explicitDb) return explicitDb
  const noQuery = String(uri).split('?')[0]
  const afterScheme = noQuery.replace(/^[a-z0-9+.-]+:\/\//i, '')
  const slash = afterScheme.indexOf('/')
  if (slash === -1) return PROD_DB_NAME
  const path = afterScheme.slice(slash + 1).trim()
  return path === '' ? PROD_DB_NAME : path
}

/**
 * Corta la ejecución si el destino parece producción, salvo override explícito.
 * @returns {string} nombre de base efectivo
 */
export function guardAgainstProd(uri, explicitDb, argv = process.argv.slice(2)) {
  const dbName = resolveDbName(uri, explicitDb)
  const isProd = dbName === PROD_DB_NAME
  const override = argv.includes(OVERRIDE_FLAG) || process.env[OVERRIDE_ENV] === '1'

  if (isProd && !override) {
    console.error('')
    console.error('============================================================')
    console.error('  BLOQUEADO: el target parece ser PRODUCCION (base `test`)')
    console.error('============================================================')
    console.error(`  Base efectiva: ${dbName}  (prod TakeasyGO)`)
    console.error('  Estos scripts NUNCA deben apuntar a prod por error.')
    console.error('  Si de verdad necesitás leer prod (solo lectura), agregá:')
    console.error(`     ${OVERRIDE_FLAG}   (o env ${OVERRIDE_ENV}=1)`)
    console.error('============================================================')
    process.exit(2)
  }

  if (isProd) {
    console.warn('ADVERTENCIA: apuntando a PRODUCCION (base `test`) con override explicito (read-only).')
  }
  return dbName
}
