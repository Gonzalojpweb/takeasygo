'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X, MapPin, ShoppingBag, Truck, Utensils, Briefcase, Navigation, CheckCircle2, Clock } from 'lucide-react'
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

const MODE_LABELS: Record<string, string> = {
  takeaway: 'Takeaway',
  delivery: 'Delivery',
  'dine-in': 'Dine-in',
  business: 'Empresarial',
}

const MODE_ICONS: Record<string, React.ElementType> = {
  takeaway: ShoppingBag,
  delivery: Truck,
  'dine-in': Utensils,
  business: Briefcase,
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function LocationSwitcher({ tenantSlug, locations, currentLocationId, onClose }: Props) {
  const router = useRouter()
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null)
  const [geoError, setGeoError] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [requestingGeo, setRequestingGeo] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const sorted = [...locations].sort((a, b) => {
    if (a._id === currentLocationId) return -1
    if (b._id === currentLocationId) return 1
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
    const hasHours =
      loc.serviceHours &&
      ((modes.includes('takeaway') && loc.serviceHours.takeaway?.length) ||
        (modes.includes('delivery') && loc.serviceHours.delivery?.length) ||
        (modes.includes('dine-in') && loc.serviceHours.dineIn?.length))
    if (hasHours) {
      return (
        (modes.includes('takeaway') && isServiceOpen(loc.serviceHours?.takeaway)) ||
        (modes.includes('delivery') && isServiceOpen(loc.serviceHours?.delivery)) ||
        (modes.includes('dine-in') && isServiceOpen(loc.serviceHours?.dineIn))
      )
    }
    return true
  }

  const handleSelectLocation = (locId: string) => {
    if (locId === currentLocationId) { onClose(); return }
    const cart = typeof window !== 'undefined' ? sessionStorage.getItem('cart') : null
    if (cart) { setConfirmTarget(locId) } else { doSwitch(locId) }
  }

  const doSwitch = (locId: string) => {
    sessionStorage.removeItem('cart')
    sessionStorage.removeItem('mode')
    onClose()
    router.push(`/${tenantSlug}/menu/${locId}`)
  }

  const requestGeo = () => {
    if (!navigator.geolocation) { setGeoError(true); return }
    setRequestingGeo(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => { setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setRequestingGeo(false) },
      () => { setGeoError(true); setRequestingGeo(false) },
      { timeout: 6000, enableHighAccuracy: false }
    )
  }

  useEffect(() => { requestGeo() }, [])

  const spring = { type: 'spring' as const, damping: 30, stiffness: 340 }

  return (
    <>
      <AnimatePresence>
        {mounted && (
          <motion.div
            key="ls-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
            onClick={onClose}
          >
            {/* Sheet / Modal */}
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={spring}
              className="w-full sm:max-w-md max-h-[88dvh] sm:max-h-[82vh] flex flex-col overflow-hidden"
              style={{
                borderRadius: '24px 24px 0 0',
                background: 'linear-gradient(180deg, #1e1b19 0%, #181513 100%)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderBottom: 'none',
                boxShadow: '0 -8px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drag indicator */}
              <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
                <div style={{ width: 36, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.12)' }} />
              </div>

              {/* Header */}
              <div
                className="shrink-0 px-6 pt-4 pb-4"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2
                      className="font-bold tracking-tight"
                      style={{ fontSize: 20, color: '#f7f4f2', lineHeight: 2, marginLeft: 8 }}
                    >
                      Elegí tu sede
                    </h2>
                    <p style={{ fontSize: 13, color: '#6e6560', marginTop: 4, marginLeft: 8 }}>
                      Seleccioná dónde querés hacer tu pedido
                    </p>
                  </div>

                  <button
                    onClick={onClose}
                    className="shrink-0 flex items-center justify-center transition-all active:scale-90"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      cursor: 'pointer',
                    }}
                  >
                    <X size={16} style={{ color: '#8a7f7a' }} />
                  </button>
                </div>

                {/* Geo banner */}
                {!userCoords && !geoError && (
                  <div
                    className="flex items-center gap-2 mt-3"
                    style={{
                      background: 'rgba(16, 185, 129, 0.07)',
                      border: '1px solid rgba(16, 185, 129, 0.15)',
                      borderRadius: 10,
                      padding: '8px 12px',
                    }}
                  >
                    <Navigation size={13} style={{ color: '#10b981', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: '#10b981', fontWeight: 500 }}>
                      {requestingGeo ? 'Buscando ubicación...' : 'Activá tu ubicación para ver la sede más cercana'}
                    </span>
                  </div>
                )}
              </div>

              {/* Location list */}
              <div className="flex-1 overflow-y-auto" style={{ padding: '12px 16px 24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {sorted.map((loc, idx) => {
                    const isCurrent = loc._id === currentLocationId
                    const open = isOpen(loc)
                    const modes = getModes(loc)
                    const dist = distanceTo(loc)

                    return (
                      <motion.button
                        key={loc._id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.04 + 0.05, duration: 0.22 }}
                        onClick={() => handleSelectLocation(loc._id)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          borderRadius: 18,
                          padding: '16px 18px',
                          cursor: 'pointer',
                          border: isCurrent
                            ? '1.5px solid rgba(241,71,34,0.45)'
                            : '1px solid rgba(255,255,255,0.06)',
                          background: isCurrent
                            ? 'linear-gradient(135deg, rgba(241,71,34,0.1) 0%, rgba(241,71,34,0.04) 100%)'
                            : 'rgba(255,255,255,0.03)',
                          boxShadow: isCurrent ? '0 0 24px rgba(241,71,34,0.12)' : 'none',
                          transition: 'all 0.18s ease',
                          display: 'block',
                        }}
                        whileHover={{
                          background: isCurrent
                            ? 'linear-gradient(135deg, rgba(241,71,34,0.14) 0%, rgba(241,71,34,0.06) 100%)'
                            : 'rgba(255,255,255,0.055)',
                          borderColor: isCurrent ? 'rgba(241,71,34,0.6)' : 'rgba(255,255,255,0.1)',
                        }}
                        whileTap={{ scale: 0.985 }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                          {/* Left info */}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            {/* Name row */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <h3
                                style={{
                                  fontWeight: 700,
                                  fontSize: 15,
                                  color: isCurrent ? '#f14722' : '#f7f4f2',
                                  letterSpacing: '-0.01em',
                                  lineHeight: 1.3,
                                }}
                              >
                                {loc.name}
                              </h3>
                              {isCurrent && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    letterSpacing: '0.06em',
                                    color: '#f14722',
                                    background: 'rgba(241,71,34,0.12)',
                                    border: '1px solid rgba(241,71,34,0.25)',
                                    borderRadius: 99,
                                    padding: '2px 8px',
                                    textTransform: 'uppercase',
                                  }}
                                >
                                  Actual
                                </span>
                              )}
                            </div>

                            {/* Address */}
                            {loc.address && (
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginTop: 6 }}>
                                <MapPin size={12} style={{ color: '#5a524d', marginTop: 1, flexShrink: 0 }} />
                                <span style={{ fontSize: 12, color: '#8a7f7a', lineHeight: 1.4 }}>
                                  {loc.address}
                                </span>
                              </div>
                            )}

                            {/* Distance */}
                            {dist && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
                                <Navigation size={11} style={{ color: '#10b981' }} />
                                <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>{dist}</span>
                              </div>
                            )}

                            {/* Modes */}
                            {modes.length > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                                {modes.map((mode) => {
                                  const Icon = MODE_ICONS[mode] || ShoppingBag
                                  return (
                                    <div
                                      key={mode}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        background: 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(255,255,255,0.07)',
                                        borderRadius: 8,
                                        padding: '3px 8px',
                                      }}
                                    >
                                      <Icon size={11} style={{ color: '#5a524d' }} />
                                      <span style={{ fontSize: 11, color: '#8a7f7a', fontWeight: 500 }}>
                                        {MODE_LABELS[mode] ?? mode}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>

                          {/* Right badges */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                            {/* Open/Closed badge */}
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 5,
                                borderRadius: 99,
                                padding: '4px 10px',
                                background: open
                                  ? 'rgba(16, 185, 129, 0.1)'
                                  : 'rgba(239, 68, 68, 0.1)',
                                border: `1px solid ${open ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                              }}
                            >
                              <div
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: '50%',
                                  background: open ? '#10b981' : '#ef4444',
                                  boxShadow: open ? '0 0 6px #10b981' : 'none',
                                }}
                              />
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  color: open ? '#10b981' : '#ef4444',
                                  letterSpacing: '0.02em',
                                }}
                              >
                                {open ? 'Abierto' : 'Cerrado'}
                              </span>
                            </div>

                            {/* Selected checkmark */}
                            {isCurrent && (
                              <CheckCircle2 size={18} style={{ color: '#f14722' }} />
                            )}
                          </div>
                        </div>
                      </motion.button>
                    )
                  })}
                </div>

                {/* Geo error notice */}
                {geoError && !userCoords && (
                  <div
                    style={{
                      marginTop: 14,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 12,
                      padding: '10px 14px',
                    }}
                  >
                    <Navigation size={13} style={{ color: '#5a524d', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: '#5a524d' }}>
                      Activá la ubicación para ver la sede más cercana
                    </span>
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