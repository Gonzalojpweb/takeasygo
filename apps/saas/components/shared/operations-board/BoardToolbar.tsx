'use client'

import { type ReactNode } from 'react'
import { Search, RefreshCw, Radio, Volume2, VolumeX, Trash2, ZoomIn, ZoomOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getLocationColor } from '@/lib/location-colors'

interface BoardToolbarProps {
  searchTerm: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  locations?: { _id: string; name: string; colorIndex?: number }[]
  activeLocation?: string
  onLocationChange?: (locationId: string) => void
  soundEnabled: boolean
  onSoundToggle: () => void
  onRefresh: () => void
  lastUpdated?: Date | null
  totalItems: number
  activeCount: number
  onCleanup?: () => void | Promise<void>
  cleanupLoading?: boolean
  extraActions?: ReactNode
  zoomPercent?: number
  onZoomIn?: () => void
  onZoomOut?: () => void
  onZoomReset?: () => void
}

export default function BoardToolbar({
  searchTerm,
  onSearchChange,
  searchPlaceholder = 'Buscar...',
  locations = [],
  activeLocation = 'all',
  onLocationChange,
  soundEnabled,
  onSoundToggle,
  onRefresh,
  lastUpdated,
  totalItems,
  activeCount,
  onCleanup,
  cleanupLoading = false,
  extraActions,
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: BoardToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-border/50 md:px-4 md:py-3 md:gap-3">
      {/* Search */}
      <div className="relative flex-1 min-w-[140px] max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={searchTerm}
          onChange={e => onSearchChange(e.target.value)}
          className="w-full bg-muted/50 border border-border/60 focus:border-primary/40 rounded-xl pl-9 pr-3 py-2 outline-none transition-all text-xs"
        />
      </div>

      {/* Location filter — hidden on small screens */}
      {locations.length > 0 && onLocationChange && (
        <div className="hidden md:flex items-center gap-1.5">
          <button
            onClick={() => onLocationChange('all')}
            className={cn(
              'px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all border shrink-0',
              activeLocation === 'all'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border/60 hover:bg-muted'
            )}
          >
            Todas
          </button>
          {locations.map(loc => {
            const color = loc.colorIndex !== undefined ? getLocationColor(loc.colorIndex) : null
            const isActive = activeLocation === loc._id
            return (
              <button
                key={loc._id}
                onClick={() => onLocationChange(loc._id)}
                className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all border shrink-0 flex items-center gap-1.5"
                style={isActive && color ? {
                  backgroundColor: color.bg,
                  color: color.text,
                  borderColor: color.bg,
                } : undefined}
              >
                {color && (
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={isActive ? { backgroundColor: 'rgba(255,255,255,0.6)' } : { backgroundColor: color.bg }}
                  />
                )}
                {loc.name}
              </button>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-1.5 md:gap-2 ml-auto">
        {/* Extra actions slot */}
        {extraActions}

        {/* Sound toggle */}
        <button
          onClick={onSoundToggle}
          className={cn(
            'h-7 w-7 rounded-lg border border-border/60 flex items-center justify-center transition-all',
            soundEnabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          )}
          title={soundEnabled ? 'Silenciar alertas' : 'Activar alertas'}
        >
          {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
        </button>

        {/* Cleanup */}
        {onCleanup && (
          <button
            onClick={onCleanup}
            disabled={cleanupLoading}
            className="h-7 px-2 rounded-lg border border-border/60 bg-muted/50 hover:bg-muted flex items-center gap-1 text-muted-foreground hover:text-foreground transition-all disabled:opacity-50"
            title="Limpiar items antiguos"
          >
            <Trash2 size={12} />
            <span className="text-[10px] font-semibold hidden lg:inline">Limpiar</span>
          </button>
        )}

        {/* Zoom controls */}
        {zoomPercent !== undefined && onZoomOut && onZoomReset && onZoomIn && (
          <div className="hidden md:flex items-center gap-0.5 border border-border/60 rounded-lg overflow-hidden">
            <button
              onClick={onZoomOut}
              className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              title="Alejar"
            >
              <ZoomOut size={12} />
            </button>
            <button
              onClick={onZoomReset}
              className="h-7 px-1.5 flex items-center justify-center text-[10px] font-bold tabular-nums text-muted-foreground hover:text-foreground hover:bg-muted transition-all min-w-[40px]"
              title="Restablecer zoom"
            >
              {zoomPercent}%
            </button>
            <button
              onClick={onZoomIn}
              className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              title="Acercar"
            >
              <ZoomIn size={12} />
            </button>
          </div>
        )}

        {/* Refresh */}
        <button
          onClick={onRefresh}
          className="h-7 w-7 rounded-lg border border-border/60 bg-muted/50 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-all"
          title="Actualizar"
        >
          <RefreshCw size={13} />
        </button>

        {/* Live indicator — hidden on small screens */}
        <div className="hidden sm:flex items-center gap-1.5">
          <Radio size={10} className="text-emerald-500" />
          <span className="text-[10px] text-muted-foreground font-medium tabular-nums">
            {lastUpdated ? lastUpdated.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '—'}
          </span>
        </div>

        {/* Counts */}
        <span className="text-[10px] text-muted-foreground font-bold tabular-nums">
          {totalItems} total · {activeCount} activos
        </span>
      </div>
    </div>
  )
}
