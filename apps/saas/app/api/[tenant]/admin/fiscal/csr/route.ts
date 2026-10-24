import { NextRequest, NextResponse } from 'next/server'
import FiscalProfile from '@/models/FiscalProfile'
import { encrypt } from '@/lib/crypto'
import { logAudit } from '@/lib/audit'
import { fiscalAdminContext } from '@/lib/fiscal/admin-context'
import { loadFiscalProfile } from '@/lib/fiscal/profile'
import { generateKeyAndCsr } from '@/lib/fiscal/arca/crypto'
import { isValidCuit } from '@takeasygo/business'

// ============================================================================
// POST /api/[tenant]/admin/fiscal/csr — genera el pedido de certificado
// ============================================================================
// Fase 4 de caja (2026-10). La clave privada se genera acá y queda cifrada
// como `pendingPrivateKey`: la clave vigente (si la hay) sigue facturando
// hasta que se cargue el certificado nuevo. Devuelve solo el CSR (público).
// ============================================================================

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const ctx = await fiscalAdminContext(request, (await params).tenant, 'fiscal.configure')
    if ('error' in ctx) return ctx.error

    const profile = await loadFiscalProfile(ctx.tenant._id)
    if (!profile || !isValidCuit(profile.cuit) || profile.legalName.trim().length < 2) {
      return NextResponse.json({ error: 'Primero guardá el CUIT y la razón social' }, { status: 409 })
    }

    const { privateKeyPem, csrPem } = generateKeyAndCsr({ cuit: profile.cuit, legalName: profile.legalName })
    const now = new Date()
    await FiscalProfile.updateOne(
      { tenantId: ctx.tenant._id },
      {
        $set: {
          'credentials.pendingPrivateKey': encrypt(privateKeyPem),
          'credentials.csr': csrPem,
          'credentials.csrCreatedAt': now,
        },
      }
    )

    await logAudit({
      tenantId: ctx.tenantId,
      action: 'fiscal.csr.generate',
      entity: 'FiscalProfile',
      entityId: ctx.tenantId,
      details: { environment: profile.environment },
      request,
      userId: ctx.user?.id,
      userRole: ctx.user?.role,
    })

    return NextResponse.json({ csr: csrPem, csrCreatedAt: now.toISOString() })
  } catch (err) {
    console.error('[admin/fiscal/csr]', err)
    return NextResponse.json({ error: 'No se pudo generar el pedido de certificado' }, { status: 500 })
  }
}
