'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import MercadoPagoSettings from './MercadoPagoSettings'
import KriptonSettings from './KriptonSettings'
import TransferSettings from './TransferSettings'
import PaymentSurchargeSettings from './PaymentSurchargeSettings'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Palette, User, MapPin,
  Settings as SettingsIcon,
  CreditCard, Camera,
  Instagram, Facebook,
  Twitter, Globe,
  Clock, Save,
  Smartphone, Eye, AlertCircle,
  Film, Loader2,
  CalendarDays, Plus, X, Trash2,
  ExternalLink,
  Database,
  ImageIcon,
  Bell, PlusCircle, ShoppingBag, Coins, Banknote, Percent,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { canAccess } from '@/lib/plans'
import type { Plan } from '@/lib/plans'
import { CURATED_FONTS, FONT_ROLES, FONT_MAP } from '@/lib/fonts'
import type { FontRole, FontSource } from '@/lib/fonts'


type HeroMediaType = 'none' | 'image' | 'video'
type HeroConfig = { mediaType: HeroMediaType; url: string; showLogo: boolean }

interface Props {
  tenant: any
  locations: any[]
  tenantSlug: string
  plan?: string
}

export default function SettingsForm({ tenant, locations, tenantSlug, plan }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const defaultFonts = {
    heading: { source: 'google' as FontSource, family: 'inter', weight: '' },
    body: { source: 'google' as FontSource, family: 'inter', weight: '' },
    display: { source: 'google' as FontSource, family: 'playfair-display', weight: '' },
    tag: { source: 'google' as FontSource, family: 'inter', weight: '' },
  }

  const [branding, setBranding] = useState({
    ...tenant.branding,
    fonts: tenant.branding?.fonts || defaultFonts,
  })
  const [activeTab, setActiveTab] = useState('branding')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Profile state
  const [profileLoading, setProfileLoading] = useState(false)
  const [profile, setProfile] = useState({
    menuDescription: tenant.profile?.menuDescription ?? '',
    about: tenant.profile?.about ?? '',
    social: {
      instagram: tenant.profile?.social?.instagram ?? '',
      facebook: tenant.profile?.social?.facebook ?? '',
      twitter: tenant.profile?.social?.twitter ?? '',
    },
    branding: {
      behance: tenant.profile?.branding?.behance ?? '',
    },
  })

  // Location hours state
  const [hoursMap, setHoursMap] = useState<Record<string, string>>(
    Object.fromEntries(locations.map((l: any) => [l._id, l.hours ?? '']))
  )
  const [hoursLoading, setHoursLoading] = useState<string | null>(null)

  // Location mapsUrl state
  const [mapsUrlMap, setMapsUrlMap] = useState<Record<string, string>>(
    Object.fromEntries(locations.map((l: any) => [l._id, l.mapsUrl ?? '']))
  )
  const [mapsUrlLoading, setMapsUrlLoading] = useState<string | null>(null)

  // Location hero state
  const [heroMap, setHeroMap] = useState<Record<string, HeroConfig>>(
    Object.fromEntries(locations.map((l: any) => [
      l._id,
      { mediaType: l.hero?.mediaType ?? 'none', url: l.hero?.url ?? '', showLogo: l.hero?.showLogo !== false },
    ]))
  )
  const [heroSaving, setHeroSaving] = useState<string | null>(null)

  // Reservation config state
  type OperatingHourConfig = { days: number[]; open: string; close: string }
  type ReservationConfig = {
    enabled: boolean
    minPayment: number
    timeSlots: string[]
    maxPartySize: number
    slotConfig?: {
      enabled: boolean
      operatingHours: OperatingHourConfig[]
      slotIntervalMinutes: number
      blockDurationMinutes: number
      maxReservationsPerSlot: number
    }
  }
  const [reservationMap, setReservationMap] = useState<Record<string, ReservationConfig>>(
    Object.fromEntries(locations.map((l: any) => [
      l._id,
      {
        enabled: l.reservationConfig?.enabled ?? false,
        minPayment: l.reservationConfig?.minPayment ?? 0,
        timeSlots: l.reservationConfig?.timeSlots ?? [],
        maxPartySize: l.reservationConfig?.maxPartySize ?? 10,
        slotConfig: {
          enabled: l.reservationConfig?.slotConfig?.enabled ?? false,
          operatingHours: l.reservationConfig?.slotConfig?.operatingHours ?? [],
          slotIntervalMinutes: l.reservationConfig?.slotConfig?.slotIntervalMinutes ?? 30,
          blockDurationMinutes: l.reservationConfig?.slotConfig?.blockDurationMinutes ?? 90,
          maxReservationsPerSlot: l.reservationConfig?.slotConfig?.maxReservationsPerSlot ?? 1,
        },
      },
    ]))
  )
  const [reservationSaving, setReservationSaving] = useState<string | null>(null)
  const [newSlotMap, setNewSlotMap] = useState<Record<string, string>>({})

  // Service hours state
  type ServiceHoursSlot = { days: number[]; open: string; close: string }
  type ServiceHoursConfig = { takeaway: ServiceHoursSlot[]; dineIn: ServiceHoursSlot[]; delivery: ServiceHoursSlot[] }
  const [serviceHoursMap, setServiceHoursMap] = useState<Record<string, ServiceHoursConfig>>(
    Object.fromEntries(locations.map((l: any) => [
      l._id,
      {
        takeaway: l.serviceHours?.takeaway ?? [],
        dineIn: l.serviceHours?.dineIn ?? [],
        delivery: l.serviceHours?.delivery ?? [],
      }
    ]))
  )
  const [serviceHoursSaving, setServiceHoursSaving] = useState<string | null>(null)

  // Scheduled orders config state
  type ScheduledOrdersConfig = {
    enabled: boolean
    maxAdvanceHours: number
    minAdvanceMinutes: number
    slotDurationMinutes: number
    maxOrdersPerSlot: number
  }
  const [scheduledOrdersMap, setScheduledOrdersMap] = useState<Record<string, ScheduledOrdersConfig>>(
    Object.fromEntries(locations.map((l: any) => [
      l._id,
      {
        enabled: l.scheduledOrdersConfig?.enabled ?? false,
        maxAdvanceHours: l.scheduledOrdersConfig?.maxAdvanceHours ?? 24,
        minAdvanceMinutes: l.scheduledOrdersConfig?.minAdvanceMinutes ?? 30,
        slotDurationMinutes: l.scheduledOrdersConfig?.slotDurationMinutes ?? 15,
        maxOrdersPerSlot: l.scheduledOrdersConfig?.maxOrdersPerSlot ?? 10,
      },
    ]))
  )
  const [scheduledOrdersSaving, setScheduledOrdersSaving] = useState<string | null>(null)

  // Notifications state
  const [notifPhone, setNotifPhone] = useState(tenant.notifications?.whatsappPhone ?? '')
  const [notifyOrder, setNotifyOrder] = useState(tenant.notifications?.notifyOnOrder ?? true)
  const [notifyReservation, setNotifyReservation] = useState(tenant.notifications?.notifyOnReservation ?? true)
  const [notifSaving, setNotifSaving] = useState(false)

  async function handleSaveNotifications() {
    setNotifSaving(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/settings/notifications`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          whatsappPhone: notifPhone || null,
          notifyOnOrder: notifyOrder,
          notifyOnReservation: notifyReservation,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Configuración de notificaciones guardada')
    } catch {
      toast.error('Error al guardar configuración')
    } finally {
      setNotifSaving(false)
    }
  }

  async function handleSaveReservationConfig(locationId: string) {
    setReservationSaving(locationId)
    try {
      const res = await fetch(`/api/${tenantSlug}/locations/${locationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservationConfig: reservationMap[locationId] }),
      })
      if (!res.ok) throw new Error()
      toast.success('Configuración de reservas guardada')
    } catch {
      toast.error('Error al guardar configuración')
    } finally {
      setReservationSaving(null)
    }
  }

  function addSlot(locationId: string) {
    const slot = (newSlotMap[locationId] || '').trim()
    if (!slot || !/^\d{2}:\d{2}$/.test(slot)) {
      toast.error('Formato inválido. Usá HH:MM (ej: 13:00)')
      return
    }
    setReservationMap(prev => {
      const current = prev[locationId]
      if (current.timeSlots.includes(slot)) return prev
      const updated = [...current.timeSlots, slot].sort()
      return { ...prev, [locationId]: { ...current, timeSlots: updated } }
    })
    setNewSlotMap(prev => ({ ...prev, [locationId]: '' }))
  }

  function removeSlot(locationId: string, slot: string) {
    setReservationMap(prev => {
      const current = prev[locationId]
      return { ...prev, [locationId]: { ...current, timeSlots: current.timeSlots.filter(s => s !== slot) } }
    })
  }

  async function handleSaveScheduledOrdersConfig(locationId: string) {
    setScheduledOrdersSaving(locationId)
    try {
      const res = await fetch(`/api/${tenantSlug}/locations/${locationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledOrdersConfig: scheduledOrdersMap[locationId] }),
      })
      if (!res.ok) throw new Error()
      toast.success('Configuración de pedidos programados guardada')
    } catch {
      toast.error('Error al guardar configuración')
    } finally {
      setScheduledOrdersSaving(null)
    }
  }

  async function handleSaveServiceHours(locationId: string) {
    setServiceHoursSaving(locationId)
    try {
      const body: Record<string, any> = { serviceHours: serviceHoursMap[locationId] }

      const res = await fetch(`/api/${tenantSlug}/locations/${locationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      toast.success('Horarios de servicio guardados')
    } catch {
      toast.error('Error al guardar horarios de servicio')
    } finally {
      setServiceHoursSaving(null)
    }
  }

  function addServiceSlot(locationId: string, type: 'takeaway' | 'dineIn' | 'delivery') {
    setServiceHoursMap(prev => ({
      ...prev,
      [locationId]: {
        ...prev[locationId],
        [type]: [...(prev[locationId]?.[type] ?? []), { days: [1, 2, 3, 4, 5], open: '09:00', close: '22:00' }],
      },
    }))
  }

  function removeServiceSlot(locationId: string, type: 'takeaway' | 'dineIn' | 'delivery', idx: number) {
    setServiceHoursMap(prev => ({
      ...prev,
      [locationId]: {
        ...prev[locationId],
        [type]: prev[locationId][type].filter((_, i) => i !== idx),
      },
    }))
  }

  function updateServiceSlot(
    locationId: string,
    type: 'takeaway' | 'dineIn' | 'delivery',
    idx: number,
    field: 'open' | 'close',
    value: string
  ) {
    setServiceHoursMap(prev => {
      const slots = [...prev[locationId][type]]
      slots[idx] = { ...slots[idx], [field]: value }
      return { ...prev, [locationId]: { ...prev[locationId], [type]: slots } }
    })
  }

  function toggleServiceDay(locationId: string, type: 'takeaway' | 'dineIn' | 'delivery', idx: number, day: number) {
    setServiceHoursMap(prev => {
      const slots = [...prev[locationId][type]]
      const days = slots[idx].days.includes(day)
        ? slots[idx].days.filter(d => d !== day)
        : [...slots[idx].days, day].sort((a, b) => a - b)
      slots[idx] = { ...slots[idx], days }
      return { ...prev, [locationId]: { ...prev[locationId], [type]: slots } }
    })
  }

  // ── Reservation auto-slot helpers ──────────────────────────────────
  function addReservationOperatingHour(locationId: string) {
    setReservationMap(prev => {
      const current = prev[locationId]
      const hours = [...(current.slotConfig?.operatingHours ?? []), { days: [1, 2, 3, 4, 5], open: '09:00', close: '22:00' }]
      return { ...prev, [locationId]: { ...current, slotConfig: { ...current.slotConfig!, operatingHours: hours } } }
    })
  }

  function removeReservationOperatingHour(locationId: string, idx: number) {
    setReservationMap(prev => {
      const current = prev[locationId]
      const hours = current.slotConfig!.operatingHours.filter((_, i) => i !== idx)
      return { ...prev, [locationId]: { ...current, slotConfig: { ...current.slotConfig!, operatingHours: hours } } }
    })
  }

  function updateReservationOperatingHour(locationId: string, idx: number, field: 'open' | 'close', value: string) {
    setReservationMap(prev => {
      const current = prev[locationId]
      const hours = [...current.slotConfig!.operatingHours]
      hours[idx] = { ...hours[idx], [field]: value }
      return { ...prev, [locationId]: { ...current, slotConfig: { ...current.slotConfig!, operatingHours: hours } } }
    })
  }

  function toggleReservationOperatingDay(locationId: string, idx: number, day: number) {
    setReservationMap(prev => {
      const current = prev[locationId]
      const hours = [...current.slotConfig!.operatingHours]
      const days = hours[idx].days.includes(day)
        ? hours[idx].days.filter(d => d !== day)
        : [...hours[idx].days, day].sort((a, b) => a - b)
      hours[idx] = { ...hours[idx], days }
      return { ...prev, [locationId]: { ...current, slotConfig: { ...current.slotConfig!, operatingHours: hours } } }
    })
  }

  const [logoSaving, setLogoSaving] = useState(false)
  const [fontUploading, setFontUploading] = useState<string | null>(null)

  async function handleLogoUpload(file: File | undefined) {
    if (!file) return
    setLogoSaving(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const uploadRes = await fetch(`/api/${tenantSlug}/upload`, { method: 'POST', body: formData })
      if (!uploadRes.ok) throw new Error()
      const { url } = await uploadRes.json()
      setBranding((p: any) => ({ ...p, logoUrl: url }))
      toast.success('Logo actualizado')
    } catch {
      toast.error('Error al subir el logo')
    } finally {
      setLogoSaving(false)
    }
  }

  async function handleFontUpload(roleKey: string, file: File | undefined) {
    if (!file) return
    setFontUploading(roleKey)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/${tenantSlug}/upload/font`, { method: 'POST', body: formData })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
      const { url, format } = await res.json()
      const newFonts = { ...branding.fonts }
      newFonts[roleKey] = {
        ...newFonts[roleKey],
        source: 'custom',
        family: '',
        weight: '',
        files: { ...newFonts[roleKey]?.files, [format]: url },
      }
      setBranding((p: any) => ({ ...p, fonts: newFonts }))
      toast.success(`Fuente ${format.toUpperCase()} subida`)
    } catch (err: any) {
      toast.error(err.message || 'Error al subir la fuente')
    } finally {
      setFontUploading(null)
    }
  }

  async function handleSaveBranding() {
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/settings/branding`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branding }),
      })
      if (!res.ok) throw new Error()
      toast.success('Cambios visuales guardados')
      router.refresh()
    } catch {
      toast.error('Error al guardar branding')
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveProfile() {
    setProfileLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/settings/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (data.profile) {
        setProfile(prev => ({
          ...prev,
          ...data.profile,
          social: { ...prev.social, ...data.profile.social },
          branding: { ...prev.branding, ...data.profile.branding },
        }))
      }
      toast.success('Información de perfil actualizada')
      router.refresh()
    } catch {
      toast.error('Error al guardar perfil')
    } finally {
      setProfileLoading(false)
    }
  }

  async function handleSaveHours(locationId: string) {
    setHoursLoading(locationId)
    try {
      const res = await fetch(`/api/${tenantSlug}/locations/${locationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours: hoursMap[locationId] }),
      })
      if (!res.ok) throw new Error()
      toast.success('Horarios para esta sede actualizados')
    } catch {
      toast.error('Error al guardar horarios')
    } finally {
      setHoursLoading(null)
    }
  }

  async function handleSaveMapsUrl(locationId: string) {
    setMapsUrlLoading(locationId)
    try {
      const res = await fetch(`/api/${tenantSlug}/locations/${locationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapsUrl: mapsUrlMap[locationId] }),
      })
      if (!res.ok) throw new Error()
      toast.success('Link de Google Maps guardado')
      router.refresh()
    } catch {
      toast.error('Error al guardar el link')
    } finally {
      setMapsUrlLoading(null)
    }
  }

  async function saveHeroToDB(locationId: string, hero: HeroConfig) {
    const res = await fetch(`/api/${tenantSlug}/locations/${locationId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hero }),
    })
    if (!res.ok) throw new Error()
  }

  async function handleHeroUpload(locationId: string, file: File | undefined) {
    if (!file) return
    const mediaType: HeroMediaType = file.type.startsWith('video/') ? 'video' : 'image'
    const currentShowLogo = heroMap[locationId]?.showLogo !== false
    setHeroSaving(locationId)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const uploadRes = await fetch(`/api/${tenantSlug}/upload`, { method: 'POST', body: formData })
      if (!uploadRes.ok) throw new Error()
      const { url } = await uploadRes.json()
      const newHero: HeroConfig = { mediaType, url, showLogo: currentShowLogo }
      await saveHeroToDB(locationId, newHero)
      setHeroMap(p => ({ ...p, [locationId]: newHero }))
      toast.success('Portada actualizada')
    } catch {
      toast.error('Error al subir la portada')
    } finally {
      setHeroSaving(null)
    }
  }

  async function handleHeroRemove(locationId: string) {
    setHeroSaving(locationId)
    try {
      const newHero: HeroConfig = { mediaType: 'none', url: '', showLogo: true }
      await saveHeroToDB(locationId, newHero)
      setHeroMap(p => ({ ...p, [locationId]: newHero }))
      toast.success('Portada eliminada')
    } catch {
      toast.error('Error al eliminar la portada')
    } finally {
      setHeroSaving(null)
    }
  }

  async function handleToggleShowLogo(locationId: string) {
    const current = heroMap[locationId]
    const updated: HeroConfig = { ...current, showLogo: !current.showLogo }
    try {
      await saveHeroToDB(locationId, updated)
      setHeroMap(p => ({ ...p, [locationId]: updated }))
      toast.success(updated.showLogo ? 'Logo activado en portada' : 'Logo ocultado en portada')
    } catch {
      toast.error('Error al guardar preferencia')
    }
  }

  const labelCls = "text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50 mb-2 block"
  const inputCls = "w-full bg-muted/40 border-2 border-border/60 focus:border-primary/40 focus:bg-white text-foreground text-sm font-medium rounded-2xl px-4 py-3 outline-none transition-all shadow-sm"

  if (!mounted) return <div className="max-w-6xl h-96 flex items-center justify-center"><Loader2 className="animate-spin text-primary/20" size={40} /></div>

  return (
    <div className="max-w-6xl">
      <Tabs defaultValue="branding" className="w-full" onValueChange={setActiveTab}>
        <div className="flex overflow-x-auto pb-4 mb-2 no-scrollbar">
          <TabsList className="bg-muted/50 border border-border/40 p-1.5 rounded-2xl h-auto gap-1">
            <TabTrigger value="branding" icon={<Palette size={16} />} label="Identidad" />
            <TabTrigger value="profile" icon={<User size={16} />} label="Perfil" />
            <TabTrigger value="locations" icon={<MapPin size={16} />} label="Sedes" />
            <TabTrigger value="general" icon={<SettingsIcon size={16} />} label="General" />
            <TabTrigger value="mercadopago" icon={<CreditCard size={16} />} label="Pagos" />
            <TabTrigger value="kripton" icon={<Coins size={16} />} label="Kripton" />
            <TabTrigger value="notifications" icon={<Bell size={16} />} label="Notificaciones" />
            {canAccess(plan as Plan, 'transferPayment') && (
              <TabTrigger value="transferencia" icon={<Banknote size={16} />} label="Transferencia" />
            )}
            <TabTrigger value="recargos" icon={<Percent size={16} />} label="Recargos" />
            {tenant.features?.reservations && (
              <TabTrigger value="reservas" icon={<CalendarDays size={16} />} label="Reservas" />
            )}
            {canAccess(plan as Plan, 'posIntegration') && (
              <TabTrigger value="pos" icon={<Database size={16} />} label="POS" />
            )}
          </TabsList>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="pt-4 pb-20"
          >
            {/* ── Identity ── */}
            <TabsContent value="branding" className="m-0 mt-2">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-12 items-start">
                <div className="space-y-8">
                  <section className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <Palette size={20} />
                      </div>
                      <h3 className="text-xl font-bold tracking-tight">Esquema de Colores</h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-muted/20 border border-border/40 p-8 rounded-[2.5rem]">
                      {[
                        { label: 'Acento Primario', key: 'primaryColor', desc: 'Botones y destacados' },
                        { label: 'Color de Fondo', key: 'backgroundColor', desc: 'Lienzo principal' },
                        { label: 'Cuerpo de Texto', key: 'textColor', desc: 'Legibilidad general' },
                        { label: 'Color Secundario', key: 'secondaryColor', desc: 'Elementos de apoyo' },
                      ].map(({ label, key, desc }) => (
                        <div key={key} className="space-y-2">
                          <label className={labelCls}>{label}</label>
                          <div className="flex items-center gap-4 bg-white p-3 rounded-2xl border-2 border-border/40 hover:border-primary/20 transition-all group">
                            <div className="relative w-12 h-12 shrink-0">
                              <input type="color" value={branding[key]}
                                onChange={e => setBranding((p: any) => ({ ...p, [key]: e.target.value }))}
                                className="absolute inset-0 w-full h-full rounded-xl border-none p-0 bg-transparent cursor-pointer opacity-0 z-10" />
                              <div className="w-full h-full rounded-xl border border-black/5 shadow-inner" style={{ backgroundColor: branding[key] }} />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-black tracking-tighter text-foreground tabular-nums uppercase">{branding[key]}</p>
                              <p className="text-[10px] text-muted-foreground font-bold">{desc}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <Smartphone size={20} />
                      </div>
                      <h3 className="text-xl font-bold tracking-tight">Interfaz del Menú</h3>
                    </div>

                    <div className="bg-muted/20 border border-border/40 p-8 rounded-[2.5rem] space-y-8">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                        <div>
                          <label className={labelCls}>Disposición de Items</label>
                          <div className="flex gap-2 p-1 bg-muted rounded-xl border border-border/40 w-fit">
                            {['grid', 'list'].map(layout => (
                              <button key={layout} onClick={() => setBranding((p: any) => ({ ...p, menuLayout: layout }))}
                                className={cn(
                                  "px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                                  branding.menuLayout === layout
                                    ? "bg-white text-foreground shadow-md"
                                    : "text-muted-foreground hover:text-foreground"
                                )}>
                                {layout === 'grid' ? 'Cuadrícula' : 'Lista'}
                              </button>
                            ))}
                          </div>
                          <div className="mt-4">
                            <label className={labelCls}>Aplicar a</label>
                            <div className="flex gap-2 p-1 bg-muted rounded-xl border border-border/40 w-fit mt-1.5">
                              {[
                                { v: 'takeaway' as const, l: '🚀 Takeaway' },
                                { v: 'dine-in' as const, l: '🍽️ Dine-in' },
                                { v: 'both' as const, l: 'Ambos' },
                              ].map(opt => (
                                <button key={opt.v} onClick={() => setBranding((p: any) => ({ ...p, menuLayoutApplyTo: opt.v }))}
                                  className={cn(
                                    "px-5 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                                    (branding.menuLayoutApplyTo || 'takeaway') === opt.v
                                      ? "bg-white text-foreground shadow-md"
                                      : "text-muted-foreground hover:text-foreground"
                                  )}>
                                  {opt.l}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className={labelCls}>Estilo de Bordes</label>
                          <div className="flex gap-2 p-1 bg-muted rounded-xl border border-border/40 w-fit">
                            {[{ v: 'sharp', l: 'Recto' }, { v: 'rounded', l: 'Suave' }, { v: 'pill', l: 'Cápsula' }].map(opt => (
                              <button key={opt.v} onClick={() => setBranding((p: any) => ({ ...p, borderRadius: opt.v }))}
                                className={cn(
                                  "px-5 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                                  branding.borderRadius === opt.v ? "bg-white text-foreground shadow-md" : "text-muted-foreground hover:text-foreground"
                                )}>
                                {opt.l}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    </section>

                    {/* ── Tipografía ── */}
                    <section className="space-y-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                          <span className="text-lg font-black">T</span>
                        </div>
                        <h3 className="text-xl font-bold tracking-tight">Tipografía</h3>
                      </div>

                      <div className="bg-muted/20 border border-border/40 p-6 rounded-[2.5rem] space-y-8">
                        {FONT_ROLES.map(role => {
                          const config = branding.fonts?.[role.key] || defaultFonts[role.key]
                          return (
                            <div key={role.key}>
                              <div className="flex items-center justify-between mb-3">
                                <div>
                                  <p className="text-sm font-bold">{role.label}</p>
                                  <p className="text-[10px] text-muted-foreground">{role.description}</p>
                                </div>
                                <span className="text-[9px] font-mono text-muted-foreground/40">{role.cssVar}</span>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {CURATED_FONTS.filter(f => f.source !== 'adobe' || process.env.NEXT_PUBLIC_ADOBE_FONTS_PROJECT_ID).map(font => (
                                  <button
                                    key={font.id}
                                    onClick={() => {
                                      const newFonts = { ...branding.fonts }
                                      newFonts[role.key] = { ...newFonts[role.key], source: font.source, family: font.id, weight: font.weight || '' }
                                      setBranding((p: any) => ({ ...p, fonts: newFonts }))
                                    }}
                                    className={cn(
                                      'px-3 py-2.5 rounded-xl border-2 text-left transition-all',
                                      config.source === 'google' && config.family === font.id
                                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                                        : 'border-border/60 hover:border-primary/30 hover:bg-muted/30',
                                    )}
                                  >
                                    <p className="text-sm font-bold truncate">{font.label}</p>
                                    <p className="text-[9px] text-muted-foreground/60 mt-0.5">{font.category} · {font.source}</p>
                                    <p className="text-[10px] mt-1 opacity-60 truncate" style={{ fontFamily: font.family }}>
                                      Aa Bb 123
                                    </p>
                                  </button>
                                ))}

                                {/* ── Custom upload ── */}
                                <div>
                                  {config.source === 'custom' && config.files?.woff2 ? (
                                    <div className="h-full px-3 py-2.5 rounded-xl border-2 border-primary bg-primary/5 ring-2 ring-primary/20 flex flex-col items-center justify-center text-center gap-1">
                                      <p className="text-[9px] font-bold text-primary uppercase tracking-wider">Subida</p>
                                      <p className="text-[8px] text-muted-foreground truncate max-w-full">{config.files.woff2.split('/').pop()}</p>
                                      <label className="text-[9px] text-primary underline cursor-pointer">
                                        {fontUploading === role.key ? 'Subiendo...' : 'Cambiar'}
                                        <input type="file" accept=".woff2,.woff,.ttf" hidden
                                          onChange={e => handleFontUpload(role.key, e.target.files?.[0])} />
                                      </label>
                                    </div>
                                  ) : (
                                    <label className={cn(
                                      'h-full px-3 py-2.5 rounded-xl border-2 border-dashed flex flex-col items-center justify-center text-center gap-1 cursor-pointer transition-all',
                                      config.source === 'custom' ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-primary/30 hover:bg-muted/30',
                                    )}>
                                      <span className="text-[18px] leading-none text-muted-foreground/60">+</span>
                                      <p className="text-[9px] font-bold text-muted-foreground/80">Personalizada</p>
                                      <p className="text-[7px] text-muted-foreground/40">WOFF2 · WOFF · TTF</p>
                                      <input type="file" accept=".woff2,.woff,.ttf" hidden
                                        onChange={e => handleFontUpload(role.key, e.target.files?.[0])} />
                                    </label>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </section>

                    <section className="space-y-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                          <ImageIcon size={20} />
                        </div>
                        <h3 className="text-xl font-bold tracking-tight">Logo</h3>
                      </div>

                      <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            id="logo-upload"
                            onChange={e => handleLogoUpload(e.target.files?.[0])}
                          />
                          <div
                            onClick={() => !logoSaving && document.getElementById('logo-upload')?.click()}
                            className={cn(
                              'w-full rounded-2xl border-2 border-dashed flex flex-col items-center justify-center transition-all relative overflow-hidden group cursor-pointer',
                              logoSaving
                                ? 'cursor-wait opacity-70'
                                : branding.logoUrl
                                  ? 'border-primary/40 bg-primary/5 h-40'
                                  : 'border-border hover:border-primary/40 hover:bg-muted/50 h-28'
                            )}
                          >
                            {logoSaving ? (
                              <div className="flex flex-col items-center gap-2 p-4">
                                <Loader2 size={22} className="animate-spin text-primary" />
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Subiendo…</p>
                              </div>
                            ) : branding.logoUrl ? (
                              <>
                                <img src={branding.logoUrl} alt="" className="h-full w-full object-contain p-4" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-2">
                                  <Camera className="text-white" size={20} />
                                  <span className="text-white text-[10px] font-black uppercase tracking-widest">Cambiar</span>
                                </div>
                              </>
                            ) : (
                              <div className="flex flex-col items-center gap-2 p-4">
                                <ImageIcon size={26} className="text-muted-foreground/40" />
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 text-center">Click para subir logo</p>
                                <p className="text-[9px] text-muted-foreground/40">PNG · JPG · WEBP</p>
                              </div>
                            )}
                          </div>
                  </section>

                  {/* ── Mejores Vendidos ─────────────────────────── */}
                  <section className="space-y-5 p-5 rounded-3xl border border-border bg-card">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-orange-100">
                        <span className="text-sm">🔥</span>
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Mejores Vendidos</p>
                        <p className="text-[10px] text-muted-foreground/60">Carrusel de los más pedidos según TIA</p>
                      </div>
                    </div>

                    {/* Toggle show/hide */}
                    <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-muted/10">
                      <div className="flex-1 min-w-0">
                        <Label className="text-xs font-bold text-foreground">Mostrar sección</Label>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Mostrar el carrusel de Los más vendidos en el menú
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={branding.bestSellers?.showSection !== false}
                        onClick={() => setBranding((p: any) => ({
                          ...p,
                          bestSellers: { ...p.bestSellers, showSection: !(p.bestSellers?.showSection !== false) },
                        }))}
                        className={cn(
                          'relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ml-3',
                          (branding.bestSellers?.showSection !== false) ? 'bg-primary' : 'bg-muted-foreground/30'
                        )}
                      >
                        <span
                          className={cn(
                            'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform',
                            (branding.bestSellers?.showSection !== false) && 'translate-x-4'
                          )}
                        />
                      </button>
                    </div>

                    {/* Section title */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-foreground">Título de la sección</Label>
                      <input
                        type="text"
                        value={branding.bestSellers?.sectionTitle ?? 'Los más vendidos'}
                        onChange={e => setBranding((p: any) => ({
                          ...p,
                          bestSellers: { ...p.bestSellers, sectionTitle: e.target.value },
                        }))}
                        placeholder="Los más vendidos"
                        className="flex h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                      />
                    </div>

                    {/* Section subtitle */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-foreground">Subtítulo (vacío = dinámico con sucursal)</Label>
                      <input
                        type="text"
                        value={branding.bestSellers?.sectionSubtitle ?? ''}
                        onChange={e => setBranding((p: any) => ({
                          ...p,
                          bestSellers: { ...p.bestSellers, sectionSubtitle: e.target.value },
                        }))}
                        placeholder="Lo que más están pidiendo"
                        className="flex h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                      />
                    </div>

                    {/* Colors */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold text-muted-foreground uppercase">Acento / Precio</Label>
                        <div className="flex items-center gap-2 px-3 h-11 rounded-xl border border-border bg-background">
                          <input
                            type="color"
                            value={branding.bestSellers?.accentColor || branding.primaryColor || '#f54500'}
                            onChange={e => setBranding((p: any) => ({
                              ...p,
                              bestSellers: { ...p.bestSellers, accentColor: e.target.value },
                            }))}
                            className="w-6 h-6 rounded cursor-pointer"
                          />
                          <span className="text-xs text-muted-foreground truncate">
                            {(branding.bestSellers?.accentColor || branding.primaryColor || '#f54500').slice(0, 7)}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold text-muted-foreground uppercase">Fondo Card</Label>
                        <div className="flex items-center gap-2 px-3 h-11 rounded-xl border border-border bg-background">
                          <input
                            type="color"
                            value={branding.bestSellers?.cardBgColor || '#ffffff'}
                            onChange={e => setBranding((p: any) => ({
                              ...p,
                              bestSellers: { ...p.bestSellers, cardBgColor: e.target.value },
                            }))}
                            className="w-6 h-6 rounded cursor-pointer"
                          />
                          <span className="text-xs text-muted-foreground truncate">
                            {(branding.bestSellers?.cardBgColor || '#ffffff').slice(0, 7)}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold text-muted-foreground uppercase">Badge</Label>
                        <div className="flex items-center gap-2 px-3 h-11 rounded-xl border border-border bg-background">
                          <input
                            type="color"
                            value={branding.bestSellers?.badgeBgColor || '#ef4444'}
                            onChange={e => setBranding((p: any) => ({
                              ...p,
                              bestSellers: { ...p.bestSellers, badgeBgColor: e.target.value },
                            }))}
                            className="w-6 h-6 rounded cursor-pointer"
                          />
                          <span className="text-xs text-muted-foreground truncate">
                            {(branding.bestSellers?.badgeBgColor || '#ef4444').slice(0, 7)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </section>

                  <div className="pt-4">
                    <Button onClick={handleSaveBranding} disabled={loading} className="bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest px-12 h-14 rounded-2xl shadow-xl shadow-primary/20 active:scale-95 transition-all">
                      {loading ? 'Sincronizando...' : 'Guardar Identidad'}
                    </Button>
                  </div>
                </div>

                {/* Mobile Preview Frame */}
                <div className="sticky top-8">
                  <div className="flex items-center justify-between mb-4 px-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60">Vista Previa en Vivo</p>
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <p className="text-[10px] font-bold text-emerald-600">Actualizado</p>
                    </div>
                  </div>

                  <div className="relative mx-auto border-[8px] border-zinc-900 rounded-[3.5rem] w-full max-w-[320px] h-[640px] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.3)] bg-zinc-950 overflow-hidden">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-zinc-900 rounded-b-3xl z-30" />

                    <div className="absolute inset-0 overflow-y-auto no-scrollbar pt-10 px-4" style={{ backgroundColor: branding.backgroundColor }}>
                      <div className="py-6 flex flex-col items-center gap-4">
                        {branding.logoUrl ? (
                          <img src={branding.logoUrl} alt="" className="h-14 object-contain" />
                        ) : (
                          <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center font-black text-2xl uppercase tracking-tighter" style={{ color: branding.primaryColor }}>
                            {tenant.name.slice(0, 1)}
                          </div>
                        )}
                        <h4 className="text-xl font-black text-center" style={{ color: branding.textColor }}>{tenant.name}</h4>
                      </div>

                      <div className="space-y-3 mt-4">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-4 rounded-full opacity-10" style={{ backgroundColor: branding.primaryColor }} />
                          <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full" style={{ backgroundColor: branding.primaryColor + '20', color: branding.primaryColor }}>
                            {(branding.menuLayoutApplyTo || 'takeaway') === 'both' ? 'Takeaway + Dine-in' :
                             (branding.menuLayoutApplyTo || 'takeaway') === 'takeaway' ? 'Solo Takeaway' : 'Solo Dine-in'}
                          </span>
                        </div>
                        <div className={`grid gap-3 ${branding.menuLayout === 'grid' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                          {[1, 2, 3, 4].map(i => (
                            <div key={i} className="bg-white/80 backdrop-blur-sm p-4 shadow-sm border" style={{
                              borderColor: branding.primaryColor + '15',
                              borderRadius: branding.borderRadius === 'pill' ? '24px' : branding.borderRadius === 'rounded' ? '16px' : '2px',
                            }}>
                              <div className="aspect-square bg-muted rounded-lg mb-3" />
                              <div className="w-full h-2.5 bg-zinc-400/20 rounded-full mb-2" />
                              <div className="w-2/3 h-2 bg-zinc-400/10 rounded-full" />
                              <div className="mt-4 flex items-center justify-between">
                                <div className="h-4 w-12 rounded-full" style={{ backgroundColor: branding.primaryColor + '20' }} />
                                <div className="h-6 w-6 rounded-full" style={{ backgroundColor: branding.primaryColor }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="h-20" />
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ── Profile ── */}
            <TabsContent value="profile" className="m-0 mt-2">
              <div className="max-w-3xl space-y-10">
                <section className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                      <Eye size={20} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold tracking-tight">Textos del Menú</h3>
                      <p className="text-xs text-muted-foreground font-medium">Personaliza el contenido narrativo de tu plataforma.</p>
                    </div>
                  </div>

                  <div className="space-y-6 bg-muted/20 border border-border/40 p-8 rounded-[2.5rem]">
                    <div>
                      <label className={labelCls}>Eslogan de la Carta</label>
                      <p className="text-[10px] text-muted-foreground mb-3 font-medium">Aparece debajo del título principal en el menú.</p>
                      <textarea rows={2} value={profile.menuDescription}
                        onChange={e => setProfile(p => ({ ...p, menuDescription: e.target.value }))}
                        placeholder="Ej: Sabores que cuentan historias, ingredientes que inspiran..."
                        className={cn(inputCls, "resize-none h-24")} />
                    </div>

                    <div>
                      <label className={labelCls}>Historias y Valores</label>
                      <p className="text-[10px] text-muted-foreground mb-3 font-medium">Se visualiza en la sección informativa del footer.</p>
                      <textarea rows={4} value={profile.about}
                        onChange={e => setProfile(p => ({ ...p, about: e.target.value }))}
                        placeholder="Nuestra misión es llevar la alta cocina a la comodidad de tu hogar..."
                        className={cn(inputCls, "resize-none h-40")} />
                    </div>
                  </div>
                </section>

                <section className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                      <Globe size={20} />
                    </div>
                    <h3 className="text-xl font-bold tracking-tight">Presencia Digital</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-muted/20 border border-border/40 p-8 rounded-[2.5rem]">
                    {[
                      { key: 'instagram', label: 'Instagram', icon: <Instagram size={14} />, placeholder: 'mirestaurante' },
                      { key: 'facebook', label: 'Facebook', icon: <Facebook size={14} />, placeholder: 'face.com/mie' },
                      { key: 'twitter', label: 'X (Twitter)', icon: <Twitter size={14} />, placeholder: '@mirestaurante' },
                    ].map(({ key, label, icon, placeholder }) => (
                      <div key={key} className="space-y-2">
                        <label className={labelCls}>{label}</label>
                        <div className="relative group">
                          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/40 group-focus-within:text-primary transition-colors">
                            {icon}
                          </div>
                          <input
                            value={profile.social[key as keyof typeof profile.social]}
                            onChange={e => setProfile(p => ({ ...p, social: { ...p.social, [key]: e.target.value } }))}
                            placeholder={placeholder}
                            className={cn(inputCls, "pl-11")}
                          />
                        </div>
                      </div>
                    ))}
                    <div className="space-y-2 md:col-span-2">
                      <label className={labelCls}>Behance</label>
                      <div className="relative group">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/40 group-focus-within:text-primary transition-colors">
                          <ExternalLink size={14} />
                        </div>
                        <input
                          value={profile.branding?.behance ?? ''}
                          onChange={e => setProfile(p => ({ ...p, branding: { ...p.branding, behance: e.target.value } }))}
                          placeholder="behance.net/miusuario"
                          className={cn(inputCls, "pl-11")}
                        />
                      </div>
                    </div>
                  </div>
                </section>

                <Button onClick={handleSaveProfile} disabled={profileLoading} className="bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest px-12 h-14 rounded-2xl shadow-xl shadow-primary/20 transition-all active:scale-95">
                  {profileLoading ? 'Guardando...' : 'Actualizar Perfil'}
                </Button>
              </div>
            </TabsContent>

            {/* ── Locations ── */}
            <TabsContent value="locations" className="m-0 mt-2">
              {plan === 'try' && (
                <div className="flex items-start gap-3 px-5 py-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 text-amber-600 mb-6 text-sm">
                  <span className="font-bold">Plan Inicial:</span>
                  <span>incluye 1 sede. Actualizá a <strong>Crecimiento</strong> para agregar múltiples ubicaciones.</span>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {locations.length === 0 ? (
                  <Card className="border-2 border-dashed border-border/60 bg-muted/10 rounded-[2.5rem] col-span-2">
                    <CardContent className="py-24 text-center">
                      <p className="text-muted-foreground font-bold">No hay sedes configuradas</p>
                    </CardContent>
                  </Card>
                ) : (
                  locations.map((loc: any) => (
                    <Card key={loc._id} className="bg-card border-2 border-border/60 rounded-[2.5rem] overflow-hidden group hover:border-primary/30 transition-all shadow-md">
                      <CardHeader className="p-8 pb-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-muted group-hover:bg-primary/10 flex items-center justify-center text-muted-foreground group-hover:text-primary transition-colors">
                              <MapPin size={24} />
                            </div>
                            <div>
                              <CardTitle className="text-xl font-bold tracking-tight">{loc.name}</CardTitle>
                              <p className="text-xs text-muted-foreground font-medium mt-1">{loc.address}</p>
                            </div>
                          </div>
                          <Badge variant="outline" className="bg-muted px-3 border-border/60 font-black text-[9px] uppercase tracking-widest">
                            {loc.settings?.orderModes?.length || 0} Modos
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="p-8 pt-4 space-y-6">
                        <div className="p-5 bg-muted/30 border-border/40 border rounded-2xl">
                          <div className="flex items-center gap-2 mb-3">
                            <Clock size={12} className="text-primary" />
                            <label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 leading-none">Horarios de Atención</label>
                          </div>
                          <input
                            value={hoursMap[loc._id] ?? ''}
                            onChange={e => setHoursMap(p => ({ ...p, [loc._id]: e.target.value }))}
                            placeholder="Lun - Dom: 12:00 pm - 11:00 pm"
                            className={cn(inputCls, "bg-white border-none shadow-inner h-11 h-12")}
                          />
                        </div>
                        <Button
                          className="w-full bg-zinc-900 border-zinc-800 text-white font-bold h-12 rounded-xl active:scale-95 transition-all shadow-lg"
                          onClick={() => handleSaveHours(loc._id)}
                          disabled={hoursLoading === loc._id}>
                          {hoursLoading === loc._id ? 'Sincronizando...' : 'Guardar Horarios'}
                        </Button>

                        {/* ── Google Maps URL ── */}
                        <div className="p-5 bg-muted/30 border-border/40 border rounded-2xl">
                          <div className="flex items-center gap-2 mb-3">
                            <MapPin size={12} className="text-primary" />
                            <label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 leading-none">Link Google Maps</label>
                          </div>
                          <input
                            value={mapsUrlMap[loc._id] ?? ''}
                            onChange={e => setMapsUrlMap(p => ({ ...p, [loc._id]: e.target.value }))}
                            placeholder="https://maps.google.com/..."
                            className={cn(inputCls, "bg-white border-none shadow-inner h-11 h-12")}
                          />
                          <Button
                            className="w-full mt-3 bg-zinc-900 border-zinc-800 text-white font-bold h-10 rounded-xl active:scale-95 transition-all shadow-lg"
                            onClick={() => handleSaveMapsUrl(loc._id)}
                            disabled={mapsUrlLoading === loc._id}>
                            {mapsUrlLoading === loc._id ? 'Guardando...' : 'Guardar Link'}
                          </Button>
                        </div>

                        {/* ── Hero media ── */}
                        <div className="p-5 bg-muted/30 border-border/40 border rounded-2xl space-y-3 mt-2">
                          <div className="flex items-center gap-2">
                            <Film size={12} className="text-primary" />
                            <label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 leading-none">
                              Portada del Menú
                            </label>
                          </div>

                          {/* Hidden file input */}
                          <input
                            type="file"
                            accept="image/*,video/*"
                            className="hidden"
                            id={`hero-upload-${loc._id}`}
                            onChange={e => handleHeroUpload(loc._id, e.target.files?.[0])}
                          />

                          {/* Upload / preview zone */}
                          <div
                            onClick={() => !heroSaving && document.getElementById(`hero-upload-${loc._id}`)?.click()}
                            className={cn(
                              'w-full rounded-2xl border-2 border-dashed flex flex-col items-center justify-center transition-all relative overflow-hidden group bg-muted/10',
                              heroSaving === loc._id
                                ? 'cursor-wait opacity-70'
                                : 'cursor-pointer',
                              heroMap[loc._id]?.url
                                ? 'border-primary/40 bg-primary/5 min-h-[160px] max-h-[320px] w-full'
                                : 'border-border hover:border-primary/40 hover:bg-muted/50 h-28'
                            )}
                          >
                            {heroSaving === loc._id ? (
                              <div className="flex flex-col items-center gap-2 p-4">
                                <Loader2 size={22} className="animate-spin text-primary" />
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                  Subiendo…
                                </p>
                              </div>
                            ) : heroMap[loc._id]?.url ? (
                              <>
                                {heroMap[loc._id].mediaType === 'video' ? (
                                  <video
                                    src={heroMap[loc._id].url}
                                    className="max-h-[320px] w-auto object-contain rounded-xl mx-auto p-2"
                                    autoPlay
                                    muted
                                    loop
                                    playsInline
                                  />
                                ) : (
                                  <img
                                    src={heroMap[loc._id].url}
                                    alt=""
                                    className="max-h-[320px] w-auto object-contain rounded-xl mx-auto p-2"
                                  />
                                )}
                                {/* Hover overlay */}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-2">
                                  <Camera className="text-white" size={20} />
                                  <span className="text-white text-[10px] font-black uppercase tracking-widest">
                                    Cambiar
                                  </span>
                                </div>
                              </>
                            ) : (
                              <div className="flex flex-col items-center gap-2 p-4">
                                <Film size={26} className="text-muted-foreground/40" />
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 text-center">
                                  Click para subir imagen o video
                                </p>
                                <p className="text-[9px] text-muted-foreground/40">
                                  JPG · PNG · MP4 · MOV
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Toggle mostrar logo */}
                          {heroMap[loc._id]?.url && (
                            <div className="flex items-center justify-between px-1">
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                                  Mostrar logo en portada
                                </p>
                                <p className="text-[9px] text-muted-foreground/40 mt-0.5">
                                  Solo aplica al menú de salón
                                </p>
                              </div>
                              <button
                                onClick={() => handleToggleShowLogo(loc._id)}
                                className={cn(
                                  'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                                  heroMap[loc._id]?.showLogo !== false ? 'bg-primary' : 'bg-muted-foreground/30'
                                )}
                              >
                                <span
                                  className={cn(
                                    'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform duration-200',
                                    heroMap[loc._id]?.showLogo !== false ? 'translate-x-5' : 'translate-x-0'
                                  )}
                                />
                              </button>
                            </div>
                          )}

                          {/* Remove button */}
                          {heroMap[loc._id]?.url && (
                            <Button
                              variant="ghost"
                              className="w-full text-destructive hover:bg-destructive/5 text-[10px] font-bold uppercase tracking-widest h-8"
                              disabled={heroSaving === loc._id}
                              onClick={() => handleHeroRemove(loc._id)}
                            >
                              Eliminar portada
                            </Button>
                          )}
                        </div>

                        {/* ── Service Hours ── */}
                        <div className="p-5 bg-muted/30 border-border/40 border rounded-2xl space-y-4">
                          <div className="flex items-center gap-2 mb-1">
                            <Clock size={12} className="text-primary" />
                            <label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 leading-none">
                              Horarios de servicio
                            </label>
                          </div>
                          <p className="text-[10px] text-muted-foreground/50">Configurá cuándo acepta pedidos cada canal. Si no hay franjas, se asume siempre abierto.</p>

                          {(['takeaway', 'dineIn', 'delivery'] as const).map(svcType => (
                            <div key={svcType} className="space-y-2">
                              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                                {svcType === 'takeaway' ? '🥡 Takeaway' : svcType === 'dineIn' ? '🍽️ Salón' : '🚚 Delivery'}
                              </p>
                              {(serviceHoursMap[loc._id]?.[svcType] ?? []).map((slot, idx) => (
                                <div key={idx} className="flex flex-col gap-2 p-3 bg-white rounded-xl border border-border/60 shadow-sm">
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((d, di) => (
                                      <button
                                        key={di}
                                        type="button"
                                        onClick={() => toggleServiceDay(loc._id, svcType, idx, di)}
                                        className={cn(
                                          'w-9 h-7 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all',
                                          slot.days.includes(di)
                                            ? 'bg-primary text-white shadow-sm'
                                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                        )}
                                      >
                                        {d}
                                      </button>
                                    ))}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="time"
                                      value={slot.open}
                                      onChange={e => updateServiceSlot(loc._id, svcType, idx, 'open', e.target.value)}
                                      className="flex-1 bg-muted/40 border border-border/60 focus:border-primary/40 text-foreground text-xs font-medium rounded-xl px-3 py-1.5 outline-none transition-all"
                                    />
                                    <span className="text-muted-foreground text-xs font-bold">—</span>
                                    <input
                                      type="time"
                                      value={slot.close}
                                      onChange={e => updateServiceSlot(loc._id, svcType, idx, 'close', e.target.value)}
                                      className="flex-1 bg-muted/40 border border-border/60 focus:border-primary/40 text-foreground text-xs font-medium rounded-xl px-3 py-1.5 outline-none transition-all"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => removeServiceSlot(loc._id, svcType, idx)}
                                      className="h-8 w-8 flex items-center justify-center rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all shrink-0"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                              <div className="flex items-center gap-2 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => addServiceSlot(loc._id, svcType)}
                                  className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary/80 transition-colors px-1 py-1"
                                >
                                  <Plus size={13} strokeWidth={3} />
                                  Agregar franja
                                </button>
                                <span className="text-[9px] text-muted-foreground/50 italic">
                                  ¿Dos turnos el mismo día? Agregá una franja por cada uno
                                </span>
                              </div>
                            </div>
                          ))}

                          <Button
                            className="w-full bg-zinc-900 border-zinc-800 text-white font-bold h-10 rounded-xl active:scale-95 transition-all shadow-lg text-xs mt-2"
                            onClick={() => handleSaveServiceHours(loc._id)}
                            disabled={serviceHoursSaving === loc._id}
                          >
                            {serviceHoursSaving === loc._id ? 'Guardando...' : 'Guardar horarios de servicio'}
                          </Button>
                        </div>

                        {/* ── Scheduled Orders config ── */}
                        <div className="p-5 bg-muted/30 border-border/40 border rounded-2xl space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Clock size={12} className="text-primary" />
                              <label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 leading-none">
                                Pedidos Programados
                              </label>
                            </div>
                            <button
                              type="button"
                              onClick={() => setScheduledOrdersMap(prev => ({
                                ...prev,
                                [loc._id]: { ...prev[loc._id], enabled: !(prev[loc._id]?.enabled ?? false) }
                              }))}
                              className={cn(
                                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                                scheduledOrdersMap[loc._id]?.enabled ? 'bg-primary' : 'bg-muted-foreground/30'
                              )}
                            >
                              <span className={cn(
                                'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform duration-200',
                                scheduledOrdersMap[loc._id]?.enabled ? 'translate-x-5' : 'translate-x-0'
                              )} />
                            </button>
                          </div>

                          {scheduledOrdersMap[loc._id]?.enabled && (
                            <div className="space-y-4 pt-2">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/50 mb-1.5 block">
                                    Anticipación mín. (min)
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={scheduledOrdersMap[loc._id]?.minAdvanceMinutes ?? 30}
                                    onChange={e => setScheduledOrdersMap(prev => ({
                                      ...prev,
                                      [loc._id]: { ...prev[loc._id], minAdvanceMinutes: Number(e.target.value) }
                                    }))}
                                    className={cn(inputCls, "bg-white border-none shadow-inner h-10 text-center")}
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/50 mb-1.5 block">
                                    Anticipación máx. (hs)
                                  </label>
                                  <input
                                    type="number"
                                    min={1}
                                    value={scheduledOrdersMap[loc._id]?.maxAdvanceHours ?? 24}
                                    onChange={e => setScheduledOrdersMap(prev => ({
                                      ...prev,
                                      [loc._id]: { ...prev[loc._id], maxAdvanceHours: Number(e.target.value) }
                                    }))}
                                    className={cn(inputCls, "bg-white border-none shadow-inner h-10 text-center")}
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/50 mb-1.5 block">
                                    Duración franja (min)
                                  </label>
                                  <select
                                    value={scheduledOrdersMap[loc._id]?.slotDurationMinutes ?? 15}
                                    onChange={e => setScheduledOrdersMap(prev => ({
                                      ...prev,
                                      [loc._id]: { ...prev[loc._id], slotDurationMinutes: Number(e.target.value) }
                                    }))}
                                    className={cn(inputCls, "bg-white border-none shadow-inner h-10 text-center appearance-none")}
                                  >
                                    <option value={15}>15 min</option>
                                    <option value={20}>20 min</option>
                                    <option value={30}>30 min</option>
                                    <option value={60}>1 hora</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/50 mb-1.5 block">
                                    Pedidos por franja
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={scheduledOrdersMap[loc._id]?.maxOrdersPerSlot ?? 10}
                                    onChange={e => setScheduledOrdersMap(prev => ({
                                      ...prev,
                                      [loc._id]: { ...prev[loc._id], maxOrdersPerSlot: Number(e.target.value) }
                                    }))}
                                    className={cn(inputCls, "bg-white border-none shadow-inner h-10 text-center")}
                                  />
                                  <p className="text-[8px] text-muted-foreground/40 mt-1 text-center">0 = sin límite</p>
                                </div>
                              </div>
                            </div>
                          )}

                          <Button
                            className="w-full bg-zinc-900 text-white font-bold h-10 rounded-xl active:scale-95 transition-all shadow-lg text-xs"
                            onClick={() => handleSaveScheduledOrdersConfig(loc._id)}
                            disabled={scheduledOrdersSaving === loc._id}
                          >
                            {scheduledOrdersSaving === loc._id ? 'Guardando...' : 'Guardar configuración programados'}
                          </Button>
                        </div>

                        {/* ── Reservation config ── */}
                        {tenant.features?.reservations && (
                          <div className="p-5 bg-muted/30 border-border/40 border rounded-2xl space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <CalendarDays size={12} className="text-primary" />
                                <label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 leading-none">
                                  Configuración de Reservas
                                </label>
                              </div>
                              <button
                                type="button"
                                onClick={() => setReservationMap(prev => ({
                                  ...prev,
                                  [loc._id]: { ...prev[loc._id], enabled: !(prev[loc._id]?.enabled ?? false) }
                                }))}
                                className={cn(
                                  'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                                  reservationMap[loc._id]?.enabled ? 'bg-primary' : 'bg-muted-foreground/30'
                                )}
                              >
                                <span className={cn(
                                  'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform duration-200',
                                  reservationMap[loc._id]?.enabled ? 'translate-x-5' : 'translate-x-0'
                                )} />
                              </button>
                            </div>

                            {reservationMap[loc._id]?.enabled && (
                              <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/50 mb-1.5 block">
                                      Pago mínimo ($)
                                    </label>
                                    <input
                                      type="number"
                                      min={0}
                                      value={reservationMap[loc._id]?.minPayment ?? 0}
                                      onChange={e => setReservationMap(prev => ({
                                        ...prev,
                                        [loc._id]: { ...prev[loc._id], minPayment: Number(e.target.value) }
                                      }))}
                                      className={cn(inputCls, "bg-white border-none shadow-inner h-10 text-center")}
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/50 mb-1.5 block">
                                      Personas (máx.)
                                    </label>
                                    <input
                                      type="number"
                                      min={1}
                                      max={30}
                                      value={reservationMap[loc._id]?.maxPartySize ?? 10}
                                      onChange={e => setReservationMap(prev => ({
                                        ...prev,
                                        [loc._id]: { ...prev[loc._id], maxPartySize: Number(e.target.value) }
                                      }))}
                                      className={cn(inputCls, "bg-white border-none shadow-inner h-10 text-center")}
                                    />
                                  </div>
                                </div>

                                <div>
                                  <label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/50 mb-2 block">
                                    Horarios disponibles
                                  </label>
                                  <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
                                    {(reservationMap[loc._id]?.timeSlots || []).map(slot => (
                                      <span
                                        key={slot}
                                        className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20"
                                      >
                                        {slot}
                                        <button
                                          type="button"
                                          onClick={() => removeSlot(loc._id, slot)}
                                          className="text-primary/60 hover:text-red-500 transition-colors"
                                        >
                                          <X size={11} />
                                        </button>
                                      </span>
                                    ))}
                                    {(reservationMap[loc._id]?.timeSlots || []).length === 0 && (
                                      <span className="text-[10px] text-muted-foreground/40 font-medium">Sin horarios configurados</span>
                                    )}
                                  </div>
                                  <div className="flex gap-2">
                                    <input
                                      type="time"
                                      value={newSlotMap[loc._id] || ''}
                                      onChange={e => setNewSlotMap(prev => ({ ...prev, [loc._id]: e.target.value }))}
                                      className={cn(inputCls, "bg-white border-none shadow-inner h-9 flex-1 text-sm")}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => addSlot(loc._id)}
                                      className="flex items-center gap-1 px-3 h-9 rounded-xl bg-primary text-white text-xs font-black hover:bg-primary/90 transition-colors active:scale-95 shrink-0"
                                    >
                                      <Plus size={13} /> Agregar
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}

                            <Button
                              className="w-full bg-zinc-900 text-white font-bold h-10 rounded-xl active:scale-95 transition-all shadow-lg text-xs"
                              onClick={() => handleSaveReservationConfig(loc._id)}
                              disabled={reservationSaving === loc._id}
                            >
                              {reservationSaving === loc._id ? 'Guardando...' : 'Guardar configuración de reservas'}
                            </Button>
                          </div>
                        )}

                        {/* ── Delivery Config ── */}
                        {canAccess(plan as Plan, 'delivery') && (
                          <DeliveryConfigSection
                            locationId={loc._id}
                            tenantSlug={tenantSlug}
                            initialConfig={loc.deliveryConfig || { enabled: false, ranges: [], maxRangeKm: 0 }}
                          />
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>

            {/* ── General Info ── */}
            <TabsContent value="general" className="m-0 mt-2">
              <Card className="bg-muted/20 border-border/40 border-[3px] rounded-[3rem] p-10 max-w-2xl">
                <div className="space-y-8">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-14 h-14 rounded-3xl bg-primary flex items-center justify-center text-white shadow-xl shadow-primary/30">
                      <SettingsIcon size={28} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black tracking-tighter">Información del Sistema</h3>
                      <p className="text-sm text-muted-foreground font-medium">Datos estáticos del restaurante y plan actual.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-6">
                    {[
                      { l: 'Nombre del Restaurante', v: tenant.name, icon: <ShoppingBag size={14} /> },
                      { l: 'Identificador único (Slug)', v: tenant.slug, icon: <Globe size={14} />, mono: true },
                      { l: 'Plan de Suscripción', v: tenant.plan, icon: <CreditCard size={14} />, badge: true },
                    ].map((item, i) => (
                      <div key={i} className="group">
                        <label className={labelCls}>{item.l}</label>
                        <div className="flex items-center gap-4 p-5 bg-white border-2 border-border/80 rounded-2xl shadow-sm group-hover:border-primary/20 transition-all">
                          <div className="text-muted-foreground/30">{item.icon}</div>
                          <span className={cn(
                            "text-base font-bold text-foreground flex-1",
                            item.mono && "font-mono text-sm tracking-tight bg-muted/50 px-2 py-0.5 rounded-lg w-fit",
                            item.badge && "capitalize"
                          )}>{item.v}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-4 p-6 bg-primary/5 rounded-3xl border border-primary/10">
                    <AlertCircle className="text-primary shrink-0 mt-0.5" size={18} />
                    <p className="text-xs text-primary/80 font-medium leading-relaxed">
                      Para modificar estos datos críticos, por favor ponte en contacto con nuestro equipo de soporte técnico.
                    </p>
                  </div>
                </div>
              </Card>
            </TabsContent>

            {/* ── MercadoPago ── */}
            <TabsContent value="mercadopago" className="m-0 mt-2">
              <div className="max-w-3xl">
                <MercadoPagoSettings
                  tenantSlug={tenantSlug}
                  isConfigured={tenant.mercadopago?.isConfigured}
                  mpOAuth={tenant.mpOAuth}
                />
              </div>
            </TabsContent>

            {/* ── Kripton ── */}
            <TabsContent value="kripton" className="m-0 mt-2">
              <div className="max-w-3xl">
                <KriptonSettings
                  tenantSlug={tenantSlug}
                  isConfigured={tenant.kripton?.isConfigured ?? false}
                />
              </div>
            </TabsContent>

            {/* ── Notificaciones WhatsApp ── */}
            <TabsContent value="notifications" className="m-0 mt-2">
              <Card className="bg-muted/20 border-border/40 border-[3px] rounded-[3rem] p-10 max-w-2xl">
                <div className="space-y-8">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-14 h-14 rounded-3xl bg-primary flex items-center justify-center text-white shadow-xl shadow-primary/30">
                      <Bell size={28} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black tracking-tighter">Notificaciones WhatsApp</h3>
                      <p className="text-sm text-muted-foreground font-medium">Recibí alertas en tu WhatsApp cuando lleguen nuevos pedidos o reservas.</p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <label className={labelCls}>Número de WhatsApp</label>
                      <input
                        type="text"
                        placeholder="+5491123456789"
                        value={notifPhone}
                        onChange={e => setNotifPhone(e.target.value)}
                        className="w-full bg-white border-2 border-border/60 focus:border-primary/40 text-foreground text-sm font-medium rounded-2xl px-4 py-3 outline-none transition-all shadow-sm"
                      />
                      <p className="text-[10px] text-muted-foreground/50 font-medium mt-1.5">Formato internacional: +54 seguido del número sin 15 (ej: +5491123456789)</p>
                    </div>

                    <div className="space-y-4">
                      <label className={labelCls}>Notificaciones</label>
                      <div className="flex items-center justify-between p-4 bg-white rounded-2xl border-2 border-border/60">
                        <div>
                          <p className="text-sm font-bold text-foreground">Nuevo pedido</p>
                          <p className="text-[11px] text-muted-foreground">Cuando se cree un pedido takeaway o business</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setNotifyOrder(!notifyOrder)}
                          className={cn(
                            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                            notifyOrder ? 'bg-primary' : 'bg-muted-foreground/30'
                          )}
                        >
                          <span className={cn(
                            'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform duration-200',
                            notifyOrder ? 'translate-x-5' : 'translate-x-0'
                          )} />
                        </button>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-white rounded-2xl border-2 border-border/60">
                        <div>
                          <p className="text-sm font-bold text-foreground">Nueva reserva</p>
                          <p className="text-[11px] text-muted-foreground">Cuando se cree una reserva (gratuita o paga)</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setNotifyReservation(!notifyReservation)}
                          className={cn(
                            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                            notifyReservation ? 'bg-primary' : 'bg-muted-foreground/30'
                          )}
                        >
                          <span className={cn(
                            'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform duration-200',
                            notifyReservation ? 'translate-x-5' : 'translate-x-0'
                          )} />
                        </button>
                      </div>
                    </div>

                    <Button
                      className="w-full bg-zinc-900 text-white font-bold h-12 rounded-xl active:scale-95 transition-all shadow-lg text-sm"
                      onClick={handleSaveNotifications}
                      disabled={notifSaving}
                    >
                      {notifSaving ? 'Guardando...' : 'Guardar configuración'}
                    </Button>
                  </div>
                </div>
              </Card>
            </TabsContent>

            {/* ── Transferencia ── */}
            {canAccess(plan as Plan, 'transferPayment') && (
              <TabsContent value="transferencia" className="m-0 mt-2">
                <div className="max-w-3xl">
                  <TransferSettings
                    tenantSlug={tenantSlug}
                    initialConfig={tenant.transfer}
                  />
                </div>
              </TabsContent>
            )}

            {/* ── Recargos ── */}
            <TabsContent value="recargos" className="m-0 mt-2">
              <div className="max-w-3xl">
                <PaymentSurchargeSettings
                  tenantSlug={tenantSlug}
                  initialSurcharges={tenant.paymentSurcharges}
                />
              </div>
            </TabsContent>

            {/* ── Reservas ── */}
            {tenant.features?.reservations && (
              <TabsContent value="reservas" className="m-0 mt-2">
                <div className="max-w-3xl space-y-6">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                      <CalendarDays size={20} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold tracking-tight">Configuración de Reservas</h3>
                      <p className="text-xs text-muted-foreground font-medium">Configurá los horarios y condiciones por sede.</p>
                    </div>
                  </div>

                  {locations.length === 0 ? (
                    <Card className="border-2 border-dashed border-border/60 bg-muted/10 rounded-[2.5rem]">
                      <CardContent className="py-16 text-center">
                        <p className="text-muted-foreground font-bold">No hay sedes configuradas</p>
                      </CardContent>
                    </Card>
                  ) : (
                    locations.map((loc: any) => (
                      <Card key={loc._id} className="bg-card border-2 border-border/60 rounded-[2rem] overflow-hidden">
                        <CardHeader className="p-6 pb-0">
                          <div className="flex items-center justify-between">
                            <div>
                              <CardTitle className="text-base font-bold">{loc.name}</CardTitle>
                              <p className="text-xs text-muted-foreground mt-0.5">{loc.address}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setReservationMap(prev => ({
                                ...prev,
                                [loc._id]: { ...prev[loc._id], enabled: !(prev[loc._id]?.enabled ?? false) }
                              }))}
                              className={cn(
                                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                                reservationMap[loc._id]?.enabled ? 'bg-primary' : 'bg-muted-foreground/30'
                              )}
                            >
                              <span className={cn(
                                'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform duration-200',
                                reservationMap[loc._id]?.enabled ? 'translate-x-5' : 'translate-x-0'
                              )} />
                            </button>
                          </div>
                        </CardHeader>
                        <CardContent className="p-6 space-y-5">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className={labelCls}>Pago mínimo ($)</label>
                              <input
                                type="number"
                                min={0}
                                value={reservationMap[loc._id]?.minPayment ?? 0}
                                onChange={e => setReservationMap(prev => ({
                                  ...prev,
                                  [loc._id]: { ...prev[loc._id], minPayment: Number(e.target.value) }
                                }))}
                                className={cn(inputCls, "text-center")}
                              />
                            </div>
                            <div>
                              <label className={labelCls}>Personas (máx.)</label>
                              <input
                                type="number"
                                min={1}
                                max={30}
                                value={reservationMap[loc._id]?.maxPartySize ?? 10}
                                onChange={e => setReservationMap(prev => ({
                                  ...prev,
                                  [loc._id]: { ...prev[loc._id], maxPartySize: Number(e.target.value) }
                                }))}
                                className={cn(inputCls, "text-center")}
                              />
                            </div>
                          </div>

                          {/* ── Toggle: Manual vs Automático ── */}
                          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-2xl border border-border/40">
                            <div className="flex items-center gap-2">
                              <Clock size={14} className="text-muted-foreground" />
                              <span className="text-xs font-bold text-muted-foreground">Generación automática</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setReservationMap(prev => {
                                const current = prev[loc._id]
                                const wasAuto = current.slotConfig?.enabled ?? false
                                return {
                                  ...prev,
                                  [loc._id]: {
                                    ...current,
                                    slotConfig: { ...current.slotConfig!, enabled: !wasAuto },
                                  },
                                }
                              })}
                              className={cn(
                                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                                reservationMap[loc._id]?.slotConfig?.enabled ? 'bg-primary' : 'bg-muted-foreground/30'
                              )}
                            >
                              <span className={cn(
                                'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform duration-200',
                                reservationMap[loc._id]?.slotConfig?.enabled ? 'translate-x-5' : 'translate-x-0'
                              )} />
                            </button>
                          </div>

                          {reservationMap[loc._id]?.slotConfig?.enabled ? (
                            /* ── Modo automático: operating hours + configuración ── */
                            <div className="space-y-4">
                              <div>
                                <label className={labelCls}>Horarios operativos</label>
                                {(reservationMap[loc._id]?.slotConfig?.operatingHours ?? []).map((oh, idx) => (
                                  <div key={idx} className="flex flex-col gap-2 p-3 bg-white rounded-xl border border-border/60 shadow-sm mb-2">
                                    <div className="flex items-center gap-1 flex-wrap">
                                      {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((d, di) => (
                                        <button
                                          key={di}
                                          type="button"
                                          onClick={() => toggleReservationOperatingDay(loc._id, idx, di)}
                                          className={cn(
                                            'w-9 h-7 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all',
                                            oh.days.includes(di)
                                              ? 'bg-primary text-white shadow-sm'
                                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                          )}
                                        >
                                          {d}
                                        </button>
                                      ))}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="time"
                                        value={oh.open}
                                        onChange={e => updateReservationOperatingHour(loc._id, idx, 'open', e.target.value)}
                                        className="flex-1 bg-muted/40 border border-border/60 focus:border-primary/40 text-foreground text-xs font-medium rounded-xl px-3 py-1.5 outline-none transition-all"
                                      />
                                      <span className="text-muted-foreground text-xs font-bold">—</span>
                                      <input
                                        type="time"
                                        value={oh.close}
                                        onChange={e => updateReservationOperatingHour(loc._id, idx, 'close', e.target.value)}
                                        className="flex-1 bg-muted/40 border border-border/60 focus:border-primary/40 text-foreground text-xs font-medium rounded-xl px-3 py-1.5 outline-none transition-all"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => removeReservationOperatingHour(loc._id, idx)}
                                        className="h-8 w-8 flex items-center justify-center rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all shrink-0"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => addReservationOperatingHour(loc._id)}
                                  className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary/80 transition-colors px-1 py-1"
                                >
                                  <Plus size={13} strokeWidth={3} />
                                  Agregar franja horaria
                                </button>
                              </div>

                              <div className="grid grid-cols-3 gap-3">
                                <div>
                                  <label className={labelCls}>Intervalo</label>
                                  <select
                                    value={reservationMap[loc._id]?.slotConfig?.slotIntervalMinutes ?? 30}
                                    onChange={e => setReservationMap(prev => ({
                                      ...prev,
                                      [loc._id]: {
                                        ...prev[loc._id],
                                        slotConfig: { ...prev[loc._id].slotConfig!, slotIntervalMinutes: Number(e.target.value) },
                                      },
                                    }))}
                                    className={cn(inputCls, "text-center appearance-none")}
                                  >
                                    <option value={15}>15 min</option>
                                    <option value={20}>20 min</option>
                                    <option value={30}>30 min</option>
                                    <option value={60}>60 min</option>
                                  </select>
                                </div>
                                <div>
                                  <label className={labelCls}>Bloqueo (min)</label>
                                  <input
                                    type="number"
                                    min={15}
                                    step={15}
                                    value={reservationMap[loc._id]?.slotConfig?.blockDurationMinutes ?? 90}
                                    onChange={e => setReservationMap(prev => ({
                                      ...prev,
                                      [loc._id]: {
                                        ...prev[loc._id],
                                        slotConfig: { ...prev[loc._id].slotConfig!, blockDurationMinutes: Number(e.target.value) },
                                      },
                                    }))}
                                    className={cn(inputCls, "text-center")}
                                  />
                                </div>
                                <div>
                                  <label className={labelCls}>Máx. x slot</label>
                                  <input
                                    type="number"
                                    min={1}
                                    value={reservationMap[loc._id]?.slotConfig?.maxReservationsPerSlot ?? 1}
                                    onChange={e => setReservationMap(prev => ({
                                      ...prev,
                                      [loc._id]: {
                                        ...prev[loc._id],
                                        slotConfig: { ...prev[loc._id].slotConfig!, maxReservationsPerSlot: Number(e.target.value) },
                                      },
                                    }))}
                                    className={cn(inputCls, "text-center")}
                                  />
                                </div>
                              </div>
                            </div>
                          ) : (
                            /* ── Modo manual: timeSlots individuales (existente) ── */
                            <div>
                              <label className={labelCls}>Horarios disponibles</label>
                              <div className="flex flex-wrap gap-2 mb-3 min-h-[36px]">
                                {(reservationMap[loc._id]?.timeSlots || []).map(slot => (
                                  <span
                                    key={slot}
                                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-primary/10 text-primary border border-primary/20"
                                  >
                                    {slot}
                                    <button
                                      type="button"
                                      onClick={() => removeSlot(loc._id, slot)}
                                      className="text-primary/50 hover:text-red-500 transition-colors"
                                    >
                                      <X size={12} />
                                    </button>
                                  </span>
                                ))}
                                {(reservationMap[loc._id]?.timeSlots || []).length === 0 && (
                                  <span className="text-xs text-muted-foreground/50 italic">Sin horarios cargados</span>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <input
                                  type="time"
                                  value={newSlotMap[loc._id] || ''}
                                  onChange={e => setNewSlotMap(prev => ({ ...prev, [loc._id]: e.target.value }))}
                                  className={cn(inputCls, "flex-1")}
                                />
                                <button
                                  type="button"
                                  onClick={() => addSlot(loc._id)}
                                  className="flex items-center gap-1.5 px-4 h-[50px] rounded-2xl bg-primary text-white text-xs font-black hover:bg-primary/90 transition-colors active:scale-95 shrink-0"
                                >
                                  <Plus size={14} /> Agregar
                                </button>
                              </div>
                            </div>
                          )}

                          <Button
                            className="w-full bg-zinc-900 text-white font-bold h-12 rounded-xl active:scale-95 transition-all"
                            onClick={() => handleSaveReservationConfig(loc._id)}
                            disabled={reservationSaving === loc._id}
                          >
                            {reservationSaving === loc._id ? (
                              <><Loader2 size={16} className="animate-spin mr-2" /> Guardando...</>
                            ) : (
                              <><Save size={16} className="mr-2" /> Guardar configuración</>
                            )}
                          </Button>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </TabsContent>
            )}
            {/* ── POS Integration ── */}
            <TabsContent value="pos" className="m-0 mt-2">
              <div className="max-w-2xl bg-muted/20 border border-border/40 p-8 rounded-[2.5rem] space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                    <Database size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold tracking-tight">Integración con Sistemas POS</h3>
                    <p className="text-xs text-muted-foreground font-medium mt-1">Conecta TakeasyGO con FUDO o BISTROSOFT.</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    La integración POS permite inyectar pedidos automáticamente en tu sistema de gestión, sincronizar el catálogo de productos y mantener el estado de las órdenes actualizado en tiempo real.
                  </p>

                  <div className="p-4 bg-white border rounded-2xl flex items-center justify-between group hover:border-primary/40 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        <SettingsIcon size={16} />
                      </div>
                      <span className="text-sm font-bold">Configuración Avanzada de POS</span>
                    </div>
                    <Button 
                      variant="ghost" 
                      className="text-primary hover:bg-primary/5 font-bold flex items-center gap-2"
                      onClick={() => router.push(`/${tenantSlug}/admin/settings/pos`)}
                    >
                      Configurar
                      <ExternalLink size={14} />
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
          </motion.div>
        </AnimatePresence>
      </Tabs>
    </div>
  )
}

function TabTrigger({ value, icon, label }: { value: string, icon: any, label: string }) {
  return (
    <TabsTrigger
      value={value}
      className="data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-lg text-muted-foreground font-black text-[10px] uppercase tracking-widest px-6 py-3 rounded-xl transition-all flex items-center gap-2"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </TabsTrigger>
  )
}

// ── Delivery Config Section ───────────────────────────────────────────────
function DeliveryConfigSection({ locationId, tenantSlug, initialConfig }: {
  locationId: string
  tenantSlug: string
  initialConfig: { enabled: boolean; ranges: Array<{ fromKm: number; toKm: number; price: number }>; maxRangeKm: number }
}) {
  const [enabled, setEnabled] = useState(initialConfig?.enabled ?? false)
  const [ranges, setRanges] = useState(initialConfig?.ranges ?? [])
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const sortedRanges = [...ranges].sort((a, b) => a.fromKm - b.fromKm)
      const maxRangeKm = sortedRanges.length > 0 ? sortedRanges[sortedRanges.length - 1].toKm : 0

      // Validate no overlap
      for (let i = 0; i < sortedRanges.length; i++) {
        if (i > 0 && sortedRanges[i].fromKm !== sortedRanges[i - 1].toKm) {
          toast.error(`Los rangos deben ser contiguos. Hay un espacio entre ${sortedRanges[i - 1].toKm}km y ${sortedRanges[i].fromKm}km.`)
          setSaving(false)
          return
        }
        if (sortedRanges[i].fromKm >= sortedRanges[i].toKm) {
          toast.error(`Rango inválido: "Desde" debe ser menor que "Hasta"`)
          setSaving(false)
          return
        }
      }

      const res = await fetch(`/api/${tenantSlug}/locations/${locationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliveryConfig: { enabled, ranges: sortedRanges, maxRangeKm } }),
      })
      if (!res.ok) throw new Error()
      toast.success('Configuración de delivery guardada')
    } catch {
      toast.error('Error al guardar configuración de delivery')
    } finally {
      setSaving(false)
    }
  }

  function addRange() {
    const lastTo = ranges.length > 0 ? ranges[ranges.length - 1].toKm : 0
    setRanges(prev => [...prev, { fromKm: lastTo, toKm: lastTo + 5, price: 0 }])
  }

  function updateRange(idx: number, field: 'fromKm' | 'toKm' | 'price', value: number) {
    setRanges(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  function removeRange(idx: number) {
    if (ranges.length <= 1) return toast.error('Debe haber al menos un rango')
    setRanges(prev => prev.filter((_, i) => i !== idx))
  }

  return (
    <div className="p-5 bg-muted/30 border-border/40 border rounded-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin size={12} className="text-primary" />
          <label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 leading-none">
            🚚 Delivery
          </label>
        </div>
        <button
          type="button"
          onClick={() => setEnabled(!enabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
            enabled ? 'bg-primary' : 'bg-muted-foreground/30'
          }`}
        >
          <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform duration-200 ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`} />
        </button>
      </div>

      {enabled && (
        <div className="space-y-3">
          <p className="text-[10px] text-muted-foreground/50">
            Definí los rangos de distancia y el costo de envío para cada zona. Los rangos deben ser contiguos.
          </p>

          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 px-1">
              <span>Desde (km)</span>
              <span>Hasta (km)</span>
              <span>Precio ($)</span>
              <span className="w-8" />
            </div>
            {ranges.map((r, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={r.fromKm}
                  onChange={e => updateRange(idx, 'fromKm', Number(e.target.value))}
                  className="bg-white border border-border/60 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-primary/40"
                />
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={r.toKm}
                  onChange={e => updateRange(idx, 'toKm', Number(e.target.value))}
                  className="bg-white border border-border/60 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-primary/40"
                />
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={r.price}
                  onChange={e => updateRange(idx, 'price', Number(e.target.value))}
                  className="bg-white border border-border/60 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-primary/40"
                />
                <button
                  type="button"
                  onClick={() => removeRange(idx)}
                  className="h-8 w-8 flex items-center justify-center rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addRange}
              className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary/80 transition-colors px-1 py-1"
            >
              <PlusCircle size={13} strokeWidth={3} />
              Agregar rango
            </button>
          </div>

          <Button
            className="w-full bg-zinc-900 text-white font-bold h-10 rounded-xl active:scale-95 transition-all shadow-lg text-xs"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Guardando...' : 'Guardar configuración de delivery'}
          </Button>
        </div>
      )}
    </div>
  )
}
