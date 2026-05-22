'use client'

import { useEffect } from 'react'
import { useFeedback } from './FeedbackContext'
import type { FeedbackVariant } from './FeedbackContext'

export default function FeedbackTrigger({ variant }: { variant: FeedbackVariant }) {
  const { show } = useFeedback()

  useEffect(() => {
    const t = setTimeout(() => show({ variant }), 500)
    return () => clearTimeout(t)
  }, [show, variant])

  return null
}
