'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'

interface TenantContextType {
  tenantSlug: string | null
  setTenantSlug: (slug: string | null) => void
}

const TenantContext = createContext<TenantContextType | undefined>(undefined)

const STORAGE_KEY = 'takeasygo_current_tenant'

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenantSlug, setTenantSlugState] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  // Cargar tenant desde sessionStorage al montar
  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored) {
      setTenantSlugState(stored)
    }
    setMounted(true)
  }, [])

  const setTenantSlug = (slug: string | null) => {
    setTenantSlugState(slug)
    if (slug) {
      sessionStorage.setItem(STORAGE_KEY, slug)
    } else {
      sessionStorage.removeItem(STORAGE_KEY)
    }
  }

  return (
    <TenantContext.Provider value={{ tenantSlug, setTenantSlug }}>
      {children}
    </TenantContext.Provider>
  )
}

// Hook interno para capturar ?ref= y setear el tenant automáticamente
export function TenantRefCapture() {
  const searchParams = useSearchParams()
  const { tenantSlug, setTenantSlug } = useTenant()

  useEffect(() => {
    const ref = searchParams.get('ref')
    if (ref && ref !== tenantSlug) {
      setTenantSlug(ref)
    }
  }, [searchParams, tenantSlug, setTenantSlug])

  return null
}

export function useTenant() {
  const context = useContext(TenantContext)
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider')
  }
  return context
}
