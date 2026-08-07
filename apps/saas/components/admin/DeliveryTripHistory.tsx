'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft,
  MapPin,
  Package,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Clock,
  DollarSign,
  Route,
  ChevronLeft,
  ChevronRight,
  Phone,
  User,
  Calendar,
  RefreshCw,
  Loader2,
  ShoppingBag,
} from 'lucide-react'
import Link from 'next/link'
import { toPesos } from '@takeasygo/business'

interface Person {
  _id: string
  name: string
  phone: string
  tokenPrefix: string
  isActive: boolean
  createdAt: string
}

interface Trip {
  _id: string
  orderNumber: string
  status: string
  total: number
  deliveryCost: number
  deliveryDistance: number
  deliveryAddress?: {
    street: string
    number: string
    apt?: string
    city: string
  }
  customer: {
    name: string
    phone: string
  }
  createdAt: string
  statusTimestamps: {
    enRutaAt?: string | null
    deliveredAt?: string | null
    completedAt?: string | null
  }
  deliveryConfirmation?: {
    status: string
    arrivalAt?: string | null
    completedAt?: string | null
  }
}

interface Stats {
  totalTrips: number
  completedTrips: number
  disputedTrips: number
  totalRevenue: number
  totalDeliveryCost: number
  totalDistance: number
  avgDeliveryCost: number
  avgDistance: number
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
  hasMore: boolean
}

interface Props {
  tenantSlug: string
  personId: string
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(toPesos(n))
}

function formatDate(dateStr: string) {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr))
}

function formatDateShort(dateStr: string) {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr))
}

function calcDuration(from: string | null | undefined, to: string | null | undefined): string | null {
  if (!from || !to) return null
  const mins = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000)
  if (mins < 1) return '< 1 min'
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function TripStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Pendiente', cls: 'bg-zinc-100 text-zinc-600 border-zinc-200' },
    assigned: { label: 'Asignado', cls: 'bg-blue-50 text-blue-600 border-blue-200' },
    en_ruta: { label: 'En ruta', cls: 'bg-amber-50 text-amber-600 border-amber-200' },
    arrived: { label: 'Llegó', cls: 'bg-violet-50 text-violet-600 border-violet-200' },
    completed: { label: 'Completado', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    disputed: { label: 'Disputado', cls: 'bg-red-50 text-red-600 border-red-200' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-zinc-100 text-zinc-500 border-zinc-200' }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${s.cls}`}>
      {s.label}
    </span>
  )
}

