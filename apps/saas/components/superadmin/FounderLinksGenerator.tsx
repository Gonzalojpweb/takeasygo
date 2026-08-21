'use client'

import { useState, useEffect, useCallback } from 'react'
import { Link2, Copy, Check, Download, Globe, ChevronDown, AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Tenant {
  _id: string
  name: string
  slug: string
  business?: { enabled?: boolean }
}

interface Location {
  _id: string
  name: string
  settings?: {
    orderModes?: string[]
  }
}

const MODE_LABELS: Record<string, string> = {
  home: 'Menú Home',
  takeaway: 'Take Away',
  delivery: 'Delivery',
  'dine-in': 'En el Local',
  business: 'Corporativo',
}

interface Props {
  tenants: Tenant[]
}

export default function FounderLinksGenerator({ tenants }: Props) {
  const [selectedTenantId, setSelectedTenantId] = useState('')
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [selectedMode, setSelectedMode] = useState('')
  const [loadingLocations, setLoadingLocations] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [baseUrl, setBaseUrl] = useState('')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBaseUrl(window.location.origin)
    }
  }, [])

  const selectedTenant = tenants.find(t => t._id === selectedTenantId)
  const selectedLocation = locations.find(l => l._id === selectedLocationId)
  const availableModes = selectedLocation?.settings?.orderModes ?? []
  const allModes = ['home', ...new Set(selectedTenant?.business?.enabled
    ? [...availableModes, 'business']
    : availableModes)]

  const fetchLocations = useCallback(async (tenantSlug: string) => {
    setLoadingLocations(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/locations`)
      const data = await res.json()
      if (res.ok) {
        setLocations(data.locations || [])
      } else {
        setLocations([])
      }
    } catch {
      setLocations([])
    } finally {
      setLoadingLocations(false)
    }
  }, [])

  useEffect(() => {
    if (selectedTenant) {
      fetchLocations(selectedTenant.slug)
      setSelectedLocationId('')
      setSelectedMode('')
    } else {
      setLocations([])
    }
  }, [selectedTenant, fetchLocations])

  useEffect(() => {
    if (locations.length === 1) {
      setSelectedLocationId(locations[0]._id)
    } else {
      setSelectedLocationId('')
    }
    setSelectedMode('')
  }, [locations])

  useEffect(() => {
    if (allModes.length === 1) {
      setSelectedMode(allModes[0])
    } else {
      setSelectedMode('')
    }
  }, [allModes.join(',')])

  const generateLink = (slug: string, locationId: string, mode: string) => {
    if (!baseUrl || !slug || !locationId || !mode) return ''
    if (mode === 'home') {
      return `${baseUrl}/${slug}/menu/${locationId}?source=tgo-customer`
    }
    return `${baseUrl}/${slug}/menu/${locationId}/${mode}?source=tgo-customer`
  }

  const currentLink = selectedTenant && selectedLocationId && selectedMode
    ? generateLink(selectedTenant.slug, selectedLocationId, selectedMode)
    : ''

  const copyToClipboard = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    toast.success('Link copiado')
    setTimeout(() => setCopied(null), 2000)
  }

  const downloadQR = (url: string, name: string) => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(url)}`
    window.open(qrUrl, '_blank')
  }

  return (
    <div className="space-y-8">
      {/* Selector interactivo */}
      <div className="bg-card border-2 border-border/60 rounded-2xl p-6 space-y-6">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Link2 size={20} className="text-[#f74211]" />
            Generador de Founder Link
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Generá links attribuidos a TAKEASYGO-CUSTOMER para compartir con clientes.
          </p>
        </div>

        {/* Selector de Tenant */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Seleccionar Tenant</label>
          <select
            value={selectedTenantId}
            onChange={(e) => setSelectedTenantId(e.target.value)}
            className="w-full h-10 text-sm bg-background border border-border/60 rounded-lg px-3"
          >
            <option value="">Selecciona un tenant...</option>
            {tenants.map(t => (
              <option key={t._id} value={t._id}>{t.name} ({t.slug})</option>
            ))}
          </select>
        </div>

        {/* Selector de Location */}
        {selectedTenant && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Seleccionar Sede</label>
            {loadingLocations ? (
              <div className="flex items-center gap-2 h-10 text-sm text-muted-foreground">
                <Loader2 size={14} className="animate-spin" />
                Cargando sedes...
              </div>
            ) : locations.length === 0 ? (
              <div className="flex items-center gap-2 h-10 text-sm text-amber-600">
                <AlertTriangle size={14} />
                Este tenant no tiene sedes activas
              </div>
            ) : (
              <select
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                className="w-full h-10 text-sm bg-background border border-border/60 rounded-lg px-3"
              >
                <option value="">Selecciona una sede...</option>
                {locations.map(l => (
                  <option key={l._id} value={l._id}>{l.name}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Selector de Modo */}
        {selectedLocationId && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Modo de Pedido</label>
            {allModes.length === 0 ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700">
                <AlertTriangle size={14} />
                Esta sede no tiene modos de pedido habilitados. No se puede generar el link.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {allModes.map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setSelectedMode(mode)}
                    className={cn(
                      'px-4 py-2 rounded-lg text-sm font-medium border transition-all',
                      selectedMode === mode
                        ? 'bg-[#f74211]/10 border-[#f74211]/30 text-[#f74211]'
                        : 'bg-background border-border/60 text-muted-foreground hover:border-border'
                    )}
                  >
                    {MODE_LABELS[mode] || mode}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Link generado */}
        {currentLink && (
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">Link generado</label>
            <div className="flex items-center gap-2 p-3 bg-muted/40 rounded-xl">
              <code className="flex-1 text-xs font-mono text-foreground break-all">{currentLink}</code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(currentLink, 'link')}
                className="shrink-0"
              >
                {copied === 'link' ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadQR(currentLink, selectedTenant?.name || '')}
                className="shrink-0"
                title="Descargar QR"
              >
                <Download size={14} />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Tabla rápida de todos los tenants */}
      <div className="bg-card border-2 border-border/60 rounded-2xl p-6 space-y-4">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Links por Tenant
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Links rápidos al Home del Menú y Take Away. Para elegir sede o modo específico, usá el generador de arriba.
          </p>
        </div>
        <div className="space-y-2">
          {tenants.map((tenant) => {
            const homeLink = baseUrl
              ? `${baseUrl}/${tenant.slug}/menu/LOCATION_ID?source=tgo-customer`
              : ''
            const takeawayLink = baseUrl
              ? `${baseUrl}/${tenant.slug}/menu/LOCATION_ID/takeaway?source=tgo-customer`
              : ''
            return (
              <div key={tenant._id} className="p-3 bg-muted/30 rounded-xl space-y-2">
                <div className="flex items-center gap-3">
                  <Globe size={16} className="text-[#f74211] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{tenant.name}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    Seleccioná sede arriba para generar el link exacto
                  </span>
                </div>
                <div className="pl-7 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase w-16 shrink-0">Home</span>
                    <p className="text-[10px] text-muted-foreground font-mono truncate flex-1">
                      {tenant.slug}/menu/LOCATION_ID?source=tgo-customer
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase w-16 shrink-0">Takeaway</span>
                    <p className="text-[10px] text-muted-foreground font-mono truncate flex-1">
                      {tenant.slug}/menu/LOCATION_ID/takeaway?source=tgo-customer
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
