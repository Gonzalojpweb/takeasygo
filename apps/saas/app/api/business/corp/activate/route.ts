import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import CorporateAccount from '@/models/CorporateAccount'
import User from '@/models/User'
import { verifyCorpActivationToken } from '@/lib/corpActivation'
import { rateLimit } from '@/lib/rateLimit'

/**
 * Canje del link de activación de cuenta corporativa (un solo uso, 24 h).
 * Crea el User con el email EXACTO del token (no permite registrar otro).
 * El usuario queda linkeado al primer tenant de la cuenta para poder
 * iniciar sesión; el acceso a los tenants de la cuenta lo da requireCorpAccess.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const limited = await rateLimit(`corp-activate:${ip}`, 10, 60 * 60 * 1000)
    if (!limited.success) {
      return NextResponse.json({ error: 'Demasiados intentos. Intentá más tarde.' }, { status: 429 })
    }

    const body = await request.json().catch(() => null)
    const token = typeof body?.token === 'string' ? body.token : ''
    const password = typeof body?.password === 'string' ? body.password : ''

    if (!token || !password) {
      return NextResponse.json({ error: 'Token y contraseña requeridos' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 })
    }

    const verified = verifyCorpActivationToken(token)
    if (!verified.valid) {
      const msg =
        verified.reason === 'expired'
          ? 'El link de activación expiró. Pedí uno nuevo.'
          : 'Link de activación inválido'
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    await connectDB()

    const account = await CorporateAccount.findOne({
      _id: verified.accountId,
      status: 'active',
    })
    if (!account) {
      return NextResponse.json({ error: 'Cuenta corporativa no encontrada o suspendida' }, { status: 404 })
    }

    // El email del token debe seguir siendo el admin o un empleado de la cuenta
    const isMember =
      account.companyAdminEmail === verified.email ||
      account.employeeEmails.some((e: string) => e.toLowerCase() === verified.email)
    if (!isMember) {
      return NextResponse.json({ error: 'El email del link ya no pertenece a la cuenta' }, { status: 403 })
    }

    // Un solo uso: si ya existe un usuario con ese email, no se crea otro
    const existing = await User.findOne({ email: verified.email })
    if (existing) {
      return NextResponse.json({ error: 'Esta cuenta ya fue activada. Iniciá sesión.' }, { status: 409 })
    }

    const primaryTenantId = account.tenantIds?.[0] ?? null
    if (!primaryTenantId) {
      return NextResponse.json(
        { error: 'La cuenta corporativa no tiene tenants asignados. Contactá a soporte.' },
        { status: 409 }
      )
    }

    await User.create({
      name: account.companyName,
      email: verified.email,
      password,
      role: 'staff',
      tenantId: primaryTenantId,
      assignedLocations: [],
      assignedTenants: [],
      isActive: true,
    })

    return NextResponse.json({ activated: true })
  } catch (error) {
    return NextResponse.json({ error: 'Error al activar la cuenta' }, { status: 500 })
  }
}
