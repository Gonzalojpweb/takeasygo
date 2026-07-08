import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import Email from 'next-auth/providers/email'
import bcrypt from 'bcryptjs'
import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import Tenant from '@/models/Tenant'
import { authConfig } from '@/lib/auth.config'
import { Redis } from '@upstash/redis'
import { rateLimit } from '@/lib/rateLimit'
import { logAudit } from '@/lib/audit'
import { adapter } from '@/lib/auth-adapter'

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter,
  ...authConfig,
  events: {
    async signIn({ user }) {
      const u = user as any
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
    },
    async signOut(message) {
      const token = 'token' in message ? message.token : null
      if (!token) return
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
      },
      async authorize(credentials) {
        // SSO via one-time auth code (from sso-callback page)
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

        if (!credentials?.email || !credentials?.password) return null

        const { success } = await rateLimit(`login:${credentials.email}`, 5, 60_000)
        if (!success) {
          throw new Error('Demasiados intentos. Esperá 1 minuto.')
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

        if (!passwordMatch) return null

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
          role: user.role,
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