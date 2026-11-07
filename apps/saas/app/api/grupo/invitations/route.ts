import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { getSessionUser } from '@/lib/apiAuth'
import { rateLimit } from '@/lib/rateLimit'
import { acceptInvitation, previewInvitation, registerFromInvitation } from '@/lib/organizations/service'
import { orgErrorResponse, readJson } from '@/lib/organizations/http'

// ============================================================================
// /api/grupo/invitations — aceptar una invitación a una organización (PR 9a)
// ============================================================================
// GET  ?token=…                       → datos para la pantalla (org, rol, email
//                                        enmascarado, si ya hay cuenta). Público
//                                        por token, con límite por IP.
// POST { token, action: 'accept' }    → acepta con la sesión actual. El email de
//                                        la cuenta debe ser el invitado.
// POST { token, action: 'register', name, password }
//                                     → crea la cuenta (rol member) y acepta. El
//                                        token prueba que recibe ese email.
// ============================================================================

function ipOf(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

export async function GET(request: NextRequest) {
  const limit = await rateLimit(`org-inv:view:${ipOf(request)}`, 30, 60_000)
  if (!limit.success) return NextResponse.json({ error: 'Demasiados intentos. Probá en un minuto.' }, { status: 429 })
  try {
    await connectDB()
    return NextResponse.json(await previewInvitation(request.nextUrl.searchParams.get('token')))
  } catch (err) {
    return orgErrorResponse(err, 'invitation-preview')
  }
}

export async function POST(request: NextRequest) {
  const limit = await rateLimit(`org-inv:post:${ipOf(request)}`, 10, 10 * 60_000)
  if (!limit.success) return NextResponse.json({ error: 'Demasiados intentos. Probá más tarde.' }, { status: 429 })
  try {
    await connectDB()
    const body = await readJson(request)
    if (body.action === 'register') {
      const result = await registerFromInvitation(body.token, { name: body.name, password: body.password })
      return NextResponse.json(result, { status: 201 })
    }
    if (body.action === 'accept') {
      const user = await getSessionUser(request)
      const result = await acceptInvitation(body.token, user?.id ?? null)
      return NextResponse.json(result)
    }
    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
  } catch (err) {
    return orgErrorResponse(err, 'invitation-accept')
  }
}
