import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import Email from 'next-auth/providers/email'
import { CredentialsSignin } from 'next-auth'
import bcrypt from 'bcryptjs'
import { connectDB } from '@/lib/mongoose'
import { authConfig } from '@/lib/auth.config'
import { Redis } from '@upstash/redis'
import { rateLimit } from '@/lib/rateLimit'
import { adapter } from '@/lib/auth-adapter'

/** Login rechazado: la cuenta no tiene (o perdió) un tenant activo. */
class TenantMissingSignin extends CredentialsSignin {
  code = 'tenant_missing'
}

/** Login de superadmin con MFA activado: falta el código de 6 dígitos. */
class MfaRequiredSignin extends CredentialsSignin {
  code = 'mfa_required'
}

/** Código MFA (o de recuperación) incorrecto o ya usado. */
class MfaInvalidSignin extends CredentialsSignin {
  code = 'mfa_invalid'
}

/**
 * Recuperación del SuperAdmin (19/11/2026): segundo factor del superadmin.
 * Devuelve true si el login queda con MFA verificado, false si la cuenta
 * todavía no activó MFA (entra como 'superadmin_pending', solo para enrolarse).
 * Lanza MfaRequired/MfaInvalid si falta o falla el código.
 */
async function verifySuperAdminMfa(userId: unknown, otp: unknown, request: Request | undefined): Promise<boolean> {
  const { default: User } = await import('@/models/User')
  const doc = await User.findById(userId).select('+mfaSecret +mfaRecoveryCodes +mfaLastStep mfaEnabled email name')
  if (!doc?.mfaEnabled || !doc.mfaSecret) return false

  const code = typeof otp === 'string' ? otp.trim() : ''
  if (!code) throw new MfaRequiredSignin()

  const { verifyTotp, matchRecoveryCode, looksLikeRecoveryCode } = await import('@/lib/totp')
  const { decrypt } = await import('@/lib/crypto')
  const { logSystemAudit } = await import('@/lib/audit')
  const { requestFingerprint, sendSecurityAlert } = await import('@/lib/security-alerts')
  const fp = requestFingerprint(request?.headers)
  const auditBase = { entity: 'session', userId: String(doc._id), userName: doc.name, userRole: 'superadmin', ip: fp.ip, userAgent: fp.userAgent }

  if (looksLikeRecoveryCode(code)) {
    const idx = matchRecoveryCode(code, doc.mfaRecoveryCodes)
    if (idx === -1) {
      await logSystemAudit({ ...auditBase, action: 'security.superadmin_mfa_failed', details: { method: 'recovery_code' } })
      throw new MfaInvalidSignin()
    }
    // Un solo uso: se borra de forma atómica (si dos logins usan el mismo
    // código a la vez, solo uno logra sacarlo de la lista).
    const used = doc.mfaRecoveryCodes![idx]
    const res = await User.updateOne({ _id: doc._id, mfaRecoveryCodes: used }, { $pull: { mfaRecoveryCodes: used } })
    if (res.modifiedCount !== 1) throw new MfaInvalidSignin()
    const left = (doc.mfaRecoveryCodes?.length ?? 1) - 1
    await logSystemAudit({ ...auditBase, action: 'security.superadmin_recovery_code_used', details: { remaining: left } })
    await sendSecurityAlert({
      accountEmail: doc.email,
      subject: 'Se usó un código de recuperación',
      summary: `Se inició sesión de SuperAdmin con un código de recuperación. Quedan ${left}.`,
      ip: fp.ip, userAgent: fp.userAgent,
    })
    return true
  }

  let secret = ''
  try { secret = decrypt(doc.mfaSecret) } catch { throw new MfaInvalidSignin() }
  const step = verifyTotp(secret, code, doc.mfaLastStep ?? null)
  if (step === null) {
    await logSystemAudit({ ...auditBase, action: 'security.superadmin_mfa_failed', details: { method: 'totp' } })
    throw new MfaInvalidSignin()
  }
  // Anti-replay atómico: solo avanza si el paso es mayor al último aceptado.
  const res = await User.updateOne(
    { _id: doc._id, $or: [{ mfaLastStep: null }, { mfaLastStep: { $exists: false } }, { mfaLastStep: { $lt: step } }] },
    { $set: { mfaLastStep: step } },
  )
  if (res.modifiedCount !== 1) throw new MfaInvalidSignin()
  return true
}

/**
 * Regla: los logins por contraseña (staff) requieren un tenant activo.
 * - superadmin: exento (acceso global, tenantId nulo por diseño).
 * - Cuenta con tenantId nulo/inexistente (p.ej. huérfana tras borrar un
 *   tenant) no puede entrar; el formulario muestra un mensaje a soporte.
 */
