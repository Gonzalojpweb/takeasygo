import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import CorporateAccount from '@/models/CorporateAccount'
import { getSessionUser } from '@/lib/apiAuth'
import { signCorpActivationToken } from '@/lib/corpActivation'
import { rateLimit } from '@/lib/rateLimit'
import { sendEmail } from '@/lib/email'

/**
 * Genera un link de activación (un solo uso, 24 h) para un email de la
 * cuenta corporativa (admin o empleado) que todavía no tiene User.
 *
 * Modos:
 * - Default: devuelve el link en la respuesta (uso manual/interno).
 * - CON send=true + env CORP_ACTIVATION_SEND_EMAIL=1: envía el link por
 *   email DIRECTO al administrador de la cuenta (companyAdminEmail) y no
 *   lo devuelve en la respuesta. El envío queda deshabilitado hasta que
 *   se confirme activamente (nunca se envía por chat).
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
    const wantSend = body?.send === true
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

    // Log sin el token (auditoría); el link solo se entrega por el canal elegido.
    console.log(
      `[corp-activation] link generado account=${account.companyName} email=${email} por=${requesterEmail} send=${wantSend}`
    )

    // Envío por email: solo con env var explícita Y pedido send=true.
    // El destinatario es SIEMPRE el administrador de la cuenta.
    if (wantSend) {
      if (process.env.CORP_ACTIVATION_SEND_EMAIL !== '1') {
        return NextResponse.json(
          { error: 'Envío por email deshabilitado (CORP_ACTIVATION_SEND_EMAIL)' },
          { status: 403 }
        )
      }
      await sendEmail(
        account.companyAdminEmail,
        `Activación de cuenta corporativa — ${account.companyName}`,
        activationEmailHtml(account.companyName, email, activationUrl)
      )
      return NextResponse.json({ sent: true, sentTo: account.companyAdminEmail, expiresInSeconds: 24 * 60 * 60 })
    }

    return NextResponse.json({ activationUrl, expiresInSeconds: 24 * 60 * 60 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

function activationEmailHtml(companyName: string, pendingEmail: string, activationUrl: string): string {
  return `
  <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; color: #222">
    <h2>Activación de cuenta corporativa</h2>
    <p>Hola,</p>
    <p>Recibiste este email porque la cuenta corporativa <strong>${companyName}</strong>
    necesita activar el acceso de <strong>${pendingEmail}</strong> a TakeasyGO.</p>
    <p>El link es de <strong>un solo uso</strong> y expira en <strong>24 horas</strong>.
    Al usarlo se creará la contraseña de ese usuario; no permite registrar otro email.</p>
    <p style="margin: 28px 0">
      <a href="${activationUrl}"
         style="background: #16a34a; color: #fff; padding: 12px 22px; border-radius: 8px; text-decoration: none; font-weight: 600">
        Activar cuenta
      </a>
    </p>
    <p style="color: #666; font-size: 13px">Si no esperabas este email, ignoralo. Podés pedir un link nuevo cuando quieras.</p>
  </div>`
}
