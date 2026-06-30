import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { generateApiKey, hashApiKey, sanitizeApiKeysForClient, canAddMoreKeys } from '@/lib/apiKeyAuth'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRole } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'

/**
 * GET /api/[tenant]/settings/api-keys
 * Lista las API Keys activas (sin hashes)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    return NextResponse.json({
      keys: sanitizeApiKeysForClient(tenant.externalApiKeys || [])
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

/**
 * POST /api/[tenant]/settings/api-keys
 * Genera una nueva API Key
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    if (!canAddMoreKeys(tenant)) {
      return NextResponse.json({ error: 'Límite de API Keys alcanzado (máx 10)' }, { status: 400 })
    }

    const { label } = await request.json()
    const rawKey = generateApiKey()
    const keyHash = hashApiKey(rawKey)

    tenant.externalApiKeys.push({
      keyHash,
      label: label || 'Nueva API Key',
      createdAt: new Date(),
      lastUsedAt: null,
      isActive: true
    })

    await tenant.save()

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'api_key.created',
      entity: 'settings',
      details: { label },
      request,
    })

    // IMPORTANTE: Devolvemos el rawKey SOLO una vez
    return NextResponse.json({ 
      message: 'API Key generada con éxito',
      rawKey 
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

/**
 * DELETE /api/[tenant]/settings/api-keys
 * Revoca una API Key (la marca como inactiva o la elimina)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    const { keyHashPreview } = await request.json() // Identificador enviado desde el cliente

    // Buscamos la llave cuyo hash termine en los caracteres enviados
    const keyIndex = tenant.externalApiKeys.findIndex((k: any) => k.keyHash.endsWith(keyHashPreview))

    if (keyIndex === -1) {
      return NextResponse.json({ error: 'API Key no encontrada' }, { status: 404 })
    }

    const removedKey = tenant.externalApiKeys[keyIndex]
    tenant.externalApiKeys.splice(keyIndex, 1) // Eliminación física para esta Fase 1 solo por simplicidad
    await tenant.save()

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'api_key.deleted',
      entity: 'settings',
      details: { label: removedKey.label },
      request,
    })

    return NextResponse.json({ message: 'API Key revocada' })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
