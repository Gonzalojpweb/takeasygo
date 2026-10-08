'use client'

import { useEffect } from 'react'
import { trackMenuOpened } from '@/lib/track'

export default function MenuOpenTracker({ locationId }: { locationId: string }) {
  useEffect(() => {
    trackMenuOpened(locationId)
  }, [locationId])
  return null
}
