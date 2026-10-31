import mongoose from 'mongoose'
import { decrypt } from '@/lib/crypto'
import FiscalProfile, { type FiscalEnvironment } from '@/models/FiscalProfile'
import { getWsfeAuth } from './wsaa'
import { ArcaError, type FetchLike, type WsfeAuth } from './wsfe'

// ============================================================================
// Sesión con ARCA de un comercio: credenciales descifradas SOLO en memoria
// ============================================================================
// Fase 4 de caja (2026-10). Única puerta para obtener un `WsfeAuth`. El
// certificado y la clave nunca salen de esta función ni se loguean.
// ============================================================================

function envLabel(env: FiscalEnvironment): string {
  return env === 'production' ? 'producción' : 'homologación'
}

export interface ArcaSession {
  environment: FiscalEnvironment
  cuit: string
  auth: WsfeAuth
  fetchImpl?: FetchLike
}

interface SecretProfile {
  cuit?: string
  environment?: FiscalEnvironment
  credentials?: { certificate?: string; privateKey?: string }
}

/**
 * Identidad fiscal que la operación exige. Si se pasa, la sesión SOLO se abre
 * cuando el perfil actual coincide: un comprobante creado en homologación (o
 * con otro CUIT) nunca se emite con la configuración nueva.
 */
export interface ExpectedIdentity {
  environment: FiscalEnvironment
  cuit: string | null
}

export async function openArcaSession(
  tenantId: mongoose.Types.ObjectId | string,
  options: { fetchImpl?: FetchLike; forceRefresh?: boolean; expect?: ExpectedIdentity } = {}
): Promise<ArcaSession> {
  const profile = await FiscalProfile.findOne({ tenantId })
    .select('cuit environment +credentials.certificate +credentials.privateKey')
    .lean<SecretProfile>()
  if (!profile?.cuit) throw new ArcaError('auth', 'Faltan los datos fiscales del comercio')
  if (!profile.credentials?.certificate || !profile.credentials.privateKey) {
    throw new ArcaError('auth', 'Falta el certificado de ARCA')
  }
  let certificatePem: string
  let privateKeyPem: string
  try {
    certificatePem = decrypt(profile.credentials.certificate)
    privateKeyPem = decrypt(profile.credentials.privateKey)
  } catch {
    throw new ArcaError('auth', 'No se pudo leer el certificado guardado. Volvé a cargarlo.')
  }
  const environment = profile.environment ?? 'homologation'
  if (options.expect) {
    if (options.expect.environment !== environment) {
      throw new ArcaError(
        'identity',
        `El comprobante es de ${envLabel(options.expect.environment)} y el comercio ahora factura en ${envLabel(environment)}. No se emite: revisalo.`,
        'environment_mismatch'
      )
    }
    if (!options.expect.cuit || options.expect.cuit !== profile.cuit) {
      throw new ArcaError(
        'identity',
        'El comprobante se creó con otro CUIT del emisor. No se emite: revisalo.',
        'cuit_mismatch'
      )
    }
  }
  const auth = await getWsfeAuth({
    tenantId,
    environment,
    cuit: profile.cuit,
    certificatePem,
    privateKeyPem,
    fetchImpl: options.fetchImpl,
    forceRefresh: options.forceRefresh,
  })
  return { environment, cuit: profile.cuit, auth, fetchImpl: options.fetchImpl }
}
