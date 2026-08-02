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

  // Cargar de sessionStorage al montar
  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored && locations.some(l => l._id === stored)) {
      setActiveLocationIdState(stored)
    } else if (stored === 'all') {
      setActiveLocationIdState(null)
    }
    setMounted(true)
  }, [locations])

  // Si el usuario solo tiene 1 sede asignada, seleccionarla automáticamente
  useEffect(() => {
    if (!mounted) return
    if (locations.length === 1 && activeLocationId === null) {
      setActiveLocationIdState(locations[0]._id)
      sessionStorage.setItem(STORAGE_KEY, locations[0]._id)
    }
  }, [locations, mounted, activeLocationId])

  const setActiveLocation = useCallback((id: string | null) => {
    setActiveLocationIdState(id)
    if (id) {
      sessionStorage.setItem(STORAGE_KEY, id)
    } else {
      sessionStorage.setItem(STORAGE_KEY, 'all')
    }
  }, [])

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
