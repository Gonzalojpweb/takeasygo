'use client'

// ── AdminTopBar ───────────────────────────────────────────────────────────────
//
// Header fijo del admin panel. Muestra:
// - Título de la sección actual (derivado de la URL)
// - Selector de sede SIEMPRE visible con color coding
//
// Requiere AdminLocationContext.

import { useState, useRef, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { MapPin, ChevronDown, Check, Building2, Globe } from 'lucide-react'
import { useAdminLocation } from '@/contexts/AdminLocationContext'
import { getLocationColor } from '@/lib/location-colors'

const SECTION_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  orders: 'Pedidos',
  history: 'Historial',
  reservas: 'Reservaciones',
  printers: 'Impresoras',
  delivery: 'Flota',
  menu: 'Menú',
  promotions: 'Promociones',
  'marketing-qr': 'Marketing QR',
  club: 'Club',
  'go-plus': 'GO+',
  wallet: 'Wallet',
  store: 'Tienda',
  notificaciones: 'Notificaciones',
  crm: 'CRM',
  reports: 'Reportes',
  analytics: 'Analytics',
  reviews: 'Reseñas',
  ico: 'ICO',
  audit: 'Auditoría',
  tia: 'Inteligencia TIA',
  cis: 'Clientes Inteligentes',
  users: 'Usuarios',
  billing: 'Facturación',
  settings: 'Configuración',
  ayuda: 'Centro de Ayuda',
  updates: 'Novedades',
}

function getSectionLabel(pathname: string): string {
  const parts = pathname.split('/')
  // Find the section after 'admin'
  const adminIdx = parts.findIndex(p => p === 'admin')
  if (adminIdx >= 0 && adminIdx + 1 < parts.length) {
    const section = parts[adminIdx + 1]
    return SECTION_LABELS[section] || section
  }
  return 'Panel de control'
}

export default function AdminTopBar() {
  const { locations, activeLocation, activeColor, setActiveLocation, isAllLocations, assignedLocations, userRole } = useAdminLocation()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const sectionLabel = getSectionLabel(pathname)

  const isAdmin = userRole === 'admin' || userRole === 'superadmin'
  const visibleLocations = locations.filter(l => isAdmin || assignedLocations.includes(l._id))

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Close on route change
  useEffect(() => { setOpen(false) }, [pathname])

  if (visibleLocations.length <= 1) return null

  return (
    <div
      className="sticky top-0 z-30 flex items-center justify-between gap-4 px-4 md:px-8 lg:px-10 py-3 border-b border-border/50"
      style={{ backgroundColor: 'var(--tgo-card, #FBF9F7)' }}
    >
      {/* Left: Section title */}
      <h1 className="text-lg font-semibold text-foreground truncate">
        {sectionLabel}
      </h1>

      {/* Right: Location selector */}
      <div className="relative shrink-0" ref={dropdownRef}>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-all duration-200 hover:shadow-sm active:scale-[0.98]"
          style={{
            borderColor: activeColor ? activeColor.border : 'var(--tgo-border, #E0DCDF)',
            backgroundColor: activeColor ? activeColor.soft : 'var(--tgo-card, #FFFFFF)',
          }}
        >
          {/* Color dot */}
          {activeLocation && (
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: activeColor?.bg }}
            />
          )}
          {!activeLocation && (
            <Building2 size={14} className="text-muted-foreground shrink-0" />
          )}
          <span className="text-sm font-medium truncate max-w-[140px]">
            {activeLocation ? activeLocation.name : 'Todas las sedes'}
          </span>
          <ChevronDown
            size={14}
            className={`text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Dropdown */}
        {open && (
          <div
            className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-border/60 shadow-lg overflow-hidden z-50"
            style={{ backgroundColor: 'var(--tgo-card, #FFFFFF)' }}
          >
            {/* "Todas" option */}
            {isAdmin && (
              <button
                onClick={() => { setActiveLocation(null); setOpen(false) }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                style={{
                  backgroundColor: isAllLocations ? 'var(--tgo-surface-1, #ECEAE9)' : undefined,
                }}
              >
                <Globe size={16} className="text-muted-foreground shrink-0" />
                <span className="flex-1 text-sm font-medium">Todas las sedes</span>
                {isAllLocations && <Check size={14} className="text-primary shrink-0" />}
              </button>
            )}

            {/* Separator */}
            {isAdmin && <div className="h-px bg-border/40" />}

            {/* Individual locations */}
            {visibleLocations.map(loc => {
              const color = getLocationColor(loc.colorIndex)
              const isActive = activeLocation?._id === loc._id
              return (
                <button
                  key={loc._id}
                  onClick={() => { setActiveLocation(loc._id); setOpen(false) }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                  style={{
                    backgroundColor: isActive ? color.soft : undefined,
                  }}
                >
                  <span
                    className="w-3 h-3 rounded-full shrink-0 border"
                    style={{
                      backgroundColor: color.bg,
                      borderColor: color.border,
                    }}
                  />
                  <span className="flex-1 text-sm font-medium truncate">{loc.name}</span>
                  {isActive && <Check size={14} className="shrink-0" style={{ color: color.bg }} />}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
