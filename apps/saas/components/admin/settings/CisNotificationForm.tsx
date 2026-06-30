'use client'

import { useState, useEffect } from 'react'
import { Bell, Mail, Smartphone, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'

// ─────────────────────────────────────────────────────────────────────────────
// CisNotificationForm — Configuración de notificaciones CIS
// ─────────────────────────────────────────────────────────────────────────────
// Permite a admin/manager configurar qué eventos CIS generan notificaciones.
// Canales: Email + Push (WhatsApp no disponible aún).
// ─────────────────────────────────────────────────────────────────────────────

interface CisSettings {
  notifyAtRisk: boolean
  notifyDormant: boolean
  notifyNewVip: boolean
  notifyFrequencyDrop: boolean
  notifyRecovered: boolean
  emailEnabled: boolean
  pushEnabled: boolean
}

interface Props {
  tenantSlug: string
}

const EVENT_TYPES = [
  { key: 'notifyAtRisk', label: 'Cliente en riesgo', description: 'Cuando un cliente frecuente empieza a bajar la frecuencia de compra.' },
  { key: 'notifyDormant', label: 'Cliente dormido', description: 'Cuando un cliente no viene hace mucho más de lo normal.' },
  { key: 'notifyNewVip', label: 'Nuevo VIP', description: 'Cuando un cliente es clasificado como VIP por primera vez.' },
  { key: 'notifyFrequencyDrop', label: 'Baja de frecuencia', description: 'Cuando un cliente reduce su frecuencia de compra.' },
  { key: 'notifyRecovered', label: 'Cliente recuperado', description: 'Cuando un cliente que estaba dormido vuelve a comprar.' },
]

export default function CisNotificationForm({ tenantSlug }: Props) {
  const [settings, setSettings] = useState<CisSettings>({
    notifyAtRisk: true,
    notifyDormant: true,
    notifyNewVip: true,
    notifyFrequencyDrop: true,
    notifyRecovered: true,
    emailEnabled: true,
    pushEnabled: true,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch(`/api/${tenantSlug}/settings/notifications`)
        if (!res.ok) return
        const data = await res.json()
        if (data.cis) {
          setSettings(prev => ({ ...prev, ...data.cis }))
        }
      } catch { /* silent */ } finally {
        setLoading(false)
      }
    }
    fetchSettings()
  }, [tenantSlug])

  const handleToggle = (key: keyof CisSettings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/settings/notifications`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cis: settings }),
      })
      if (!res.ok) throw new Error()
      toast.success('Configuración de notificaciones guardada')
    } catch {
      toast.error('Error al guardar la configuración')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border p-5 bg-card space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bell size={14} className="text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Notificaciones de Inteligencia</h3>
            <p className="text-xs text-muted-foreground">Alertas automáticas cuando CIS detecta cambios importantes</p>
          </div>
        </div>
      </div>

      {/* Canales */}
      <div className="space-y-2">
        <label className="text-[10px] uppercase font-bold text-muted-foreground">Canales de notificación</label>
        <div className="flex items-center gap-4">
          <button
            onClick={() => handleToggle('emailEnabled')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${settings.emailEnabled ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
          >
            <Mail size={14} />
            Email
          </button>
          <button
            onClick={() => handleToggle('pushEnabled')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${settings.pushEnabled ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
          >
            <Smartphone size={14} />
            Push
          </button>
        </div>
      </div>

      {/* Eventos */}
      <div className="space-y-3">
        <label className="text-[10px] uppercase font-bold text-muted-foreground">Eventos que generan alertas</label>
        {EVENT_TYPES.map(event => (
          <div
            key={event.key}
            className="flex items-start justify-between gap-4 p-3 rounded-xl border border-border/50 hover:bg-muted/20 transition-colors"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{event.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{event.description}</p>
            </div>
            <button
              onClick={() => handleToggle(event.key as keyof CisSettings)}
              className={`shrink-0 w-10 h-6 rounded-full transition-colors relative ${settings[event.key as keyof CisSettings] ? 'bg-primary' : 'bg-muted'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${settings[event.key as keyof CisSettings] ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
          </div>
        ))}
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Guardar configuración
        </button>
      </div>
    </div>
  )
}
