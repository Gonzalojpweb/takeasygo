'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Printer, Plus, Trash2, RefreshCw, CheckCircle2,
  XCircle, AlertCircle, Pencil, X, Loader2, Copy, Check,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type PrinterRole = 'kitchen' | 'bar' | 'cashier'
type PrinterStatus = 'ok' | 'error' | 'offline' | 'unknown'
type PrinterConnectionType = 'tcp' | 'usb'

interface PrinterData {
  _id: string
  locationId: string
  uid: string
  name: string
  connectionType: PrinterConnectionType
  ip: string
  port: number
  roles: PrinterRole[]
  paperWidth: 58 | 80
  isActive: boolean
  lastStatus: PrinterStatus
  lastError: string
  lastPrintAt: string | null
  printSettings?: {
    kitchen: RolePrintSettings
    bar: RolePrintSettings
    cashier: RolePrintSettings
  }
}

interface RolePrintSettings {
  fontSize: 'normal' | 'large' | 'double' | 'triple'
  lineSpacing: number
  showDescriptions: boolean
  showPrices: boolean
  showCategory: boolean
  showCustomerInfo: boolean
  showOrderNotes: boolean
  showTotal: boolean
  headerTemplate?: string
  footerTemplate?: string
}

interface Location {
  _id: string
  name: string
}

interface Props {
  tenantSlug: string
  printers: PrinterData[]
  locations: Location[]
  plan?: string
}

const ROLE_LABELS: Record<PrinterRole, string> = {
  kitchen: 'Cocina',
  bar: 'Barra',
  cashier: 'Caja',
}

