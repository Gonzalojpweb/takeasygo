'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import BoardColumn from './BoardColumn'
import BoardToolbar from './BoardToolbar'
import { useBoardAutoRefresh } from './useBoardAutoRefresh'
import { useBoardNewItemDetector } from './useBoardNewItemDetector'
import { useWorkspaceZoom } from './useWorkspaceZoom'
import { toast } from 'sonner'
import type { BoardItem, OperationsBoardProps } from './types'

export default function OperationsBoard<T extends BoardItem>({
  items,
  columns,
  tenantSlug,
  activeStatuses,
  alertStatuses,
  searchConfig,
  locationConfig,
  renderCard,
  renderContextPanel,
  renderInsights,
  toolbarActions,
  onCleanup,
  getNewItemToast,
  soundSrc,
  onLocationChange,
}: OperationsBoardProps<T>) {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [activeLocation, setActiveLocation] = useState('all')
  const [selectedItem, setSelectedItem] = useState<T | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(true)

  const handleLocationChange = useCallback((loc: string) => {
    setActiveLocation(loc)
    onLocationChange?.(loc)
  }, [onLocationChange])

  // Keep selectedItem in sync when items refresh (e.g. after router.refresh())
  useEffect(() => {
    if (selectedItem) {
      const fresh = items.find(i => i._id === selectedItem._id)
      if (fresh) setSelectedItem(fresh)
    }
  }, [items])
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
  const { newItemIds } = useBoardNewItemDetector({
    items,
    alertStatuses: effectiveAlertStatuses,
    soundEnabled,
    soundSrc,
    getNewItemToast,
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
    acc[col.status] = filteredItems.filter(o => o.status === col.status)
    return acc
  }, {} as Record<string, T[]>)

  const activeCount = activeStatuses.reduce((sum, s) => sum + (itemsByStatus[s]?.length || 0), 0)

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
        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-3 md:p-4">
          <div
            className="flex gap-3 h-full md:gap-4"
            style={{ zoom: mounted ? zoom : 1 }}
          >
            {columns.map(col => (
              <BoardColumn
                key={col.status}
                column={col}
                items={itemsByStatus[col.status] || []}
                selectedItemId={selectedItem?._id || null}
                newItemIds={newItemIds}
                onSelectItem={setSelectedItem}
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
