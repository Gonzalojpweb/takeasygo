/**
 * apiKeyAuth.ts — Autenticación dual para TakeasyGO
 *
 * Soporta dos mecanismos de autenticación:
 *   1. Sesión cookie NextAuth  → flujo interno (admin panel, browser)
 *   2. Bearer Token (API Key)  → clientes externos (POS, PWA, integraciones)
 *
 * Las API Keys siguen el patrón Stripe:
 *   - Se generan con crypto.randomBytes(32)
 *   - Tienen el prefijo `tgo_live_` para identificación rápida en logs
 *   - Se almacenan como SHA-256 hash en la DB — nunca en claro
 *   - Se muestran una sola vez al crear
 *   - El cliente las envía como: Authorization: Bearer tgo_live_<token>
 */

import crypto from 'crypto'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'

// ── Constantes ────────────────────────────────────────────────────────────────

const API_KEY_PREFIX = 'tgo_live_'
const MAX_KEYS_PER_TENANT = 10

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Genera un nuevo API Key en claro.
 * tgo_live_<32 bytes en base64url> = ~55 caracteres de entropía alta
 */
export function generateApiKey(): string {
  return `${API_KEY_PREFIX}${crypto.randomBytes(32).toString('base64url')}`
}

/**
 * Hashea un API Key para almacenamiento seguro.
 * SHA-256 determinístico — permite comparar sin guardar el valor real.
 */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}

/**
 * Extrae el Bearer Token del header Authorization.
 * Devuelve null si no está presente o tiene formato incorrecto.
 */
function extractBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7).trim()
  return token.startsWith(API_KEY_PREFIX) ? token : null
}

// ── Autenticación para endpoints protegidos por tenant ────────────────────────

/**
 * Verifica la autenticación del request para un tenant específico.
 *
 * Prioridad:
 *   1. Sesión NextAuth válida (admin panel)
 *   2. API Key Bearer Token del tenant
 *
 * Devuelve null si la autenticación es correcta.
 * Devuelve un NextResponse de error (401/403) si falla.
 */
export async function requireAuthOrApiKey(
  request: NextRequest,
  tenantId: string
): Promise<NextResponse | null> {
  // ── Intento 1: sesión cookie NextAuth (flujo existente, no rompe nada) ──────
  try {
    const session = await auth()
    if (session) {
      const isSuperAdmin = session.user.role === 'superadmin'
      const belongsToTenant = session.user.tenantId === tenantId
      if (isSuperAdmin || belongsToTenant) return null
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }
  } catch {
    // NextAuth puede fallar en contextos sin cookie — continuamos al siguiente método
  }

  // ── Intento 2: Bearer Token (API Key externa) ────────────────────────────────
  const token = extractBearerToken(request)
  if (!token) {
    return NextResponse.json(
      { error: 'No autorizado. Se requiere sesión activa o API Key válida.' },
      { status: 401 }
    )
  }

  const keyHash = hashApiKey(token)

  await connectDB()
  const tenant = await Tenant.findOne({
    _id: tenantId,
    status: { $in: ['active', 'paused'] },
    'externalApiKeys': {
      $elemMatch: {
        keyHash,
        isActive: true,
      },
    },
  }).select('_id externalApiKeys').lean() as any

  if (!tenant) {
    return NextResponse.json(
      { error: 'API Key inválida o revocada.' },
      { status: 401 }
    )
  }

  // Actualizar lastUsedAt de la key usada (fire-and-forget, no bloquea el request)
  Tenant.updateOne(
    { _id: tenantId, 'externalApiKeys.keyHash': keyHash },
    { $set: { 'externalApiKeys.$.lastUsedAt': new Date() } }
  ).catch(() => {})

  return null
}

// ── Gestión de API Keys (para los endpoints de settings) ──────────────────────

/**
 * Lista las API Keys de un tenant de forma segura.
 * Nunca expone el keyHash.
 */
export function sanitizeApiKeysForClient(keys: any[]) {
  return keys.map((k, i) => ({
    index: i,
    label: k.label,
    createdAt: k.createdAt,
    lastUsedAt: k.lastUsedAt,
    isActive: k.isActive,
    // Los primeros 8 chars del hash sirven como identificador visual (como Stripe)
    keyPreview: `tgo_live_...${k.keyHash.slice(-6)}`,
  }))
}

/**
 * Valida que el tenant no supere el límite de keys activas.
 */
export function canAddMoreKeys(tenant: any): boolean {
  const activeCount = (tenant.externalApiKeys ?? []).filter((k: any) => k.isActive).length
  return activeCount < MAX_KEYS_PER_TENANT
}