async function assertTenantUsable(user: { _id?: unknown; role?: string; tenantId?: unknown }) {
  // Reglas en lib/signin-guard.ts (multi-marca PR 9b: `member` entra por membresía).
  const { isSignInAllowed } = await import('@/lib/signin-guard')
  if (!(await isSignInAllowed(user))) throw new TenantMissingSignin()
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter,
  ...authConfig,
  events: {
    async signIn({ user }) {
      const u = user as any
      const { logAudit } = await import('@/lib/audit')
      logAudit({
        tenantId: u.tenantId ?? null,
        action: 'auth.login',
        entity: 'session',
        // Pass identity directly — avoids circular auth() call inside logAudit
        userId: u.id ?? null,
        userName: u.name ?? u.email ?? 'Sistema',
        userRole: u.role ?? '',
        details: { userRole: u.role },
      })
      // Track last login time
      if (u.id) {
        const { default: User } = await import('@/models/User')
        await connectDB()
        await User.findByIdAndUpdate(u.id, { lastLoginAt: new Date() }).catch((err) => {
          console.error('[auth] Failed to update lastLoginAt:', err.message)
        })
      }
    },
    async signOut(message) {
      const token = 'token' in message ? message.token : null
      if (!token) return
      const { logAudit } = await import('@/lib/audit')
      logAudit({
        tenantId: (token.tenantId as string) ?? null,
        action: 'auth.logout',
        entity: 'session',
        // Pass identity directly — avoids circular auth() call inside logAudit
        userId: (token.id as string) ?? null,
        userName: (token.name as string) ?? 'Sistema',
        userRole: (token.role as string) ?? '',
        details: { userRole: token.role },
      })
    },
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    Email({
      server: {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      },
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    }),
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        ssoCode: { label: 'SSO Code' },
        otp: { label: 'Código MFA' },
      },
      async authorize(credentials, request) {
        const [
          { default: User },
          { default: Tenant }
        ] = await Promise.all([
          import('@/models/User'),
          import('@/models/Tenant')
        ])

        // SSO via one-time auth code (from sso-callback page)
        if (credentials?.ssoCode !== undefined && typeof credentials.ssoCode !== 'string') return null
        if (credentials?.ssoCode) {
          const redis = new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL!,
            token: process.env.UPSTASH_REDIS_REST_TOKEN!,
          })
          const stored = await redis.get<string>(`ssoAuth:${credentials.ssoCode}`)
          if (!stored) return null
          await redis.del(`ssoAuth:${credentials.ssoCode}`).catch(() => {})
          const { email } = JSON.parse(stored)

          await connectDB()
          const user = await User.findOne({ email, isActive: true })
          if (!user) return null
          // El SuperAdmin nunca entra por SSO del POS: solo contraseña + MFA.
          if (user.role === 'superadmin') return null
          await assertTenantUsable(user)

          let tenantSlug: string | null = null
          if (user.tenantId) {
            const tenant = await Tenant.findById(user.tenantId).select('slug').lean<{ slug: string }>()
            tenantSlug = tenant?.slug ?? null
          }

          return {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            role: user.role,
            tenantId: user.tenantId?.toString() ?? null,
            tenantSlug,
            assignedLocation: user.assignedLocations?.[0]?.toString() ?? null,
            assignedLocations: user.assignedLocations?.map((id: any) => id.toString()) ?? [],
            assignedTenants: user.assignedTenants?.map((id: any) => id.toString()) ?? [],
          }
        }

        // Auditoría 30/10/2026 (M12): solo strings (nunca un objeto con
        // operadores de consulta) y límite también por IP, no solo por email
        // (frena probar una contraseña contra muchas cuentas).
        if (typeof credentials?.email !== 'string' || typeof credentials?.password !== 'string') return null
        if (!credentials.email || !credentials.password) return null

        const { success } = await rateLimit(`login:${credentials.email.toLowerCase().trim()}`, 5, 60_000)
        if (!success) {
          throw new Error('Demasiados intentos. Esperá 1 minuto.')
        }
        const ip = request?.headers?.get('x-forwarded-for')?.split(',')[0]?.trim() || request?.headers?.get('x-real-ip') || 'unknown'
        const byIp = await rateLimit(`login-ip:${ip}`, 20, 10 * 60_000)
        if (!byIp.success) {
          throw new Error('Demasiados intentos desde esta red. Esperá unos minutos.')
        }

        await connectDB()

        const user = await User.findOne({
          email: credentials.email,
          isActive: true,
        })

        if (!user) return null

        const passwordMatch = await bcrypt.compare(
          credentials.password as string,
          user.password
        )

        if (!passwordMatch) {
          if (user.role === 'superadmin') {
            const { logSystemAudit } = await import('@/lib/audit')
            await logSystemAudit({
              action: 'security.superadmin_login_failed', entity: 'session',
              userId: user._id.toString(), userName: user.name, userRole: 'superadmin',
              details: { reason: 'password' }, ip,
              userAgent: request?.headers?.get('user-agent') ?? '',
            })
          }
          return null
        }

        await assertTenantUsable(user)

        // Recuperación del SuperAdmin (19/11/2026): segundo factor obligatorio.
        let superAdminRole: string | null = null
        let mfaVerified = false
        if (user.role === 'superadmin') {
          mfaVerified = await verifySuperAdminMfa(user._id, credentials.otp, request)
          superAdminRole = mfaVerified ? 'superadmin' : 'superadmin_pending'
          const { requestFingerprint, sendSecurityAlert } = await import('@/lib/security-alerts')
          const fp = requestFingerprint(request?.headers)
          await sendSecurityAlert({
            accountEmail: user.email,
            subject: 'Nuevo inicio de sesión de SuperAdmin',
            summary: mfaVerified
              ? 'Se inició sesión en la cuenta SuperAdmin (contraseña + MFA).'
              : 'Se inició sesión en la cuenta SuperAdmin con contraseña. La cuenta todavía no tiene MFA: solo puede activarlo.',
            ip: fp.ip, userAgent: fp.userAgent,
          })
        }

        // Resolve tenant slug for redirect after login
        let tenantSlug: string | null = null
        if (user.tenantId) {
          const tenant = await Tenant.findById(user.tenantId).select('slug').lean<{ slug: string }>()
          tenantSlug = tenant?.slug ?? null
        }

        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: superAdminRole ?? user.role,
          mfa: mfaVerified,
          tenantId: user.tenantId?.toString() ?? null,
          tenantSlug,
          assignedLocation: user.assignedLocations?.[0]?.toString() ?? null,
          assignedLocations: user.assignedLocations?.map((id: any) => id.toString()) ?? [],
          assignedTenants: user.assignedTenants?.map((id: any) => id.toString()) ?? [],
        }
      },
    }),
  ],
})