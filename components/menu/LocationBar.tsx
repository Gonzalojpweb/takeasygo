'use client'

import { useState, useEffect } from 'react'
import { MapPin, ChevronDown } from 'lucide-react'
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
  variant?: 'light' | 'dark'
}

export default function LocationBar({ tenantSlug, location: locationProp, locationId, variant = 'light' }: Props) {
  const [locations, setLocations] = useState<any[]>([])
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [multipleLocations, setMultipleLocations] = useState(false)
  const [fetchedLocation, setFetchedLocation] = useState<LocationInfo | null>(null)

  const location = locationProp ?? fetchedLocation

  useEffect(() => {
    if (!locationProp && locationId) {
      fetch(`/api/${tenantSlug}/locations/${locationId}`)
        .then(r => r.json())
        .then(data => {
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
      .then(r => r.json())
      .then(data => {
        const locs = data.locations || []
        setLocations(locs)
        setMultipleLocations(locs.length > 1)
      })
      .catch(() => {})
  }, [tenantSlug])

  if (!location) return null

  const displayAddress = location.address ? ` \u00B7 ${location.address}` : ''

  const pillStyles = multipleLocations
    ? variant === 'dark'
      ? 'bg-black/35 hover:bg-black/45 border border-white/10 text-white active:scale-[0.98]'
      : 'bg-zinc-100/75 hover:bg-zinc-100 text-zinc-700 hover:text-zinc-900 border border-zinc-200/50 active:scale-[0.98]'
    : variant === 'dark'
      ? 'bg-white/5 border border-white/5 text-white/70'
      : 'bg-zinc-50 border border-zinc-100 text-zinc-500'

  const content = (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all select-none ${pillStyles}`}>
      <MapPin size={13} className={`shrink-0 ${variant === 'dark' ? 'text-white/60' : 'text-zinc-400'}`} />
      <span className="truncate max-w-[120px] sm:max-w-[180px]">
        {location.name}
        {displayAddress}
      </span>
      {multipleLocations && (
        <ChevronDown
          size={13}
          className={`shrink-0 transition-transform duration-300 ${showSwitcher ? 'rotate-180' : ''} ${
            variant === 'dark' ? 'text-white/60' : 'text-zinc-400'
          }`}
        />
      )}
    </div>
  )

  return (
    <>
      {multipleLocations ? (
        <button
          onClick={() => setShowSwitcher(true)}
          className="focus:outline-none block cursor-pointer"
          title="Cambiar sede"
        >
          {content}
        </button>
      ) : (
        content
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

