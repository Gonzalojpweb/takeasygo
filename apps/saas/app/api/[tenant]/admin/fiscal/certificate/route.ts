import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import FiscalProfile from '@/models/FiscalProfile'
import { decrypt, encrypt } from '@/lib/crypto'
import { logAudit } from '@/lib/audit'
import { fiscalAdminContext } from '@/lib/fiscal/admin-context'
import { certificateMatchesKey, parseCertificate } from '@/lib/fiscal/arca/crypto'

// ============================================================================
// PUT /api/[tenant]/admin/fiscal/certificate — carga el certificado de ARCA
// ============================================================================
// Fase 4 de caja (2026-10). Validaciones antes de guardar:
//   · es un X.509 válido y no venció;
//   · si trae CUIT en el sujeto, es el del comercio;
//   · corresponde a la clave del último pedido (pendiente) o a la vigente.
// Se guarda cifrado; se invalidan la prueba de conexión y el ticket de ARCA.
// ============================================================================

const bodySchema = z.object({ certificate: z.string().min(100).max(20_000) })

interface Secrets {
  cuit?: string
  environment?: string
  credentials?: { privateKey?: string; pendingPrivateKey?: string }
}

function tryDecrypt(value: string | undefined): string | null {
  if (!value) return null
  try {
    return decrypt(value)
  } catch {
    return null
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const ctx = await fiscalAdminContext(request, (await params).tenant, 'fiscal.configure')
    if ('error' in ctx) return ctx.error

    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Pegá o elegí el archivo del certificado' }, { status: 400 })
    const pem = parsed.data.certificate.trim()

    let info
    try {
      info = parseCertificate(pem)
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 })
    }
    if (info.notAfter.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'El certificado ya venció' }, { status: 400 })
    }

    const profile = await FiscalProfile.findOne({ tenantId: ctx.tenant._id })
      .select('cuit environment +credentials.privateKey +credentials.pendingPrivateKey')
      .lean<Secrets>()
    if (!profile) return NextResponse.json({ error: 'Primero guardá los datos fiscales' }, { status: 409 })
    if (info.cuit && profile.cuit && info.cuit !== profile.cuit) {
      return NextResponse.json({ error: 'El certificado es de otro CUIT' }, { status: 400 })
    }

    const pendingKey = tryDecrypt(profile.credentials?.pendingPrivateKey)
    const currentKey = tryDecrypt(profile.credentials?.privateKey)
    let keyToStore: string | null = null
    if (pendingKey && certificateMatchesKey(pem, pendingKey)) keyToStore = pendingKey
    else if (currentKey && certificateMatchesKey(pem, currentKey)) keyToStore = currentKey
    if (!keyToStore) {
      return NextResponse.json(
        { error: 'El certificado no corresponde al último pedido generado. Generá un pedido nuevo y subilo a ARCA.' },
        { status: 400 }
      )
    }

    await FiscalProfile.updateOne(
      { tenantId: ctx.tenant._id },
      {
        $set: {
          'credentials.certificate': encrypt(pem),
          'credentials.privateKey': encrypt(keyToStore),
          'credentials.pendingPrivateKey': keyToStore === pendingKey ? '' : profile.credentials?.pendingPrivateKey ?? '',
          'credentials.certificateSubject': info.subject,
          'credentials.certificateExpiresAt': info.notAfter,
          'connection.ok': false,
          'wsaa.token': '',
          'wsaa.sign': '',
          'wsaa.expiresAt': null,
          'wsaa.environment': null,
        },
      }
    )

    await logAudit({
      tenantId: ctx.tenantId,
      action: 'fiscal.certificate.upload',
      entity: 'FiscalProfile',
      entityId: ctx.tenantId,
      details: { subject: info.subject, expiresAt: info.notAfter.toISOString(), environment: profile.environment },
      request,
      userId: ctx.user?.id,
      userRole: ctx.user?.role,
    })

    return NextResponse.json({ ok: true, subject: info.subject, expiresAt: info.notAfter.toISOString() })
  } catch (err) {
    console.error('[admin/fiscal/certificate]', err)
    return NextResponse.json({ error: 'No se pudo cargar el certificado' }, { status: 500 })
  }
}
