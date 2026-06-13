'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X, MapPin, ShoppingBag, Truck, Utensils, Briefcase } from 'lucide-react'
import { isServiceOpen } from '@/lib/availability'
import { motion, AnimatePresence } from 'framer-motion'
import LocationConfirmDialog from './LocationConfirmDialog'

interface LocationInfo {
  _id: string
  name: string
  address?: string
  settings?: {
    acceptsOrders?: boolean
    orderModes?: string[]
    estimatedPickupTime?: number
    delayAnnouncement?: any
  }
  serviceHours?: {
    takeaway?: Array<{ days: number[]; open: string; close: string }>
    delivery?: Array<{ days: number[]; open: string; close: string }>
    dineIn?: Array<{ days: number[]; open: string; close: string }>
  }
  deliveryConfig?: { enabled?: boolean }
  geo?: { type: string; coordinates: [number, number] }
}

interface Props {
  tenantSlug: string
  locations: LocationInfo[]
  currentLocationId: string
  onClose: () => void
}

const MODE_ICONS: Record<string, React.ReactNode> = {
  takeaway: <ShoppingBag size={16} className="text-zinc-500" />,
  delivery: <Truck size={16} className="text-zinc-500" />,
  'dine-in': <Utensils size={16} className="text-zinc-500" />,
  business: <Briefcase size={16} className="text-zinc-500" />,
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function LocationSwitcher({
  tenantSlug,
  locations,
  currentLocationId,
  onClose,
}: Props) {
  const router = useRouter()

  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null)
  const [geoError, setGeoError] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const sorted = [...locations].sort((a, b) => {
    const aIsCurrent = a._id === currentLocationId
    const bIsCurrent = b._id === currentLocationId
    if (aIsCurrent && !bIsCurrent) return -1
    if (!aIsCurrent && bIsCurrent) return 1

    if (userCoords && a.geo?.coordinates && b.geo?.coordinates) {
      const dA = haversineKm(userCoords.lat, userCoords.lng, a.geo.coordinates[1], a.geo.coordinates[0])
      const dB = haversineKm(userCoords.lat, userCoords.lng, b.geo.coordinates[1], b.geo.coordinates[0])
      return dA - dB
    }
    return a.name.localeCompare(b.name)
  })

  const distanceTo = (loc: LocationInfo): string | null => {
    if (!userCoords || !loc.geo?.coordinates) return null
    const km = haversineKm(userCoords.lat, userCoords.lng, loc.geo.coordinates[1], loc.geo.coordinates[0])
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
  }

  const getModes = (loc: LocationInfo): string[] => {
    const modes = loc.settings?.orderModes ? [...loc.settings.orderModes] : ['takeaway']
    if (loc.deliveryConfig?.enabled && !modes.includes('delivery')) modes.push('delivery')
    return modes
  }

  const isOpen = (loc: LocationInfo): boolean => {
    if (loc.settings?.acceptsOrders === false) return false
    const modes = getModes(loc)
    const hasHoursConfigured = loc.serviceHours && (
      (modes.includes('takeaway') && loc.serviceHours.takeaway?.length) ||
      (modes.includes('delivery') && loc.serviceHours.delivery?.length) ||
      (modes.includes('dine-in') && loc.serviceHours.dineIn?.length)
    )

    if (hasHoursConfigured) {
      const takeawayOpen = modes.includes('takeaway') && isServiceOpen(loc.serviceHours?.takeaway)
      const deliveryOpen = modes.includes('delivery') && isServiceOpen(loc.serviceHours?.delivery)
      const dineInOpen = modes.includes('dine-in') && isServiceOpen(loc.serviceHours?.dineIn)
      return takeawayOpen || deliveryOpen || dineInOpen
    }
    return true
  }

  const handleSelectLocation = (locId: string) => {
    if (locId === currentLocationId) {
      onClose()
      return
    }
    const cart = typeof window !== 'undefined' ? sessionStorage.getItem('cart') : null
    if (cart) {
      setConfirmTarget(locId)
    } else {
      doSwitch(locId)
    }
  }

  const doSwitch = (locId: string) => {
    sessionStorage.removeItem('cart')
    sessionStorage.removeItem('mode')
    onClose()
    router.push(`/${tenantSlug}/menu/${locId}`)
  }

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError(true)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeoError(true),
      { timeout: 5000, enableHighAccuracy: false }
    )
  }, [])

  const spring = { type: 'spring' as const, damping: 28, stiffness: 380 }

  return (
    <>
      <AnimatePresence>
        {mounted && (
          <motion.div
            key="location-switcher"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center"
            onClick={onClose}
          >
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={spring}
              className="bg-white shadow-2xl w-full sm:max-w-md max-h-[85dvh] sm:max-h-[90vh] overflow-hidden rounded-t-2xl sm:rounded-2xl flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              {/* Sticky Header */}
              <div className="sticky top-0 bg-white border-b border-zinc-100 rounded-t-2xl z-10 shrink-0">
                <div className="flex items-center justify-between px-6 pt-5 pb-4">
                  <div>
                    <h2 className="text-xl font-bold text-zinc-900 tracking-tight">Elegí una sede</h2>
                    <p className="text-sm text-zinc-500 mt-0.5">Seleccioná donde querés hacer tu pedido</p>
                  </div>
                  <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-xl bg-zinc-100 hover:bg-zinc-200 active:scale-90 flex items-center justify-center transition-all shrink-0"
                  >
                    <X size={16} className="text-zinc-500" />
                  </button>
                </div>
              </div>

              {/* Lista */}
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {sorted.map((loc) => {
                    const isCurrent = loc._id === currentLocationId
                    const open = isOpen(loc)
                    const modes = getModes(loc)
                    const dist = distanceTo(loc)

                    return (
                      <button
                        key={loc._id}
                        onClick={() => handleSelectLocation(loc._id)}
                        className={`w-full text-left rounded-2xl border p-5 transition-all active:scale-[0.985] cursor-pointer ${
                          isCurrent
                            ? 'border-zinc-900 bg-zinc-50 shadow-sm'
                            : 'border-zinc-200 hover:border-zinc-300 hover:shadow-sm hover:bg-zinc-50/60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            {/* Nombre */}
                            <div className="flex items-center gap-2.5">
                              <h3 className="font-semibold text-[15px] text-zinc-900">{loc.name}</h3>
                              {isCurrent && (
                                <span className="text-[10px] font-bold bg-zinc-900 text-white px-2.5 py-0.5 rounded-full tracking-wider">
                                  ACTUAL
                                </span>
                              )}
                            </div>

                            {/* Dirección */}
                            {loc.address && (
                              <p className="text-sm text-zinc-500 mt-1.5 flex items-start gap-1.5">
                                <MapPin size={14} className="mt-0.5 text-zinc-400 shrink-0" />
                                {loc.address}
                              </p>
                            )}

                            {/* Distancia */}
                            {dist && (
                              <p className="text-xs text-zinc-400 mt-1.5 flex items-center gap-1">
                                <MapPin size={12} />
                                {dist}
                              </p>
                            )}
                          </div>

                          {/* Columna derecha */}
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            {/* Estado */}
                            <div className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                              open
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-red-50 text-red-600 border-red-200'
                            }`}>
                              <div className={`w-1.5 h-1.5 rounded-full ${open ? 'bg-emerald-500' : 'bg-red-500'}`} />
                              {open ? 'Abierto' : 'Cerrado'}
                            </div>

                            {!isCurrent && (
                              <span className="text-[11px] font-semibold text-blue-600">
                                Seleccionar →
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Modos */}
                        <div className="mt-3 flex items-center gap-3 text-xs text-zinc-500">
                          {modes.map((mode) => (
                            <div key={mode} className="flex items-center gap-1">
                              {MODE_ICONS[mode]}
                              <span className="capitalize font-medium">
                                {mode === 'dine-in' ? 'Dine-In' : mode}
                              </span>
                            </div>
                          ))}
                        </div>
                      </button>
                    )
                  })}

                  {geoError && !userCoords && (
                    <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700 text-center">
                      Activá la ubicación para ver la sede más cercana
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
      </AnimatePresence>

      {confirmTarget && (
        <LocationConfirmDialog
          onConfirm={() => {
            const target = confirmTarget
            setConfirmTarget(null)
            doSwitch(target)
          }}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
    </>
  )
}