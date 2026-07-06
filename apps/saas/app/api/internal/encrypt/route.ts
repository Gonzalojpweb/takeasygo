import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { encrypt } from '@/lib/crypto'
import { rateLimit } from '@/lib/rateLimit'
import { logAudit } from '@/lib/audit'

interface EncryptField {
  field: string
  value: string
}

const MAX_FIELDS_PER_REQUEST = 20

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const sharedSecret = process.env.INTERNAL_API_SECRET

  if (!sharedSecret) {
    console.error('[internal/encrypt] INTERNAL_API_SECRET not configured')
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  if (!authHeader || authHeader !== `Bearer ${sharedSecret}`) {
    await logAudit({
      tenantId: null,
      action: 'internal_encrypt_unauthorized',
      entity: 'internal',
      details: { reason: 'Invalid or missing INTERNAL_API_SECRET' },
      request,
    })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown'
  const callerId = request.headers.get('x-caller-id') || ip
  const rl = await rateLimit(`internal-encrypt:${callerId}`, 100, 60_000)
  if (!rl.success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  let body: { fields: EncryptField[] }
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

  const encrypted: string[] = []
  const errors: string[] = []

  for (const item of body.fields) {
    if (!item.field || !item.value) {
      encrypted.push('')
      errors.push(`Invalid field entry`)
      continue
    }

    try {
      const value = encrypt(item.value)
      encrypted.push(value)
    } catch {
      encrypted.push('')
      errors.push(`Failed to encrypt field: ${item.field}`)
    }
  }

  await logAudit({
    tenantId: null,
    action: 'internal_encrypt',
    entity: 'internal',
    details: {
      fieldsCount: body.fields.length,
      fields: body.fields.map((f) => f.field),
      errorsCount: errors.length,
    },
    request,
  })

  return NextResponse.json({ encrypted, errors: errors.length > 0 ? errors : undefined })
}
