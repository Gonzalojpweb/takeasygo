'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import BoardColumn from './BoardColumn'
import BoardToolbar from './BoardToolbar'
import { useBoardAutoRefresh } from './useBoardAutoRefresh'
import { useBoardNewItemDetector } from './useBoardNewItemDetector'
import { useWorkspaceZoom } from './useWorkspaceZoom'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { BoardItem, OperationsBoardProps } from './types'

export default function OperationsBoard<T extends BoardItem>({
  items,
  columns,
  tenantSlug,
  activeStatuses,
  alertStatuses,
  searchConfig,
  locationConfig,
  controlledActiveLocation,
  renderCard,
  renderContextPanel,
  renderInsights,
  toolbarActions,
  onCleanup,
  getNewItemToast,
  soundSrc,
  onLocationChange,
  autoSelectId,
}: OperationsBoardProps<T>) {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [internalActiveLocation, setInternalActiveLocation] = useState('all')
  const [selectedItem, setSelectedItem] = useState<T | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(true)

  // ── Horizontal scroll management ────────────────────────────────────────
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  // Translate vertical wheel to horizontal scroll on the board
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return
      if (e.shiftKey) return
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault()
        el.scrollLeft += e.deltaY
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Track scroll position to show/hide arrows
  const updateScrollArrows = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    updateScrollArrows()
    el.addEventListener('scroll', updateScrollArrows, { passive: true })
    window.addEventListener('resize', updateScrollArrows)
    return () => {
      el.removeEventListener('scroll', updateScrollArrows)
      window.removeEventListener('resize', updateScrollArrows)
    }
  }, [updateScrollArrows, items])

  function scrollBoard(dir: 'left' | 'right') {
    const el = scrollContainerRef.current
    if (!el) return
    const step = el.clientWidth * 0.6
    el.scrollBy({ left: dir === 'left' ? -step : step, behavior: 'smooth' })
  }

  // Use controlled location if provided, otherwise use internal state
  const activeLocation = controlledActiveLocation ?? internalActiveLocation

  const handleLocationChange = useCallback((loc: string) => {
    setInternalActiveLocation(loc)
    onLocationChange?.(loc)
  }, [onLocationChange])

  // Keep selectedItem in sync when items refresh (e.g. after router.refresh())
  useEffect(() => {
    if (selectedItem) {
      const fresh = items.find(i => i._id === selectedItem._id)
      if (fresh) setSelectedItem(fresh)
    }
  }, [items])

  // Auto-select from notification action (e.g. ?attend=orderId from SW click)
  useEffect(() => {
    if (autoSelectId) {
      const target = items.find(i => i._id === autoSelectId)
      if (target) setSelectedItem(target)
    }
  }, [autoSelectId, items])
  const [cleanupLoading, setCleanupLoading] = useState(false)

  // Zoom
  const { zoom, zoomPercent, zoomIn, zoomOut, resetZoom, mounted } = useWorkspaceZoom()

  // Hooks
  const doRefresh = useCallback(() => { router.refresh() }, [router])
  const { lastUpdated, doRefresh: doRefreshWithTimestamp } = useBoardAutoRefresh({
    items,
    activeStatuses,
    onRefresh: doRefresh,
  })

  const effectiveAlertStatuses = alertStatuses || activeStatuses

  const handleAttend = useCallback(() => {
    const first = items.find(i => effectiveAlertStatuses.includes(i.status))
    if (first) setSelectedItem(first)
  }, [items, effectiveAlertStatuses])

  const { newItemIds, escalatedIds, markAttended } = useBoardNewItemDetector({
    items,
    alertStatuses: effectiveAlertStatuses,
    soundEnabled,
    soundSrc,
    getNewItemToast,
    onAttend: handleAttend,
  })

  // Cleanup
  const handleCleanup = useCallback(async () => {
    if (!onCleanup) return
    if (!confirm('¿Eliminar items antiguos? Esta acción no se puede deshacer.')) return
    setCleanupLoading(true)
    try {
      await onCleanup()
      doRefreshWithTimestamp()
    } catch {
      toast.error('Error al limpiar')
    } finally {
      setCleanupLoading(false)
    }
  }, [onCleanup, doRefreshWithTimestamp])

  // Filter items
  const locationIdField = locationConfig?.locationIdField || 'locationId'
  const filteredItems = items.filter(item => {
    const matchSearch = !searchTerm || searchConfig
      ? (searchConfig?.getSearchFields(item) || []).some(field =>
          field.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : true

    const matchLocation = !locationConfig || activeLocation === 'all'
      ? true
      : String((item as any)[locationIdField]) === activeLocation

    return matchSearch && matchLocation
  })

  // Group by status
  const itemsByStatus = columns.reduce((acc, col) => {
    const matchStatuses = col.statuses ?? [col.status]
    acc[col.status] = filteredItems.filter(o => matchStatuses.includes(o.status))
    return acc
  }, {} as Record<string, T[]>)

  // Count active items — use column key to avoid double-counting multi-status columns
  const countedColumnKeys = new Set<string>()
  const activeCount = activeStatuses.reduce((sum, s) => {
    const matchingCol = columns.find(col => col.statuses?.includes(s) || col.status === s)
    if (!matchingCol) return sum
    if (countedColumnKeys.has(matchingCol.status)) return sum // already counted this column
    countedColumnKeys.add(matchingCol.status)
    return sum + (itemsByStatus[matchingCol.status]?.length || 0)
  }, 0)

  return (
    <div className="flex h-full min-h-0 gap-0 relative">
      {/* Main board area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Toolbar */}
        <BoardToolbar
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          locations={locationConfig?.locations}
          activeLocation={activeLocation}
          onLocationChange={locationConfig ? handleLocationChange : undefined}
          soundEnabled={soundEnabled}
          onSoundToggle={() => setSoundEnabled(v => !v)}
          onRefresh={doRefreshWithTimestamp}
          lastUpdated={lastUpdated}
          totalItems={filteredItems.length}
          activeCount={activeCount}
          onCleanup={onCleanup ? handleCleanup : undefined}
          cleanupLoading={cleanupLoading}
          extraActions={toolbarActions}
          zoomPercent={mounted ? zoomPercent : undefined}
          onZoomIn={mounted ? zoomIn : undefined}
          onZoomOut={mounted ? zoomOut : undefined}
          onZoomReset={mounted ? resetZoom : undefined}
        />

        {/* Board columns — zoom affects column sizing only */}
        <div className="flex-1 min-h-0 p-3 md:p-4 relative group/scroll">
          {/* Left fade + arrow */}
          {canScrollLeft && (
            <>
              <div className="absolute left-0 top-0 bottom-0 w-10 z-20 pointer-events-none bg-gradient-to-r from-background to-transparent" />
              <button
                onClick={() => scrollBoard('left')}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-30 w-7 h-7 rounded-full bg-background/90 border border-border shadow-md flex items-center justify-center opacity-0 group-hover/scroll:opacity-100 transition-opacity hover:bg-accent"
                aria-label="Scroll left"
              >
                <ChevronLeft size={14} />
              </button>
            </>
          )}

          {/* Right fade + arrow */}
          {canScrollRight && (
            <>
              <div className="absolute right-0 top-0 bottom-0 w-10 z-20 pointer-events-none bg-gradient-to-l from-background to-transparent" />
              <button
                onClick={() => scrollBoard('right')}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-30 w-7 h-7 rounded-full bg-background/90 border border-border shadow-md flex items-center justify-center opacity-0 group-hover/scroll:opacity-100 transition-opacity hover:bg-accent"
                aria-label="Scroll right"
              >
                <ChevronRight size={14} />
              </button>
            </>
          )}

          <div
            ref={scrollContainerRef}
            className="flex gap-3 h-full md:gap-4 overflow-x-auto overflow-y-hidden scrollbar-none"
            style={{ zoom: mounted ? zoom : 1 }}
          >
            {columns.map(col => (
              <BoardColumn
                key={col.status}
                column={col}
                items={itemsByStatus[col.status] || []}
                selectedItemId={selectedItem?._id || null}
                newItemIds={newItemIds}
                escalatedIds={escalatedIds}
                onSelectItem={(item) => {
                  setSelectedItem(item)
                  markAttended(item._id)
                }}
                renderCard={renderCard}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Context Panel — Always visible on desktop, dynamic width */}
      <div className={cn(
        'hidden lg:flex lg:flex-col shrink-0 min-h-0 border-l border-border/50 transition-all duration-200 overflow-hidden',
        selectedItem ? 'w-[340px]' : 'w-[280px]'
      )}>
        {selectedItem ? (
          renderContextPanel({
            item: selectedItem,
            tenantSlug,
            onClose: () => setSelectedItem(null),
            onRefresh: doRefreshWithTimestamp,
          })
        ) : renderInsights ? (
          renderInsights({ items })
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <p className="text-xs text-muted-foreground">Seleccioná un item para ver detalles</p>
          </div>
        )}
      </div>

      {/* Mobile/Tablet overlay */}
      {selectedItem && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedItem(null)} />
          <div className="relative ml-auto w-full max-w-[380px]">
            {renderContextPanel({
              item: selectedItem,
              tenantSlug,
              onClose: () => setSelectedItem(null),
              onRefresh: doRefreshWithTimestamp,
            })}
          </div>
        </div>
      )}
    </div>
  )
}
