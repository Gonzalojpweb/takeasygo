'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { usePathname } from 'next/navigation'

interface SidebarWrapperProps {
  children: React.ReactNode
}

export function useSidebarState() {
  const [isExpanded, setIsExpanded] = useState(false)
  const collapseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pathname = usePathname()

  const clearCollapseTimeout = useCallback(() => {
    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current)
      collapseTimeoutRef.current = null
    }
  }, [])

  const handleMouseEnter = useCallback(() => {
    clearCollapseTimeout()
    setIsExpanded(true)
  }, [clearCollapseTimeout])

  const handleMouseLeave = useCallback(() => {
    collapseTimeoutRef.current = setTimeout(() => {
      setIsExpanded(false)
    }, 250)
  }, [])

  const collapse = useCallback(() => {
    clearCollapseTimeout()
    setIsExpanded(false)
  }, [clearCollapseTimeout])

  // Collapse on route change
  useEffect(() => {
    clearCollapseTimeout()
    setIsExpanded(false)
  }, [pathname, clearCollapseTimeout])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => clearCollapseTimeout()
  }, [clearCollapseTimeout])

  return {
    isExpanded,
    handleMouseEnter,
    handleMouseLeave,
    collapse,
  }
}
