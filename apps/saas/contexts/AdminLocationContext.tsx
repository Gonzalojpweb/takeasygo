'use client'

// ── AdminLocationContext ──────────────────────────────────────────────────────
//
// Context global de sede activa para el admin panel.
// Persiste en sessionStorage para sobrevive refreshes.
// Todas las secciones admin usan este contexto en vez de estado local.

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { getLocationColor, type LocationColor } from '@/lib/location-colors'

const STORAGE_KEY = 'tgo_admin_active_location'

interface LocationItem {
  _id: string
  name: string
  colorIndex: number
}

interface AdminLocationContextType {
  locations: LocationItem[]
  activeLocationId: string | null  // null = "Todas las sedes"
  activeLocation: LocationItem | null
  activeColor: LocationColor | null
  setActiveLocation: (id: string | null) => void
  isAllLocations: boolean
  assignedLocations: string[]
  userRole: string
}

const AdminLocationContext = createContext<AdminLocationContextType | undefined>(undefined)

interface AdminLocationProviderProps {
  children: ReactNode
  locations: LocationItem[]
  assignedLocations: string[]
  userRole: string
}

export function AdminLocationProvider({
  children,
  locations,
  assignedLocations,
  userRole,
}: AdminLocationProviderProps) {
  const [activeLocationId, setActiveLocationIdState] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  const isFullScopeUser = userRole === 'admin' || userRole === 'superadmin'
  // Sedes del tenant que este usuario puede ver: admins ve todas; usuarios
  // scoped solo las asignadas. sessionStorage es compartido entre usuarios
  // del mismo navegador, así que la sede stored se valida contra ESTE
  // alcance (no contra todas las sedes del tenant).
  const allowedLocations = isFullScopeUser
    ? locations
    : locations.filter(l => assignedLocations.includes(l._id))

  // Cargar de sessionStorage al montar
  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored && allowedLocations.some(l => l._id === stored)) {
      setActiveLocationIdState(stored)
    } else if (stored === 'all' && isFullScopeUser) {
      setActiveLocationIdState(null)
    } else if (allowedLocations.length === 1) {
      // Sede única del alcance del usuario: seleccionarla aunque el stored
      // apunte a una sede ajena (panel abierto antes por otro usuario).
      setActiveLocationIdState(allowedLocations[0]._id)
      sessionStorage.setItem(STORAGE_KEY, allowedLocations[0]._id)
    }
    setMounted(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations, assignedLocations, userRole])

  // Si el usuario solo tiene 1 sede en su alcance, seleccionarla automáticamente
  useEffect(() => {
    if (!mounted) return
    if (allowedLocations.length === 1 && activeLocationId === null) {
      setActiveLocationIdState(allowedLocations[0]._id)
      sessionStorage.setItem(STORAGE_KEY, allowedLocations[0]._id)
    }
  }, [allowedLocations, mounted, activeLocationId])

  const setActiveLocation = useCallback((id: string | null) => {
    // Defensa en profundidad: un usuario scoped no puede activar una sede
    // fuera de su alcance (p. ej. llamada programática o link manipulado).
    if (id && !isFullScopeUser && !allowedLocations.some(l => l._id === id)) {
      return
    }
    setActiveLocationIdState(id)
    if (id) {
      sessionStorage.setItem(STORAGE_KEY, id)
    } else {
      sessionStorage.setItem(STORAGE_KEY, 'all')
    }
  }, [isFullScopeUser, allowedLocations])

  const activeLocation = locations.find(l => l._id === activeLocationId) ?? null
  const activeColor = activeLocation ? getLocationColor(activeLocation.colorIndex) : null
  const isAllLocations = activeLocationId === null

  const value: AdminLocationContextType = {
    locations,
    activeLocationId,
    activeLocation,
    activeColor,
    setActiveLocation,
    isAllLocations,
    assignedLocations,
    userRole,
  }

  return (
    <AdminLocationContext.Provider value={value}>
      {children}
    </AdminLocationContext.Provider>
  )
}

export function useAdminLocation() {
  const context = useContext(AdminLocationContext)
  if (context === undefined) {
    throw new Error('useAdminLocation must be used within an AdminLocationProvider')
  }
  return context
}
