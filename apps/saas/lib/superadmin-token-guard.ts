import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getAccessMode, recordShadow } from '@/lib/access-central'

// ============================================================================
// Guardia de superadmin por cookie (tablero del superadmin) — PR 2 multi-marca
// ============================================================================
// Las 11 rutas de /api/superadmin/dashboard/* NO pueden importar `auth()`:
// la cadena apiAuth → auth → auth-adapter rompe el orden de carga de chunks
// (TDZ). Por eso leen la cookie con `getToken` (import dinámico). Antes cada
// ruta repetía este bloque; ahora vive acá (excepción permanente del contrato
// identity-access-contract).
//   off/log → decisión de siempre: rol del token o, si falta, el de la base.
//   enforce → rol y estado de la base (S5: quitar el superadmin corta ya).
// ============================================================================

async function connect(): Promise<typeof import('mongoose')['default']> {
  const mod = await import('mongoose')
  const mongoose = mod.default ?? mod
  if (mongoose.connection.readyState !== 1) await mongoose.connect(process.env.MONGODB_URI!)
  return mongoose
}

export async function requireSuperAdminByToken(request: NextRequest, family = 'superadmin-dashboard'): Promise<NextResponse | null> {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!secret) {
    console.error(`[${family}] AUTH_SECRET not configured`)
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }
  const denied = () => NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  const { getToken } = await import('next-auth/jwt')
  const token = await getToken({ req: request as never, secret, secureCookie: process.env.NODE_ENV === 'production' })
  if (!token) return denied()

  const loadDbUser = async () => {
    if (!token.id) return null
    await connect()
    const User = (await import('@/models/User')).default
    return User.findById(token.id).select('role isActive').lean<{ role: string; isActive?: boolean }>()
  }

  // Decisión de siempre (token, con respaldo en la base si falta el rol).
  let oldOk = token.role === 'superadmin'
  let dbUser: { role: string; isActive?: boolean } | null | undefined
  if (!oldOk) {
    dbUser = await loadDbUser()
    oldOk = dbUser?.role === 'superadmin'
  }

  const mode = await getAccessMode()
  if (mode === 'off') return oldOk ? null : denied()

  if (dbUser === undefined) dbUser = await loadDbUser()
  const newOk = dbUser?.role === 'superadmin' && dbUser.isActive !== false
  if (mode === 'log') {
    recordShadow({
      family, route: request.nextUrl?.pathname ?? null, userId: (token.id as string) ?? null, tenantId: null,
      oldDecision: oldOk, newDecision: newOk, oldRole: (token.role as string) ?? null, newRole: dbUser?.role ?? null,
      hadJwt: true, freshFound: Boolean(dbUser) && dbUser?.isActive !== false,
    })
    return oldOk ? null : denied()
  }
  return newOk ? null : denied()
}