export default function DeliveryTripHistory({ tenantSlug, personId }: Props) {
  const [person, setPerson] = useState<Person | null>(null)
  const [trips, setTrips] = useState<Trip[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null)

  const load = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/delivery/persons/${personId}/trips?page=${p}&limit=15`)
      if (!res.ok) throw new Error('Error al cargar historial')
      const data = await res.json()
      setPerson(data.person)
      setTrips(data.trips)
      setStats(data.stats)
      setPagination(data.pagination)
    } catch {
      // silently handle
    } finally {
      setLoading(false)
    }
  }, [tenantSlug, personId])

  useEffect(() => {
    load(page)
  }, [load, page])

  const completionRate = stats && stats.totalTrips > 0
    ? Math.round((stats.completedTrips / stats.totalTrips) * 100)
    : 0

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          href={`/${tenantSlug}/admin/delivery`}
          className="mt-1 p-2 rounded-xl border border-border hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              {person ? person.name : '—'}
            </h1>
            {person && (
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${person.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-zinc-100 text-zinc-500 border-zinc-200'}`}>
                {person.isActive ? 'Activo' : 'Inactivo'}
              </span>
            )}
          </div>
          {person && (
            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1.5">
                <Phone size={13} />
                {person.phone}
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar size={13} />
                Desde {formatDate(person.createdAt)}
              </span>
            </div>
          )}
        </div>
        <button
          onClick={() => load(page)}
          className="p-2 rounded-xl border border-border hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground cursor-pointer"
          title="Actualizar"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
        </button>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Total trips */}
          <div className="bg-card border border-border/70 rounded-2xl p-4 space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Viajes totales</p>
              <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                <Package size={13} className="text-blue-600" />
              </div>
            </div>
            <p className="text-2xl font-bold">{stats.totalTrips}</p>
            <p className="text-[11px] text-muted-foreground">{stats.completedTrips} completados</p>
          </div>

          {/* Completion rate */}
          <div className="bg-card border border-border/70 rounded-2xl p-4 space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Tasa de éxito</p>
              <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 size={13} className="text-emerald-600" />
              </div>
            </div>
            <p className="text-2xl font-bold">{completionRate}%</p>
            <div className="w-full bg-muted rounded-full h-1.5 mt-1">
              <div
                className="h-1.5 rounded-full bg-emerald-500 transition-all duration-700"
                style={{ width: `${completionRate}%` }}
              />
            </div>
          </div>

          {/* Avg delivery cost */}
          <div className="bg-card border border-border/70 rounded-2xl p-4 space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Costo prom. envío</p>
              <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center">
                <DollarSign size={13} className="text-orange-600" />
              </div>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(stats.avgDeliveryCost)}</p>
            <p className="text-[11px] text-muted-foreground">Total: {formatCurrency(stats.totalDeliveryCost)}</p>
          </div>

          {/* Distance */}
          <div className="bg-card border border-border/70 rounded-2xl p-4 space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Distancia prom.</p>
              <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center">
                <Route size={13} className="text-violet-600" />
              </div>
            </div>
            <p className="text-2xl font-bold">{stats.avgDistance.toFixed(1)} km</p>
            <p className="text-[11px] text-muted-foreground">Total: {stats.totalDistance.toFixed(1)} km</p>
          </div>
        </div>
      )}

      {/* Disputes warning */}
      {stats && stats.disputedTrips > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
          <AlertTriangle size={15} className="shrink-0" />
          <span><strong>{stats.disputedTrips}</strong> {stats.disputedTrips === 1 ? 'viaje disputado' : 'viajes disputados'} registrados</span>
        </div>
      )}

      {/* Trips table */}
      <div className="bg-card border border-border/70 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <div className="flex items-center gap-2">
            <TrendingUp size={15} className="text-muted-foreground" />
            <h2 className="font-semibold text-sm">Historial de viajes</h2>
          </div>
          {pagination && (
            <span className="text-xs text-muted-foreground">
              {pagination.total} {pagination.total === 1 ? 'viaje' : 'viajes'}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : trips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center">
              <ShoppingBag size={22} className="text-muted-foreground/50" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground">Sin viajes registrados</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Este delivery aún no tiene pedidos asignados</p>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pedido</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cliente</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dirección</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Estado</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Envío</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Duración</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {trips.map((trip, i) => {
                    const confStatus = trip.deliveryConfirmation?.status ?? 'pending'
                    const duration = calcDuration(
                      trip.statusTimestamps?.enRutaAt,
                      trip.deliveryConfirmation?.completedAt || trip.statusTimestamps?.deliveredAt
                    )
                    const address = trip.deliveryAddress
                      ? `${trip.deliveryAddress.street} ${trip.deliveryAddress.number}${trip.deliveryAddress.apt ? ` ${trip.deliveryAddress.apt}` : ''}`
                      : '—'
                    return (
                      <tr
                        key={trip._id}
                        onClick={() => setSelectedTrip(selectedTrip?._id === trip._id ? null : trip)}
                        className={`border-b border-border/30 transition-colors cursor-pointer hover:bg-muted/40 ${i % 2 === 0 ? '' : 'bg-muted/10'} ${selectedTrip?._id === trip._id ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}
                      >
                        <td className="px-5 py-3.5">
                          <span className="font-mono text-xs font-semibold text-foreground">#{trip.orderNumber}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <User size={12} className="text-muted-foreground shrink-0" />
                            <span className="text-sm truncate max-w-[120px]">{trip.customer.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <MapPin size={12} className="text-muted-foreground shrink-0" />
                            <span className="text-xs text-muted-foreground truncate max-w-[160px]">{address}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <TripStatusBadge status={confStatus} />
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <span className="text-sm font-medium">{formatCurrency(trip.deliveryCost)}</span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <span className="text-sm font-semibold">{formatCurrency(trip.total)}</span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {duration ? (
                            <span className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                              <Clock size={11} />
                              {duration}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/40">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDateShort(trip.createdAt)}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-border/30">
              {trips.map(trip => {
                const confStatus = trip.deliveryConfirmation?.status ?? 'pending'
                const duration = calcDuration(
                  trip.statusTimestamps?.enRutaAt,
                  trip.deliveryConfirmation?.completedAt || trip.statusTimestamps?.deliveredAt
                )
                const address = trip.deliveryAddress
                  ? `${trip.deliveryAddress.street} ${trip.deliveryAddress.number}`
                  : '—'
                return (
                  <div
                    key={trip._id}
                    onClick={() => setSelectedTrip(selectedTrip?._id === trip._id ? null : trip)}
                    className={`p-4 cursor-pointer transition-colors ${selectedTrip?._id === trip._id ? 'bg-primary/5' : 'hover:bg-muted/40'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold">#{trip.orderNumber}</span>
                          <TripStatusBadge status={confStatus} />
                        </div>
                        <p className="text-sm font-medium truncate">{trip.customer.name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin size={10} />
                          <span className="truncate">{address}</span>
                        </p>
                      </div>
                      <div className="text-right shrink-0 space-y-1">
                        <p className="text-sm font-bold">{formatCurrency(trip.total)}</p>
                        <p className="text-xs text-muted-foreground">{formatCurrency(trip.deliveryCost)} envío</p>
                        {duration && (
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1 justify-end">
                            <Clock size={10} />
                            {duration}
                          </p>
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground/60 mt-2">{formatDate(trip.createdAt)}</p>
                  </div>
                )
              })}
            </div>

            {/* Trip detail panel (expanded) */}
            {selectedTrip && (
              <div className="mx-4 mb-4 mt-2 rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-primary uppercase tracking-wide">Detalle del viaje</p>
                  <button
                    onClick={() => setSelectedTrip(null)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    Cerrar
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium mb-0.5">Pedido</p>
                    <p className="font-mono font-bold">#{selectedTrip.orderNumber}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium mb-0.5">Cliente</p>
                    <p className="font-medium">{selectedTrip.customer.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedTrip.customer.phone || '—'}</p>
                  </div>
                  {selectedTrip.deliveryAddress && (
                    <div className="col-span-2">
                      <p className="text-[11px] text-muted-foreground font-medium mb-0.5">Dirección</p>
                      <p className="font-medium">
                        {selectedTrip.deliveryAddress.street} {selectedTrip.deliveryAddress.number}
                        {selectedTrip.deliveryAddress.apt ? ` ${selectedTrip.deliveryAddress.apt}` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">{selectedTrip.deliveryAddress.city}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium mb-0.5">Distancia</p>
                    <p className="font-bold">{selectedTrip.deliveryDistance.toFixed(1)} km</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium mb-0.5">Costo envío</p>
                    <p className="font-bold">{formatCurrency(selectedTrip.deliveryCost)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium mb-0.5">Total pedido</p>
                    <p className="font-bold">{formatCurrency(selectedTrip.total)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium mb-0.5">Estado entrega</p>
                    <TripStatusBadge status={selectedTrip.deliveryConfirmation?.status ?? 'pending'} />
                  </div>
                  {selectedTrip.statusTimestamps?.enRutaAt && (
                    <div>
                      <p className="text-[11px] text-muted-foreground font-medium mb-0.5">Salió a las</p>
                      <p className="text-xs">{formatDateShort(selectedTrip.statusTimestamps.enRutaAt)}</p>
                    </div>
                  )}
                  {(selectedTrip.deliveryConfirmation?.completedAt || selectedTrip.statusTimestamps?.deliveredAt) && (
                    <div>
                      <p className="text-[11px] text-muted-foreground font-medium mb-0.5">Entregó a las</p>
                      <p className="text-xs">
                        {formatDateShort(
                          selectedTrip.deliveryConfirmation?.completedAt ||
                          selectedTrip.statusTimestamps?.deliveredAt || ''
                        )}
                      </p>
                    </div>
                  )}
                  {(() => {
                    const dur = calcDuration(
                      selectedTrip.statusTimestamps?.enRutaAt,
                      selectedTrip.deliveryConfirmation?.completedAt || selectedTrip.statusTimestamps?.deliveredAt
                    )
                    if (!dur) return null
                    return (
                      <div>
                        <p className="text-[11px] text-muted-foreground font-medium mb-0.5">Duración del viaje</p>
                        <p className="font-bold text-primary">{dur}</p>
                      </div>
                    )
                  })()}
                </div>
              </div>
            )}

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-4 border-t border-border/40">
                <p className="text-xs text-muted-foreground">
                  Página {pagination.page} de {pagination.totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={pagination.page <= 1}
                    className="p-2 rounded-lg border border-border hover:bg-muted/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={!pagination.hasMore}
                    className="p-2 rounded-lg border border-border hover:bg-muted/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
