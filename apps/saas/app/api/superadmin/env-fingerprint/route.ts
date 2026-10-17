import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'
import crypto from 'crypto'

// GET /api/superadmin/env-fingerprint
// Devuelve hashes truncados de env sensibles para comparar deploys.
// Nunca expone valores crudos — solo los primeros 8 chars de SHA-256.
// Alcance deliberado (auditoría MP): SOLO ENCRYPTION_KEY, DB y deploy id.
// NO incluye APP_URL / NEXTAUTH_URL / WHAPI_TOKEN (no son parte del bug MP
// y agregar ruido a la comparación de deploys).
export async function GET() {
  const authError = await requireSuperAdmin()
  if (authError) return authError

  const hash8 = (v: string | undefined) =>
    v ? crypto.createHash('sha256').update(v).digest('hex').slice(0, 8) : '(no set)'

  const mongo = (() => {
    try {
      const url = new URL(process.env.MONGODB_URI || '')
      const isSrv = url.protocol === 'mongodb+srv:'
      const host = isSrv ? url.hostname : `${url.hostname}${url.port ? `:${url.port}` : ''}`
      const dbName = decodeURIComponent(url.pathname.replace(/^\//, '').split('/')[0] || '')
      return { host, dbName: dbName || '(sin nombre en URI)', isSrv }
    } catch { return { host: '(parse error)', dbName: '(parse error)', isSrv: false } }
  })()

  return NextResponse.json({
    encryptionKeyHash: hash8(process.env.ENCRYPTION_KEY),
    mongo,
    nodeEnv: process.env.NODE_ENV || '(no set)',
    deploy: {
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA || '(no set)',
      ref: process.env.VERCEL_GIT_COMMIT_REF || '(no set)',
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID || '(no set)',
    },
    timestamp: new Date().toISOString(),
  })
}
