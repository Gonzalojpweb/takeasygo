import type { NextAuthConfig } from 'next-auth'

export const authConfig = {
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 }, // 8 horas — SECURITY.md R-AUTH-05
  providers: [],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'google') {
        const { connectDB } = await import('@/lib/mongoose')
        const User = (await import('@/models/User')).default

        await connectDB()

        // Find or create user
        const existingUser = await User.findOne({ email: user.email })
        
        if (!existingUser) {
          await User.create({
            name: user.name,
            email: user.email,
            image: user.image,
            role: 'consumer',
            isActive: true,
          })
        } else {
          // Update profile picture if it changed
          if (user.image && existingUser.image !== user.image) {
            existingUser.image = user.image
            await existingUser.save()
          }
        }
      }
      return true
    },
    async jwt({ token, user, account, trigger, session }) {
      // For Credentials login, 'user' already contains our custom fields from authorize()
      if (user && account?.provider === 'credentials') {
        token.id = user.id
        token.role = (user as any).role || 'consumer'
        token.tenantId = (user as any).tenantId
        token.tenantSlug = (user as any).tenantSlug
        token.assignedLocation = (user as any).assignedLocation
        token.image = user.image
      } 
      // For Google login or session updates, we need to ensure we fetch from DB 
      // because Google's user object only gives us the google ID and email
      else if (token.email) {
        const { connectDB } = await import('@/lib/mongoose')
        const User = (await import('@/models/User')).default
        const Tenant = (await import('@/models/Tenant')).default

        await connectDB()
        const dbUser = await User.findOne({ email: token.email })
        if (dbUser) {
          token.id = dbUser._id.toString()
          token.role = dbUser.role || 'consumer'
          token.tenantId = dbUser.tenantId?.toString() || null
          token.assignedLocation = dbUser.assignedLocation?.toString() || null
          
          if (dbUser.tenantId) {
            const tenant = await Tenant.findById(dbUser.tenantId).select('slug').lean<{ slug: string }>()
            token.tenantSlug = tenant?.slug || null
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
        session.user.image = token.image as string | null
      }
      return session
    },
  },
} satisfies NextAuthConfig
