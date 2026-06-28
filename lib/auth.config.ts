import type { NextAuthConfig } from 'next-auth'

export const authConfig = {
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 }, // 8 horas — SECURITY.md R-AUTH-05
  providers: [],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google' || account?.provider === 'nodemailer') {
        const { connectDB } = await import('@/lib/mongoose')
        const User = (await import('@/models/User')).default
        await connectDB()
        const existingUser = await User.findOne({ email: user.email })
        if (existingUser) {
          let needsSave = false
          if (account.provider === 'nodemailer' && !existingUser.emailVerified) {
            existingUser.emailVerified = new Date()
            needsSave = true
          }
          if (user.image && existingUser.image !== user.image) {
            existingUser.image = user.image
            needsSave = true
          }
          if (user.name && !existingUser.name) {
            existingUser.name = user.name
            needsSave = true
          }
          if (needsSave) await existingUser.save()
        }
      }
      return true
    },
    async jwt({ token, user, account, trigger, session }) {
      if (user && account?.provider === 'credentials') {
        token.id = user.id
        token.role = (user as any).role || 'consumer'
        token.tenantId = (user as any).tenantId
        token.tenantSlug = (user as any).tenantSlug
        token.assignedLocation = (user as any).assignedLocation
        token.assignedLocations = (user as any).assignedLocations || []
        token.assignedTenants = (user as any).assignedTenants || []
        token.image = user.image
        token.name = user.name || token.name
      }
      else {
        if (user || trigger === 'update') {
          const email = user?.email || token.email
          if (email) {
            const { connectDB } = await import('@/lib/mongoose')
            const User = (await import('@/models/User')).default
            const Tenant = (await import('@/models/Tenant')).default
            await connectDB()
            const dbUser = await User.findOne({ email })
            if (dbUser) {
              token.id = dbUser._id.toString()
              token.role = dbUser.role || 'consumer'
              token.tenantId = dbUser.tenantId?.toString() || null
              token.assignedLocation = dbUser.assignedLocations?.[0]?.toString() || null
              token.assignedLocations = dbUser.assignedLocations?.map((id: any) => id.toString()) || []
              token.assignedTenants = dbUser.assignedTenants?.map((id: any) => id.toString()) || []
              token.name = dbUser.name || token.name
              if (dbUser.tenantId) {
                const tenant = await Tenant.findById(dbUser.tenantId).select('slug').lean<{ slug: string }>()
                token.tenantSlug = tenant?.slug || null
              }
            }
          }
        }
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.tenantId = token.tenantId as string | null
        session.user.tenantSlug = token.tenantSlug as string | null
        session.user.assignedLocation = token.assignedLocation as string | null
        session.user.assignedLocations = token.assignedLocations as string[]
        session.user.assignedTenants = token.assignedTenants as string[]
        session.user.image = token.image as string | null
        session.user.name = token.name as string | null
      }
      return session
    },
  },
} satisfies NextAuthConfig
