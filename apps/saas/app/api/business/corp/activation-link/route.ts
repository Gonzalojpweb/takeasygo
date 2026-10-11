import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import CorporateAccount from '@/models/CorporateAccount'
import { getSessionUser } from '@/lib/apiAuth'
import { signCorpActivationToken } from '@/lib/corpActivation'
import { rateLimit } from '@/lib/rateLimit'

/**
 * Genera un link de activación (un solo uso, 24 h) para un email de la
 * cuenta corporativa (admin o empleado) que todavía no tiene User.
 *
 * Por decisión de producto, POR AHORA NO SE ENVÍA NINGÚN EMAIL: el link
 * se devuelve en la respuesta para uso manual/interno. El envío masivo a
 * las cuentas sin usuario queda pendiente de aprobación explícita.
 *
 * Ruta global (la cuenta corporativa es multi-tenant): el usuario debe
 * tener sesión y ser companyAdminEmail de la cuenta dueña del email.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    const requesterEmail = (user?.email ?? '').toLowerCase().trim()
    if (!user?.id || !requesterEmail) {
      return NextResponse.json({ error: 'Autenticación requerida' }, { status: 401 })
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const limited = await rateLimit(`corp-activation-link:${user.id}:${ip}`, 30, 60 * 60 * 1000)
    if (!limited.success) {
      return NextResponse.json({ error: 'Demasiados intentos. Intentá más tarde.' }, { status: 429 })
    }

    const body = await request.json().catch(() => null)
    const email = typeof body?.email === 'string' ? body.email.toLowerCase().trim() : ''
    if (!email) {
      return NextResponse.json({ error: 'Email requerido' }, { status: 400 })
    }

    await connectDB()

    // Solo el admin de la cuenta dueña del email puede generar el link
    const account = await CorporateAccount.findOne({
      status: 'active',
      companyAdminEmail: requesterEmail,
    })
    if (!account) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const isMember =
      account.companyAdminEmail === email ||
      account.employeeEmails.some((e: string) => e.toLowerCase() === email)
    if (!isMember) {
      return NextResponse.json({ error: 'El email no pertenece a la cuenta corporativa' }, { status: 403 })
    }

    const token = signCorpActivationToken(String(account._id), email)
    if (!token) {
      return NextResponse.json(
        { error: 'Falta CORPORATE_ACTIVATION_SECRET o AUTH_SECRET para firmar el token' },
        { status: 500 }
      )
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://takeasygo.com'
    const activationUrl = `${baseUrl}/app/corp/activate?token=${encodeURIComponent(token)}`

    // Log sin el token (auditoría); el link solo se devuelve en la respuesta.
    console.log(
      `[corp-activation] link generado account=${account.companyName} email=${email} por=${requesterEmail}`
    )

    return NextResponse.json({ activationUrl, expiresInSeconds: 24 * 60 * 60 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
