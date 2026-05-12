'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'

export interface Address {
  label: string
  address: string
  city?: string
  coordinates: {
    lat: number
    lng: number
  }
  isDefault?: boolean
}

interface LocationContextType {
  currentAddress: Address | null
  savedAddresses: Address[]
  loading: boolean
  setAddress: (address: Address) => void
  addAddress: (address: Address) => Promise<void>
  removeAddress: (index: number) => Promise<void>
  refreshAddresses: () => Promise<void>
}

const LocationContext = createContext<LocationContextType | undefined>(undefined)

const STORAGE_KEY = 'tgo-selected-address'
const GUEST_ADDRESSES_KEY = 'tgo-guest-addresses'

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const [currentAddress, setCurrentAddress] = useState<Address | null>(null)
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([])
  const [loading, setLoading] = useState(true)

  // Cargar direcciones iniciales
  const refreshAddresses = useCallback(async () => {
    if (session?.user) {
      try {
        const res = await fetch('/api/user/addresses')
        const data = await res.json()
        if (data.addresses) {
          setSavedAddresses(data.addresses)
          
          // Si no hay dirección seleccionada, intentar usar la default
          const def = data.addresses.find((a: Address) => a.isDefault)
          if (!currentAddress && def) {
            setCurrentAddress(def)
          }
        }
      } catch (error) {
        console.error('Error fetching addresses:', error)
      }
    } else {
      // Usuario invitado - usar localStorage
      const guest = localStorage.getItem(GUEST_ADDRESSES_KEY)
      if (guest) {
        setSavedAddresses(JSON.parse(guest))
      }
    }
    setLoading(false)
  }, [session, currentAddress])

  useEffect(() => {
    refreshAddresses()
  }, [refreshAddresses])

  // Cargar última selección de persistencia local
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      setCurrentAddress(JSON.parse(stored))
    }
  }, [])

  // Guardar selección en persistencia local
  useEffect(() => {
    if (currentAddress) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentAddress))
    }
  }, [currentAddress])

  const setAddress = (address: Address) => {
    setCurrentAddress(address)
  }

  const addAddress = async (address: Address) => {
    if (session?.user) {
      const res = await fetch('/api/user/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(address)
      })
      const data = await res.json()
      if (data.addresses) {
        setSavedAddresses(data.addresses)
        if (address.isDefault || data.addresses.length === 1) {
          setCurrentAddress(address)
        }
      }
    } else {
      const next = [...savedAddresses, address]
      setSavedAddresses(next)
      localStorage.setItem(GUEST_ADDRESSES_KEY, JSON.stringify(next))
      if (address.isDefault || next.length === 1) {
        setCurrentAddress(address)
      }
    }
  }

  const removeAddress = async (index: number) => {
    if (session?.user) {
      const res = await fetch(`/api/user/addresses?index=${index}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.addresses) {
        setSavedAddresses(data.addresses)
      }
    } else {
      const next = savedAddresses.filter((_, i) => i !== index)
      setSavedAddresses(next)
      localStorage.setItem(GUEST_ADDRESSES_KEY, JSON.stringify(next))
    }
  }

  return (
    <LocationContext.Provider value={{
      currentAddress,
      savedAddresses,
      loading,
      setAddress,
      addAddress,
      removeAddress,
      refreshAddresses
    }}>
      {children}
    </LocationContext.Provider>
  )
}

export function useLocation() {
  const context = useContext(LocationContext)
  if (context === undefined) {
    throw new Error('useLocation must be used within a LocationProvider')
  }
  return context
}
