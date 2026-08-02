'use client'

// ── AdminLocationProviderWrapper ──────────────────────────────────────────────
//
// Client wrapper que envuelve el admin panel con AdminLocationContext.
// Necesario porque el layout es un Server Component pero el context es client-side.

import { AdminLocationProvider } from '@/contexts/AdminLocationContext'

interface Props {
  children: React.ReactNode
  locations: { _id: string; name: string; colorIndex: number }[]
  assignedLocations: string[]
  userRole: string
}

export default function AdminLocationProviderWrapper({
  children,
  locations,
  assignedLocations,
  userRole,
}: Props) {
  return (
    <AdminLocationProvider
      locations={locations}
      assignedLocations={assignedLocations}
      userRole={userRole}
    >
      {children}
    </AdminLocationProvider>
  )
}
