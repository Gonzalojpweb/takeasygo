import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import Tenant from '@/models/Tenant'
import { authConfig } from '@/lib/auth.config'
import { rateLimit } from '@/lib/rateLimit'

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        
        const { success } = rateLimit(`login:${credentials.email}`, 5, 60_000)
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
          assignedLocation: user.assignedLocation?.toString() ?? null,
        }
      },
    }),
  ],
})