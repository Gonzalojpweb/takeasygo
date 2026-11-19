import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: string
      tenantId: string | null
      tenantSlug: string | null
      assignedLocation: string | null
      assignedLocations: string[]
      assignedTenants: string[]
      /** Proveedor con el que se emitió la sesión (credentials, google, email…). */
      authProvider?: string | null
      /** true si el login verificó el segundo factor (SuperAdmin). */
      mfa?: boolean
    } & DefaultSession['user']
  }

  interface User {
    id: string
    role: string
    email?: string | null
    tenantId: string | null
    tenantSlug: string | null
    assignedLocation: string | null
    assignedLocations: string[]
    assignedTenants: string[]
    mfa?: boolean
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: string
    email?: string | null
    tenantId: string | null
    tenantSlug: string | null
    assignedLocation: string | null
    assignedLocations: string[]
    assignedTenants: string[]
    authProvider?: string | null
    mfa?: boolean
  }
}
