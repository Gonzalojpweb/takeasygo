'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search,
  Users,
  Loader2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Bell,
  MapPin,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import AppConsumerDetailModal from './AppConsumerDetailModal'

interface ConsumerData {
  _id: string
  name: string
  email: string
  image?: string
  isActive: boolean
  createdAt: string
  preferences: {
    displayName: string
    age: number
    zone: string
    cuisinePreferences: string[]
    experiencePreferences: string[]
    onboardingCompleted: boolean
    notificationPermission: 'granted' | 'denied' | 'default'
  } | null
}

interface Stats {
  total: number
  onboardingCompleted: number
  notificationsGranted: number
  topZone: { name: string; count: number } | null
  availableZones: string[]
}

export default function AppConsumersList() {
  const [consumers, setConsumers] = useState<ConsumerData[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [zoneFilter, setZoneFilter] = useState('')
  const [onboardingFilter, setOnboardingFilter] = useState('')
  const [notificationsFilter, setNotificationsFilter] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [stats, setStats] = useState<Stats | null>(null)
  const [selectedConsumer, setSelectedConsumer] = useState<ConsumerData | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const fetchConsumers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        search,
      })
      if (zoneFilter) params.set('zone', zoneFilter)
      if (onboardingFilter) params.set('onboarding', onboardingFilter)
      if (notificationsFilter) params.set('notifications', notificationsFilter)

      const res = await fetch(`/api/superadmin/app-consumers?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setConsumers(data.consumers)
      setTotalPages(data.pagination.pages)
      setStats(data.stats)
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar consumidores')
    } finally {
      setLoading(false)
    }
  }, [page, search, zoneFilter, onboardingFilter, notificationsFilter])

  useEffect(() => { fetchConsumers() }, [fetchConsumers])
  useEffect(() => { setPage(1) }, [search, zoneFilter, onboardingFilter, notificationsFilter])

  function openDetail(consumer: ConsumerData) {
    setSelectedConsumer(consumer)
    setDetailOpen(true)
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-muted/30 border border-border/60">
            <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Total registrados</p>
            <p className="text-2xl font-black">{stats.total}</p>
          </div>
          <div className="p-4 rounded-2xl bg-muted/30 border border-border/60">
            <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Onboarding completo</p>
            <p className="text-2xl font-black text-emerald-500">{stats.onboardingCompleted}</p>
          </div>
          <div className="p-4 rounded-2xl bg-muted/30 border border-border/60">
            <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Notificaciones activas</p>
            <p className="text-2xl font-black text-amber-500">{stats.notificationsGranted}</p>
          </div>
          <div className="p-4 rounded-2xl bg-muted/30 border border-border/60">
            <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Zona más popular</p>
            <p className="text-lg font-black truncate">{stats.topZone ? stats.topZone.name : '—'}</p>
            {stats.topZone && (
              <p className="text-[10px] text-muted-foreground">{stats.topZone.count} usuarios</p>
            )}
          </div>
        </div>
      )}

      {/* Filters + Table */}
      <Card className="border-2 border-border/60 rounded-[2.5rem] overflow-hidden">
        <CardHeader className="p-6 border-b border-border/40 bg-muted/5">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
              <Input
                placeholder="Buscar por nombre o email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10 bg-muted/40 border-2 border-border/60 focus:border-primary/40 h-10 rounded-xl text-sm font-medium"
              />
            </div>
            <select
              value={zoneFilter}
              onChange={e => setZoneFilter(e.target.value)}
              className="h-10 rounded-xl border-2 border-border/60 bg-muted/40 px-3 text-sm font-medium outline-none focus:border-primary/40"
            >
              <option value="">Todas las zonas</option>
              {stats?.availableZones.map(z => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
            <select
              value={onboardingFilter}
              onChange={e => setOnboardingFilter(e.target.value)}
              className="h-10 rounded-xl border-2 border-border/60 bg-muted/40 px-3 text-sm font-medium outline-none focus:border-primary/40"
            >
              <option value="">Todo onboarding</option>
              <option value="completed">Completado</option>
              <option value="pending">Pendiente</option>
            </select>
            <select
              value={notificationsFilter}
              onChange={e => setNotificationsFilter(e.target.value)}
              className="h-10 rounded-xl border-2 border-border/60 bg-muted/40 px-3 text-sm font-medium outline-none focus:border-primary/40"
            >
              <option value="">Todas notificaciones</option>
              <option value="granted">Activadas</option>
              <option value="denied">Desactivadas</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="animate-spin h-8 w-8 text-primary" />
            </div>
          ) : consumers.length === 0 ? (
            <div className="py-20 text-center">
              <Users size={48} className="mx-auto text-muted-foreground/20 mb-4" />
              <p className="text-muted-foreground font-bold">No se encontraron consumidores.</p>
              <p className="text-muted-foreground/60 text-sm mt-1">Nadie se ha registrado desde la app todavía.</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-6">Usuario</TableHead>
                    <TableHead>Zona</TableHead>
                    <TableHead>Edad</TableHead>
                    <TableHead>Cocinas</TableHead>
                    <TableHead>Onboarding</TableHead>
                    <TableHead>Notif.</TableHead>
                    <TableHead>Registrado</TableHead>
                    <TableHead className="pr-6"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consumers.map((c) => (
                    <TableRow
                      key={c._id}
                      className="hover:bg-muted/10 cursor-pointer"
                      onClick={() => openDetail(c)}
                    >
                      <TableCell className="pl-6">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 rounded-full">
                            {c.image ? (
                              <AvatarImage src={c.image} alt={c.name} />
                            ) : null}
                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                              {c.name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <span className="font-bold text-sm block">{c.name}</span>
                            <span className="text-[10px] text-muted-foreground font-mono">{c.email}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {c.preferences?.zone ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 border-2 text-[9px] font-bold">
                            <MapPin size={10} className="mr-1" />
                            {c.preferences.zone}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium">{c.preferences?.age ?? '—'}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {c.preferences?.cuisinePreferences?.slice(0, 2).map(cu => (
                            <Badge key={cu} variant="outline" className="text-[8px] font-bold border-border/60">
                              {cu}
                            </Badge>
                          ))}
                          {(c.preferences?.cuisinePreferences?.length ?? 0) > 2 && (
                            <Badge variant="outline" className="text-[8px] font-bold border-border/60">
                              +{(c.preferences?.cuisinePreferences?.length ?? 0) - 2}
                            </Badge>
                          )}
                          {(!c.preferences?.cuisinePreferences || c.preferences.cuisinePreferences.length === 0) && (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {c.preferences?.onboardingCompleted ? (
                          <CheckCircle2 size={18} className="text-emerald-500" />
                        ) : (
                          <XCircle size={18} className="text-muted-foreground/30" />
                        )}
                      </TableCell>
                      <TableCell>
                        {c.preferences?.notificationPermission === 'granted' ? (
                          <Bell size={16} className="text-amber-500" />
                        ) : (
                          <Bell size={16} className="text-muted-foreground/30" />
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{formatDate(c.createdAt)}</span>
                      </TableCell>
                      <TableCell className="pr-6">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-xl text-xs font-bold"
                          onClick={(e) => { e.stopPropagation(); openDetail(c) }}
                        >
                          Ver detalle
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 p-4 border-t border-border/40">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                    className="rounded-xl"
                  >
                    <ChevronLeft size={14} className="mr-1" /> Anterior
                  </Button>
                  <span className="text-sm text-muted-foreground font-medium px-4">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="rounded-xl"
                  >
                    Siguiente <ChevronRight size={14} className="ml-1" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchConsumers}
          className="rounded-xl text-xs"
        >
          <RefreshCw size={14} className="mr-2" /> Refrescar
        </Button>
      </div>

      {selectedConsumer && (
        <AppConsumerDetailModal
          consumer={selectedConsumer}
          open={detailOpen}
          onOpenChange={(open) => {
            setDetailOpen(open)
            if (!open) setSelectedConsumer(null)
          }}
        />
      )}
    </div>
  )
}
