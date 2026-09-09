'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Store, Search, Loader2, MapPin, Clock, UtensilsCrossed,
  Truck, ArrowRight, AlertTriangle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Restaurant {
  tenantId: string
  tenantName: string
  tenantSlug: string
  tenantLogoUrl: string
  locationId: string
  locationName: string
  locationSlug: string
  address: string
  coordinates: { lat: number; lng: number } | null
  cuisineTypes: string[]
  isOpenNow: boolean | null
  hasDelivery: boolean
  hasBusiness: boolean
  businessEnabled: boolean
}

interface Props {
  corporateAccountId: string
  onSelect?: (restaurant: Restaurant) => void
  compact?: boolean
}

export default function CorporateDirectory({ corporateAccountId, onSelect, compact = false }: Props) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [cuisineFilter, setCuisineFilter] = useState('')
  const [openOnly, setOpenOnly] = useState(false)

  const fetchRestaurants = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const callerEmail = sessionStorage.getItem('businessEmail') || ''
      const params = new URLSearchParams({ corporateAccountId, email: callerEmail })
      const res = await fetch(`/api/business/corporate-restaurants?${params}`)
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Error al cargar restaurantes')
      }
      const data = await res.json()
      setRestaurants(data.restaurants || [])
    } catch (err: any) {
      setError(err?.message || 'Error al cargar restaurantes')
    } finally {
      setLoading(false)
    }
  }, [corporateAccountId])

  useEffect(() => { fetchRestaurants() }, [fetchRestaurants])

  // Extract unique cuisine types
  const allCuisines = [...new Set(restaurants.flatMap(r => r.cuisineTypes))].sort()

  // Filter
  const filtered = restaurants.filter(r => {
    if (search) {
      const q = search.toLowerCase()
      if (!r.tenantName.toLowerCase().includes(q) && !r.locationName.toLowerCase().includes(q) && !r.address.toLowerCase().includes(q)) return false
    }
    if (cuisineFilter && !r.cuisineTypes.includes(cuisineFilter)) return false
    if (openOnly && r.isOpenNow !== true) return false
    return true
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <AlertTriangle size={40} className="text-destructive/50 mb-3" />
        <p className="text-destructive font-medium">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      {!compact && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar restaurante, dirección..."
              className="w-full bg-muted/40 border-2 border-border/60 focus:border-primary/40 focus:bg-background text-foreground text-sm font-medium rounded-xl pl-10 pr-4 py-2.5 outline-none transition-all"
            />
          </div>
          <select
            value={cuisineFilter}
            onChange={(e) => setCuisineFilter(e.target.value)}
            className="bg-muted/40 border-2 border-border/60 focus:border-primary/40 text-foreground text-sm font-medium rounded-xl px-4 py-2.5 outline-none transition-all"
          >
            <option value="">Todas las cocinas</option>
            {allCuisines.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button
            onClick={() => setOpenOnly(!openOnly)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border-2 transition-all",
              openOnly
                ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-600"
                : "bg-muted/40 border-border/60 text-muted-foreground hover:bg-muted/60"
            )}
          >
            <Clock size={14} />
            Abiertos
          </button>
        </div>
      )}

      {/* Restaurant grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <Store size={40} className="mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground font-medium">
            {restaurants.length === 0 ? 'No hay restaurantes disponibles' : 'No se encontraron resultados'}
          </p>
        </div>
      ) : (
        <div className={cn(
          "grid gap-4",
          compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        )}>
          {filtered.map((r) => (
            <div
              key={r.locationId}
              className="bg-card border-2 border-border/60 rounded-2xl overflow-hidden hover:border-primary/30 transition-all group"
            >
              {/* Header with logo */}
              <div className="relative h-24 bg-gradient-to-br from-primary/5 to-primary/10 flex items-center justify-center overflow-hidden">
                {r.tenantLogoUrl ? (
                  <img src={r.tenantLogoUrl} alt={r.tenantName} className="h-16 w-16 object-contain" />
                ) : (
                  <Store size={32} className="text-primary/30" />
                )}
                {/* Status badge */}
                <div className="absolute top-2 right-2">
                  {r.isOpenNow === true ? (
                    <Badge className="bg-emerald-500/90 text-white border-0 text-[9px] font-bold">Abierto</Badge>
                  ) : r.isOpenNow === false ? (
                    <Badge className="bg-muted text-muted-foreground border-0 text-[9px] font-bold">Cerrado</Badge>
                  ) : (
                    <Badge className="bg-muted text-muted-foreground border-0 text-[9px] font-bold">Sin horarios</Badge>
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="p-4 space-y-3">
                <div>
                  <h3 className="font-bold text-sm">{r.tenantName}</h3>
                  <p className="text-xs text-muted-foreground">{r.locationName}</p>
                </div>

                <div className="flex items-start gap-1.5">
                  <MapPin size={12} className="text-muted-foreground mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground line-clamp-2">{r.address}</p>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-1.5">
                  {r.cuisineTypes.slice(0, 3).map(c => (
                    <Badge key={c} variant="outline" className="text-[8px] font-bold border-border/60">
                      <UtensilsCrossed size={8} className="mr-1" />
                      {c}
                    </Badge>
                  ))}
                  {r.hasDelivery && (
                    <Badge className="bg-primary/10 text-primary border-0 text-[8px] font-bold">
                      <Truck size={8} className="mr-1" />
                      Delivery
                    </Badge>
                  )}
                </div>

                {/* Action */}
                {onSelect ? (
                  <button
                    onClick={() => onSelect(r)}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-all"
                  >
                    Ver menú
                    <ArrowRight size={12} />
                  </button>
                ) : (
                  <a
                    href={`/${r.tenantSlug}/menu/${r.locationId}/business`}
                    className="flex items-center justify-center gap-2 py-2 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-all"
                  >
                    Ver menú
                    <ArrowRight size={12} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Total */}
      {!compact && (
        <p className="text-xs text-muted-foreground text-center">
          {filtered.length} de {restaurants.length} restaurantes disponibles
        </p>
      )}
    </div>
  )
}