const STATUS_CONFIG: Record<PrinterStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  ok: { label: 'Online', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20', icon: CheckCircle2 },
  error: { label: 'Falla', color: 'text-red-500 bg-red-500/10 border-red-500/20', icon: XCircle },
  offline: { label: 'Offline', color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20', icon: AlertCircle },
  unknown: { label: 'Sin datos', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20', icon: AlertCircle },
}

const EMPTY_FORM = {
  locationId: '',
  name: '',
  connectionType: 'tcp' as PrinterConnectionType,
  ip: '',
  port: 9100,
  roles: ['kitchen'] as PrinterRole[],
  paperWidth: 80 as 58 | 80,
  printSettings: {
    kitchen: {
      fontSize: 'large',
      lineSpacing: 48,
      showDescriptions: false,
      showPrices: false,
      showCategory: true,
      showCustomerInfo: true,
      showOrderNotes: true,
      showTotal: false,
      headerTemplate: '',
      footerTemplate: '',
    },
    bar: {
      fontSize: 'large',
      lineSpacing: 48,
      showDescriptions: false,
      showPrices: false,
      showCategory: true,
      showCustomerInfo: true,
      showOrderNotes: true,
      showTotal: false,
      headerTemplate: '',
      footerTemplate: '',
    },
    cashier: {
      fontSize: 'normal',
      lineSpacing: 36,
      showDescriptions: true,
      showPrices: true,
      showCategory: true,
      showCustomerInfo: true,
      showOrderNotes: true,
      showTotal: true,
      headerTemplate: '',
      footerTemplate: '',
    },
  } as Record<PrinterRole, RolePrintSettings>,
}

export default function PrintersManager({ tenantSlug, printers: initial, locations, plan }: Props) {
  const [printers, setPrinters] = useState<PrinterData[]>(initial)
  const [selectedLocation, setSelectedLocation] = useState<string>(locations[0]?._id ?? '')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [showPrintSettings, setShowPrintSettings] = useState(false)
  const [editingPrintSettings, setEditingPrintSettings] = useState<PrinterData | null>(null)

  function copyToClipboard(value: string, key: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    })
  }

  const selectedLocationName = locations.find(l => l._id === selectedLocation)?.name ?? ''
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://tu-dominio.com'

  const filtered = printers.filter(p => p.locationId === selectedLocation || !selectedLocation)

  async function fetchPrinters() {
    const res = await fetch(`/api/${tenantSlug}/printers?locationId=${selectedLocation}`)
    if (res.ok) {
      const data = await res.json()
      setPrinters(data.printers)
    }
  }

  function openNew() {
    setForm({ ...EMPTY_FORM, locationId: selectedLocation })
    setEditingId(null)
    setShowForm(true)
  }

  function openEdit(p: PrinterData) {
    setForm({
      locationId: p.locationId ?? selectedLocation,
      name: p.name,
      connectionType: p.connectionType ?? 'tcp',
      ip: p.ip,
      port: p.port,
      roles: p.roles,
      paperWidth: p.paperWidth,
      printSettings: (p.printSettings ?? EMPTY_FORM.printSettings) as any,
    })
    setEditingId(p._id)
    setShowForm(true)
  }

  function openPrintSettings(p: PrinterData) {
    setEditingPrintSettings({
      ...p,
      printSettings: (p.printSettings ?? EMPTY_FORM.printSettings) as any,
    })
    setShowPrintSettings(true)
  }

  function updatePrintSettings(role: PrinterRole, key: keyof RolePrintSettings, value: any) {
    setEditingPrintSettings(prev => {
      if (!prev) return prev
      const base = prev.printSettings || EMPTY_FORM.printSettings
      return {
        ...prev,
        printSettings: {
          ...base,
          [role]: {
            ...base[role],
            [key]: value,
          },
        },
      } as PrinterData
    })
  }

  async function savePrintSettings() {
    if (!editingPrintSettings) return
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/printers/${editingPrintSettings._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printSettings: editingPrintSettings.printSettings }),
      })
      if (!res.ok) throw new Error()
      toast.success('Configuración de impresión actualizada')
      setShowPrintSettings(false)
      setEditingPrintSettings(null)
      await fetchPrinters()
    } catch {
      toast.error('Error al guardar configuración de impresión')
    } finally {
      setLoading(false)
    }
  }

  function toggleRole(role: PrinterRole) {
    setForm(prev => ({
      ...prev,
      roles: prev.roles.includes(role)
        ? prev.roles.filter(r => r !== role)
        : [...prev.roles, role],
    }))
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (form.roles.length === 0) {
      toast.error('Seleccioná al menos un rol para la impresora')
      return
    }
    setLoading(true)
    try {
      if (editingId) {
        const res = await fetch(`/api/${tenantSlug}/printers/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        if (!res.ok) throw new Error()
        toast.success('Impresora actualizada')
      } else {
        const res = await fetch(`/api/${tenantSlug}/printers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        if (!res.ok) throw new Error()
        toast.success('Impresora agregada')
      }
      setShowForm(false)
      setEditingId(null)
      await fetchPrinters()
    } catch {
      toast.error('Error al guardar la impresora')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/${tenantSlug}/printers/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Impresora eliminada')
      setPrinters(prev => prev.filter(p => p._id !== id))
    } catch {
      toast.error('Error al eliminar la impresora')
    } finally {
      setDeletingId(null)
    }
  }

  const inputCls = 'w-full bg-muted/30 border-2 border-border/80 focus:border-primary/40 text-foreground text-sm rounded-xl px-4 py-2.5 outline-none transition-all'
  const labelCls = 'text-[10px] uppercase font-bold tracking-[0.15em] text-muted-foreground/60 mb-1.5 block'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
            <Printer size={20} strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">
              Configuración de impresoras térmicas, roles y estado
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-2 border-border/60 rounded-xl font-bold text-xs gap-2"
            onClick={fetchPrinters}
          >
            <RefreshCw size={14} /> Actualizar
          </Button>
          <Button
            size="sm"
            className="bg-primary text-white font-bold text-xs gap-2 rounded-xl shadow-lg shadow-primary/20"
            onClick={openNew}
            disabled={plan === 'try' && printers.length >= 1}
            title={plan === 'try' && printers.length >= 1 ? 'El plan Inicial permite 1 impresora. Actualizá a Crecimiento.' : undefined}
          >
            <Plus size={14} /> Nueva Manual
          </Button>
        </div>
      </div>

      {/* Location tabs */}
      {locations.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {locations.map(loc => (
            <button
              key={loc._id}
              onClick={() => setSelectedLocation(loc._id)}
              className={cn(
                'px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border-2 transition-all',
                selectedLocation === loc._id
                  ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20'
                  : 'border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground'
              )}
            >
              {loc.name}
            </button>
          ))}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <Card className="border-2 border-primary/20 rounded-[2rem] shadow-xl bg-card animate-in fade-in slide-in-from-top-2 duration-300">
          <CardHeader className="p-6 border-b border-border/40">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold">
                {editingId ? 'Editar impresora' : 'Nueva impresora manual'}
              </CardTitle>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X size={18} />
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleSave} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Sede */}
                {!editingId && (
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Sede</label>
                    <select
                      required
                      value={form.locationId}
                      onChange={e => setForm(p => ({ ...p, locationId: e.target.value }))}
                      className={inputCls}
                    >
                      <option value="">Seleccioná una sede</option>
                      {locations.map(l => (
                        <option key={l._id} value={l._id}>{l.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Nombre */}
                <div>
                  <label className={labelCls}>Nombre</label>
                  <input
                    required
                    value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="Ej: Cocina Principal"
                    className={inputCls}
                  />
                </div>

                {/* Tipo de conexión */}
                <div className="sm:col-span-2">
                  <label className={labelCls}>Tipo de conexión</label>
                  <div className="flex gap-2">
                    {(['tcp', 'usb'] as PrinterConnectionType[]).map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setForm(p => ({ ...p, connectionType: type }))}
                        className={cn(
                          'px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border-2 transition-all flex-1',
                          form.connectionType === type
                            ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                            : 'border-border/60 text-muted-foreground hover:border-primary/40'
                        )}
                      >
                        {type === 'tcp' ? 'TCP/IP' : 'USB Directo'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* IP / Nombre Impresora */}
                <div>
                  <label className={labelCls}>
                    {form.connectionType === 'usb' ? 'Nombre de la impresora en Windows' : 'IP de la impresora'}
                  </label>
                  <input
                    required
                    value={form.ip}
                    onChange={e => setForm(p => ({ ...p, ip: e.target.value }))}
                    placeholder={form.connectionType === 'usb' ? 'EPSON TM-T20' : '192.168.0.100'}
                    className={inputCls}
                  />
                  {form.connectionType === 'usb' && (
                    <p className="text-[10px] text-muted-foreground/60 mt-1 ml-1">
                      Encontrá el nombre en Windows → Configuración → Impresoras
                    </p>
                  )}
                </div>

                {/* Puerto (solo TCP) */}
                {form.connectionType === 'tcp' && (
                  <div>
                    <label className={labelCls}>Puerto TCP</label>
                    <input
                      type="number"
                      value={form.port}
                      onChange={e => setForm(p => ({ ...p, port: Number(e.target.value) }))}
                      className={inputCls}
                    />
                  </div>
                )}

                {/* Ancho de papel */}
                <div>
                  <label className={labelCls}>Ancho de papel</label>
                  <select
                    value={form.paperWidth}
                    onChange={e => setForm(p => ({ ...p, paperWidth: Number(e.target.value) as 58 | 80 }))}
                    className={inputCls}
                  >
                    <option value={80}>80mm</option>
                    <option value={58}>58mm</option>
                  </select>
                </div>
              </div>

              {/* Roles */}
              <div>
                <label className={labelCls}>Roles de impresión</label>
                <div className="flex gap-2 flex-wrap mt-1">
                  {(['kitchen', 'bar', 'cashier'] as PrinterRole[]).map(role => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggleRole(role)}
                      className={cn(
                        'px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border-2 transition-all',
                        form.roles.includes(role)
                          ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                          : 'border-border/60 text-muted-foreground hover:border-primary/40'
                      )}
                    >
                      {ROLE_LABELS[role]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={loading}
                  className="bg-primary text-white font-black uppercase tracking-widest px-8 h-11 rounded-xl shadow-lg shadow-primary/20 flex-1 sm:flex-none"
                >
                  {loading ? <Loader2 className="animate-spin h-4 w-4" /> : editingId ? 'Guardar cambios' : 'Agregar impresora'}
                </Button>
                <Button type="button" variant="ghost" className="h-11 rounded-xl" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Printer cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-3xl bg-muted/50 flex items-center justify-center text-muted-foreground mb-4">
            <Printer size={28} />
          </div>
          <p className="text-foreground font-bold text-lg">No hay impresoras configuradas</p>
          <p className="text-muted-foreground text-sm mt-1">Agregá una impresora manual con su IP y rol.</p>
          <Button
            className="mt-6 gap-2 rounded-xl bg-primary text-white font-bold shadow-lg shadow-primary/20"
            onClick={openNew}
            disabled={plan === 'try' && printers.length >= 1}
          >
            <Plus size={16} /> Agregar impresora
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(printer => {
            const status = STATUS_CONFIG[printer.lastStatus]
            const StatusIcon = status.icon

            return (
              <Card
                key={printer._id}
                className={cn(
                  'rounded-[1.75rem] border-2 shadow-md transition-all',
                  printer.isActive ? 'border-border/60 bg-card' : 'border-border/30 bg-muted/30 opacity-60'
                )}
              >
                <CardContent className="p-5 space-y-4">
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-foreground text-base leading-tight">{printer.name}</p>
                      <p className="text-muted-foreground text-xs font-mono mt-0.5">
                        {printer.connectionType === 'usb' ? (
                          <>{printer.ip} <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground/50">(USB)</span></>
                        ) : (
                          <>{printer.ip}:{printer.port}</>
                        )}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn('text-[10px] font-black uppercase tracking-wider px-3 py-1 border-2 rounded-full shrink-0', status.color)}
                    >
                      <StatusIcon size={10} className="mr-1 inline" />
                      {status.label}
                    </Badge>
                  </div>

                  {/* Roles */}
                  <div className="flex gap-1.5 flex-wrap">
                    {printer.roles.map(role => (
                      <span
                        key={role}
                        className="px-3 py-1 rounded-lg bg-primary/10 text-primary text-[10px] font-black uppercase tracking-wider"
                      >
                        {ROLE_LABELS[role]}
                      </span>
                    ))}
                    <span className="px-3 py-1 rounded-lg bg-muted text-muted-foreground text-[10px] font-bold">
                      {printer.paperWidth}mm
                    </span>
                  </div>

                  {/* Error message */}
                  {printer.lastStatus === 'error' && printer.lastError && (
                    <p className="text-[10px] text-red-400 font-medium bg-red-500/5 rounded-lg px-3 py-2 border border-red-500/10">
                      {printer.lastError}
                    </p>
                  )}

                  {/* Last print */}
                  {printer.lastPrintAt && (
                    <p className="text-[10px] text-muted-foreground/60 font-medium">
                      Último ticket: {new Date(printer.lastPrintAt).toLocaleString('es-AR')}
                    </p>
                  )}

                  {/* UID */}
                  <p className="text-[9px] text-muted-foreground/40 font-mono uppercase tracking-wider">
                    UID: {printer.uid}
                  </p>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1 border-t border-border/40">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-8 text-xs font-bold border-border/60 rounded-lg gap-1"
                      onClick={() => openEdit(printer)}
                    >
                      <Pencil size={12} /> Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-3 text-xs font-bold border-primary/30 text-primary hover:bg-primary/10 rounded-lg gap-1"
                      onClick={() => openPrintSettings(printer)}
                    >
                      Estilos
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0 rounded-lg border-red-500/20 text-red-400 hover:bg-red-500/10 hover:border-red-500/40"
                      disabled={deletingId === printer._id}
                      onClick={() => handleDelete(printer._id)}
                    >
                      {deletingId === printer._id
                        ? <Loader2 size={12} className="animate-spin" />
                        : <Trash2 size={12} />
                      }
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Print Settings Modal */}
      {showPrintSettings && editingPrintSettings && (
        <Card className="border-2 border-primary/20 rounded-[2rem] shadow-xl bg-card animate-in fade-in slide-in-from-top-2 duration-300 fixed inset-4 z-50 overflow-auto">
          <CardHeader className="p-6 border-b border-border/40 sticky top-0 bg-card z-10">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold">
                Configuración de Estilos de Impresión - {editingPrintSettings.name}
              </CardTitle>
              <button onClick={() => setShowPrintSettings(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X size={18} />
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-8">
            {(['kitchen', 'bar', 'cashier'] as PrinterRole[]).map(role => (
              <div key={role} className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-border/40">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                    {ROLE_LABELS[role]}
                  </h3>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Tamaño de fuente */}
                  <div>
                    <label className={labelCls}>Tamaño de fuente</label>
                    <select
                      value={editingPrintSettings.printSettings?.[role]?.fontSize || 'normal'}
                      onChange={e => updatePrintSettings(role, 'fontSize', e.target.value)}
                      className={inputCls}
                    >
                      <option value="normal">Normal</option>
                      <option value="large">Grande</option>
                      <option value="double">Doble</option>
                      <option value="triple">Triple</option>
                    </select>
                  </div>

                  {/* Espaciado de líneas */}
                  <div>
                    <label className={labelCls}>Espaciado de líneas (0-255)</label>
                    <input
                      type="number"
                      min="0"
                      max="255"
                      value={editingPrintSettings.printSettings?.[role]?.lineSpacing || 36}
                      onChange={e => updatePrintSettings(role, 'lineSpacing', Number(e.target.value))}
                      className={inputCls}
                    />
                  </div>
                </div>

                {/* Toggle switches */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { key: 'showDescriptions', label: 'Mostrar descripciones' },
                    { key: 'showPrices', label: 'Mostrar precios' },
                    { key: 'showCategory', label: 'Mostrar categorías' },
                    { key: 'showCustomerInfo', label: 'Mostrar cliente' },
                    { key: 'showOrderNotes', label: 'Mostrar notas' },
                    { key: 'showTotal', label: 'Mostrar total' },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => updatePrintSettings(role, key as keyof RolePrintSettings, !editingPrintSettings.printSettings?.[role]?.[key as keyof RolePrintSettings])}
                      className={cn(
                        'px-3 py-2 rounded-lg text-xs font-bold border-2 transition-all text-left',
                        editingPrintSettings.printSettings?.[role]?.[key as keyof RolePrintSettings]
                          ? 'bg-primary text-white border-primary shadow-md'
                          : 'border-border/60 text-muted-foreground hover:border-primary/40'
                      )}
                    >
                      {editingPrintSettings.printSettings?.[role]?.[key as keyof RolePrintSettings] ? '✓ ' : '✗ '}{label}
                    </button>
                  ))}
                </div>

                {/* Header/Footer templates */}
                <div className="grid gap-2 mt-2">
                  <label className={labelCls}>Plantilla de encabezado</label>
                  <textarea
                    value={editingPrintSettings.printSettings?.[role]?.headerTemplate || ''}
                    onChange={e => updatePrintSettings(role, 'headerTemplate', e.target.value)}
                    className={inputCls}
                    rows={3}
                    placeholder="HTML o texto para el encabezado"
                  />
                </div>
                <div className="grid gap-2 mt-2">
                  <label className={labelCls}>Plantilla de pie de página</label>
                  <textarea
                    value={editingPrintSettings.printSettings?.[role]?.footerTemplate || ''}
                    onChange={e => updatePrintSettings(role, 'footerTemplate', e.target.value)}
                    className={inputCls}
                    rows={3}
                    placeholder="HTML o texto para el pie de página"
                  />
                </div>
                {/* Presets rápidos */}
                <div className="flex gap-2 pt-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 self-center">
                    Presets:
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      updatePrintSettings(role, 'fontSize', 'large')
                      updatePrintSettings(role, 'lineSpacing', 48)
                      updatePrintSettings(role, 'showDescriptions', false)
                      updatePrintSettings(role, 'showPrices', false)
                      updatePrintSettings(role, 'showCategory', true)
                      updatePrintSettings(role, 'showCustomerInfo', true)
                      updatePrintSettings(role, 'showOrderNotes', true)
                      updatePrintSettings(role, 'showTotal', false)
                    }}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-bold border-2 border-primary/30 text-primary hover:bg-primary/10"
                  >
                    Cocina estándar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updatePrintSettings(role, 'fontSize', 'normal')
                      updatePrintSettings(role, 'lineSpacing', 36)
                      updatePrintSettings(role, 'showDescriptions', true)
                      updatePrintSettings(role, 'showPrices', true)
                      updatePrintSettings(role, 'showCategory', true)
                      updatePrintSettings(role, 'showCustomerInfo', true)
                      updatePrintSettings(role, 'showOrderNotes', true)
                      updatePrintSettings(role, 'showTotal', true)
                    }}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-bold border-2 border-primary/30 text-primary hover:bg-primary/10"
                  >
                    Caja detallada
                  </button>
                </div>
              </div>
            ))}

            <div className="flex gap-3 pt-4 border-t border-border/40">
              <Button
                onClick={savePrintSettings}
                disabled={loading}
                className="bg-primary text-white font-black uppercase tracking-widest px-8 h-11 rounded-xl shadow-lg shadow-primary/20 flex-1 sm:flex-none"
              >
                {loading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Guardar cambios'}
              </Button>
              <Button
                variant="ghost"
                className="h-11 rounded-xl"
                onClick={() => setShowPrintSettings(false)}
              >
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Agent instructions */}
      <Card className="rounded-[2rem] border-2 border-border/40 bg-muted/20">
        <CardContent className="p-6 space-y-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">Agente de impresión local</p>
            <p className="text-sm text-muted-foreground font-medium leading-relaxed">
              Copiá estos datos y pegálos en el <span className="font-bold text-foreground">config.json</span> del agente antes de instalarlo en la PC del local.
            </p>
          </div>

          <div className="space-y-2">
            {[
              { key: 'apiUrl',      value: origin,           label: 'URL del servidor' },
              { key: 'tenantSlug',  value: tenantSlug,       label: 'Slug del restaurante' },
              { key: 'locationId',  value: selectedLocation, label: `ID de sede — ${selectedLocationName}` },
            ].map(({ key, value, label }) => (
              <div key={key} className="flex items-center gap-3 bg-muted/40 border border-border/40 rounded-xl px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-0.5">{label}</p>
                  <p className="text-xs font-mono text-foreground truncate">{value || '—'}</p>
                </div>
                <button
                  onClick={() => copyToClipboard(value, key)}
                  disabled={!value}
                  className={cn(
                    'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all',
                    copiedKey === key
                      ? 'bg-emerald-500/10 text-emerald-500'
                      : 'bg-muted hover:bg-primary/10 hover:text-primary text-muted-foreground disabled:opacity-30'
                  )}
                >
                  {copiedKey === key ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-muted-foreground/50 font-medium leading-relaxed">
            Si el restaurante tiene más de una sede, instalá un agente por sede con su <span className="font-bold">locationId</span> correspondiente.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
