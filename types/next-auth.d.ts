import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: string
      tenantId: string | null
      tenantSlug: string | null
      assignedLocation: string | null
    } & DefaultSession['user']
  }

  interface User {
    id: string
    role: string
    tenantId: string | null
    tenantSlug: string | null
    assignedLocation: string | null
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: string
    tenantId: string | null
    tenantSlug: string | null
    assignedLocation: string | null
  }
}
