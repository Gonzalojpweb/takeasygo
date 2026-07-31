'use client'

import { useSidebarState } from './SidebarWrapper'
import AdminSidebar from './AdminSidebar'
import { cn } from '@/lib/utils'

interface DesktopSidebarProps {
  tenantSlug: string
  userRole: string
  userName: string
  plan: any
  dineInOnly?: boolean
  unreadAnnouncements?: number
  businessEnabled?: boolean
  crmEnabled?: boolean
  assignedLocations?: string[]
  locations?: { _id: string; name: string }[]
}

export default function DesktopSidebar(props: DesktopSidebarProps) {
  const { isExpanded, handleMouseEnter, handleMouseLeave, collapse } = useSidebarState()

  return (
    <>
      {/* Spacer — stays in flex flow, always 68px */}
      <div className="w-[68px] h-full shrink-0 hidden lg:block" />

      {/* Sidebar — fixed, overlays content, handles its own hover */}
      <aside
        className={cn(
          'fixed left-0 top-0 h-full flex flex-col border-r border-border overflow-x-hidden z-50 transition-all duration-200 hidden lg:block no-scrollbar',
          isExpanded ? 'w-[288px] overflow-y-auto' : 'w-[68px] overflow-y-auto'
        )}
        data-lenis-prevent
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <AdminSidebar {...props} isExpanded={isExpanded} />
      </aside>

      {/* Overlay — covers workspace when sidebar is expanded */}
      {isExpanded && (
        <div
          className="fixed inset-0 bg-black/20 z-30 transition-opacity duration-200 hidden lg:block"
          onClick={collapse}
        />
      )}
    </>
  )
}
