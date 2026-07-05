// ─────────────────────────────────────────────────────────────────────────────
// POST /api/internal/decrypt — Descifrado de campos encriptados
// ─────────────────────────────────────────────────────────────────────────────
// Accesible SOLO desde red interna (Sync Layer → SaaS).
// Autenticado con INTERNAL_API_SECRET compartido (no JWT de usuario).
// Rate limited agresivamente. Logueado en auditoría.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { decrypt } from '@/lib/crypto'
import { rateLimit } from '@/lib/rateLimit'
import { logAudit } from '@/lib/audit'
import AuditLog from '@/models/AuditLog'

interface DecryptField {
  field: string
  encryptedValue: string
}

const MAX_FIELDS_PER_REQUEST = 20

export async function POST(request: NextRequest) {
  // 1. Shared secret authentication
  const authHeader = request.headers.get('authorization')
  const sharedSecret = process.env.INTERNAL_API_SECRET

  if (!sharedSecret) {
    console.error('[internal/decrypt] INTERNAL_API_SECRET not configured')
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  if (!authHeader || authHeader !== `Bearer ${sharedSecret}`) {
    await logAudit({
      tenantId: null,
      action: 'internal_decrypt_unauthorized',
      entity: 'internal',
      details: { reason: 'Invalid or missing INTERNAL_API_SECRET' },
      request,
    })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Rate limiting: 100 requests per minute per caller
  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown'
  const callerId = request.headers.get('x-caller-id') || ip
  const rl = await rateLimit(`internal-decrypt:${callerId}`, 100, 60_000)
  if (!rl.success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  // 3. Parse body
  let body: { fields: DecryptField[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.fields || !Array.isArray(body.fields) || body.fields.length === 0) {
    return NextResponse.json({ error: 'fields array is required' }, { status: 400 })
  }

  if (body.fields.length > MAX_FIELDS_PER_REQUEST) {
    return NextResponse.json(
      { error: `Too many fields. Max: ${MAX_FIELDS_PER_REQUEST}` },
      { status: 400 }
    )
  }

  // 4. Decrypt each field
  const decrypted: string[] = []
  const errors: string[] = []

  for (const item of body.fields) {
    if (!item.field || !item.encryptedValue) {
      decrypted.push('')
      errors.push(`Invalid field entry`)
      continue
    }

    try {
      const value = decrypt(item.encryptedValue)
      decrypted.push(value)
    } catch {
      // safeDecrypt pattern: if decryption fails, return empty string
      decrypted.push('')
      errors.push(`Failed to decrypt field: ${item.field}`)
    }
  }

  // 5. Audit log
  await logAudit({
    tenantId: null,
    action: 'internal_decrypt',
    entity: 'internal',
    details: {
      fieldsCount: body.fields.length,
      fields: body.fields.map((f) => f.field),
      errorsCount: errors.length,
    },
    request,
  })

  return NextResponse.json({ decrypted, errors: errors.length > 0 ? errors : undefined })
}
