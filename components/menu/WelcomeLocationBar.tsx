'use client'

import LocationBar from '@/components/menu/LocationBar'

interface Props {
  tenantSlug: string
  location: { _id: string; name: string; address?: string }
}

export default function WelcomeLocationBar({ tenantSlug, location }: Props) {
  return (
    <div className="absolute top-4 left-0 right-0 z-20 flex justify-center px-4">
      <LocationBar tenantSlug={tenantSlug} location={location} variant="dark" />
    </div>
  )
}

