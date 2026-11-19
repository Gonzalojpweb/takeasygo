'use client'

import { useState, useEffect } from 'react'
import { MapPin, ChevronDown } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import LocationSwitcher from './LocationSwitcher'

interface LocationInfo {
  _id: string
  name: string
  address?: string
}

interface Props {
  tenantSlug: string
  location?: LocationInfo
  locationId?: string
  variant?: 'light' | 'dark' | 'hero'
}

export default function LocationBar({
  tenantSlug,
  location: locationProp,
  locationId,
  variant = 'light',
}: Props) {
  const [locations, setLocations] = useState<any[]>([])
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [multipleLocations, setMultipleLocations] = useState(false)
  const [fetchedLocation, setFetchedLocation] = useState<LocationInfo | null>(null)

  const location = locationProp ?? fetchedLocation

  useEffect(() => {
    if (!locationProp && locationId) {
      fetch(`/api/${tenantSlug}/locations/${locationId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.location) {
            setFetchedLocation({
              _id: data.location._id,
              name: data.location.name,
              address: data.location.address,
            })
          }
        })
        .catch(() => {})
    }
  }, [tenantSlug, locationId, locationProp])

  useEffect(() => {
    fetch(`/api/${tenantSlug}/locations`)
      .then((r) => r.json())
      .then((data) => {
        const locs = data.locations || []
        setLocations(locs)
        setMultipleLocations(locs.length > 1)
      })
      .catch(() => {})
  }, [tenantSlug])

  if (!location) return null

  const isHero = variant === 'hero'
  const isDark = variant === 'dark' || isHero

  // Pill styles based on variant
  const pillBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: 99,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '-0.01em',
    userSelect: 'none',
    transition: 'all 0.18s ease',
    whiteSpace: 'nowrap',
    maxWidth: 220,
    overflow: 'hidden',
    cursor: multipleLocations ? 'pointer' : 'default',
  }

  const pillStyleInteractive: React.CSSProperties = isDark
    ? {
        background: 'rgba(0,0,0,0.35)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: 'rgba(247,244,242,0.9)',
      }
    : {
        background: 'rgba(255,255,255,0.8)',
        border: '1px solid rgba(0,0,0,0.08)',
        color: '#3a3330',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }

  const pillStyleStatic: React.CSSProperties = isDark
    ? {
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.06)',
        color: 'rgba(247,244,242,0.5)',
      }
    : {
        background: 'rgba(0,0,0,0.03)',
        border: '1px solid rgba(0,0,0,0.05)',
        color: '#8a7f7a',
      }

  // Portada de la sede: pastilla de vidrio en mayúsculas, igual con o sin
  // selector (el chevron ya avisa que se puede cambiar).
  const pillStyleHero: React.CSSProperties = {
    padding: '8px 14px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    maxWidth: 180,
    background: 'rgba(0,0,0,0.28)',
    border: '1px solid rgba(255,255,255,0.38)',
    color: '#fff',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
  }

  const pillStyle = isHero
    ? { ...pillBase, ...pillStyleHero }
    : { ...pillBase, ...(multipleLocations ? pillStyleInteractive : pillStyleStatic) }

  const iconColor = isDark ? 'rgba(247,244,242,0.45)' : '#9a8f8a'

  const pillContent = (
    <div style={pillStyle}>
      <MapPin size={isHero ? 13 : 12} style={{ color: isHero ? '#fff' : isDark ? 'rgba(247,244,242,0.5)' : '#f14722', flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {location.name}
      </span>
      {multipleLocations && (
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={showSwitcher ? 'up' : 'down'}
            initial={{ rotate: showSwitcher ? -90 : 90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}
          >
            <ChevronDown
              size={12}
              style={{
                color: isHero ? 'rgba(255,255,255,0.75)' : iconColor,
                transform: showSwitcher ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.25s ease',
              }}
            />
          </motion.span>
        </AnimatePresence>
      )}
    </div>
  )

  return (
    <>
      {multipleLocations ? (
        <motion.button
          onClick={() => setShowSwitcher(true)}
          whileHover={
            isDark
              ? { background: 'rgba(0,0,0,0.5)' }
              : { background: 'rgba(255,255,255,0.95)', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }
          }
          whileTap={{ scale: 0.97 }}
          className="focus:outline-none block"
          title="Cambiar sede"
          style={{ borderRadius: 99 }}
        >
          {pillContent}
        </motion.button>
      ) : (
        pillContent
      )}

      {showSwitcher && (
        <LocationSwitcher
          tenantSlug={tenantSlug}
          locations={locations}
          currentLocationId={location._id}
          onClose={() => setShowSwitcher(false)}
        />
      )}
    </>
  )
}
