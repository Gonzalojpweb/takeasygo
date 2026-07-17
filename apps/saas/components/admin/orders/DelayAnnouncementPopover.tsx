'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Timer, AlertTriangle, ChevronDown, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Props {
  tenantSlug: string
  locations: { _id: string; name: string }[]
  activeLocationId: string
}

const DELAY_RELEVANT_MODES = ['takeaway', 'delivery']
const MODE_LABELS: Record<string, string> = {
  takeaway: 'Takeaway',
  delivery: 'Delivery',
}

export default function DelayAnnouncementPopover({ tenantSlug, locations, activeLocationId }: Props) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [supportedModes, setSupportedModes] = useState<string[]>([])
  const [configs, setConfigs] = useState<Record<string, { enabled: boolean; extraMinutes: number; message: string }>>({})
  const panelRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const hasActive = Object.values(configs).some(c => c?.enabled ?? false)
  const isAll = activeLocationId === 'all'
  const locationName = locations.find(l => l._id === activeLocationId)?.name

  // Fetch delay status for selected location
  const fetchDelay = useCallback(async () => {
    if (isAll) return
    try {
      const res = await fetch(`/api/${tenantSlug}/locations/${activeLocationId}/estimated-time`)
      if (res.ok) {
        const data = await res.json()
        const d = data.delayAnnouncement ?? {}
        const modes = (data.orderModes ?? ['takeaway']).filter((m: string) => DELAY_RELEVANT_MODES.includes(m))
        setSupportedModes(modes)
        const cfg: Record<string, { enabled: boolean; extraMinutes: number; message: string }> = {}
        for (const mode of modes) {
          const m = d[mode]
          cfg[mode] = {
            enabled: m?.enabled ?? false,
            extraMinutes: m?.extraMinutes ?? 10,
            message: m?.message ?? '',
          }
        }
        setConfigs(cfg)
      }
    } catch {}
  }, [tenantSlug, activeLocationId, isAll])

  useEffect(() => {
    fetchDelay()
  }, [fetchDelay])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) && btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleSave = useCallback(async () => {
    if (isAll) return toast.error('Seleccioná una sede específica')
    const body: Record<string, any> = { locationId: activeLocationId }
    for (const mode of supportedModes) {
      const c = configs[mode]
      if (c) body[mode] = c
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/settings/delay-announcement`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al guardar')
      }
      toast.success('Aviso de demora actualizado')
      setOpen(false)
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }, [tenantSlug, activeLocationId, configs, supportedModes, isAll])

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          if (isAll) return toast.error('Seleccioná una sede para configurar demoras')
          setOpen(v => !v)
        }}
        className={cn(
          'h-8 px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0',
          hasActive
            ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
            : isAll
              ? 'border-border/60 bg-background text-muted-foreground opacity-60 cursor-not-allowed'
              : 'border-border/60 bg-background text-muted-foreground hover:text-foreground hover:bg-muted'
        )}
      >
        {hasActive ? (
          <AlertTriangle size={13} className="text-red-500 shrink-0" />
        ) : (
          <Timer size={13} className="shrink-0" />
        )}
        <span className="hidden xl:inline">Retraso</span>
        {hasActive && (
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute top-full right-0 mt-2 w-[320px] rounded-xl border border-border/60 bg-card shadow-xl z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Timer size={14} className="text-muted-foreground" />
              <span className="text-xs font-bold text-foreground">Aviso de demora</span>
            </div>
            {locationName && (
              <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {locationName}
              </span>
            )}
          </div>

          {supportedModes.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-xs text-muted-foreground">Esta sede no tiene takeaway ni delivery</p>
            </div>
          ) : (
            <>
              {/* Mode toggles */}
              <div className="px-4 py-3 space-y-2.5">
                {supportedModes.map(mode => {
                  const cfg = configs[mode]
                  if (!cfg) return null
                  return (
                    <div key={mode} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">{MODE_LABELS[mode] || mode}</span>
                        <button
                          type="button"
                          onClick={() => setConfigs(prev => ({
                            ...prev,
                            [mode]: { ...prev[mode], enabled: !prev[mode]?.enabled },
                          }))}
                          className={cn(
                            'relative w-9 h-5 rounded-full transition-all shrink-0',
                            cfg.enabled ? 'bg-red-500' : 'bg-zinc-300'
                          )}
                        >
                          <div className={cn(
                            'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all',
                            cfg.enabled ? 'left-[18px]' : 'left-0.5'
                          )} />
                        </button>
                      </div>

                      {cfg.enabled && (
                        <div className="space-y-1.5 pl-0.5">
                          <div>
                            <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">
                              Minutos adicionales
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={120}
                              value={cfg.extraMinutes}
                              onChange={e => setConfigs(prev => ({
                                ...prev,
                                [mode]: { ...prev[mode], extraMinutes: Math.max(0, parseInt(e.target.value) || 0) },
                              }))}
                              className="w-full border border-border/60 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-foreground/40 transition-all"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">
                              Mensaje (opcional)
                            </label>
                            <input
                              type="text"
                              placeholder="Ej: Falta personal"
                              value={cfg.message}
                              onChange={e => setConfigs(prev => ({
                                ...prev,
                                [mode]: { ...prev[mode], message: e.target.value },
                              }))}
                              maxLength={120}
                              className="w-full border border-border/60 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-foreground/40 transition-all"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Save button */}
              <div className="px-4 pb-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full h-8 rounded-lg bg-foreground text-background text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-90 transition-all disabled:opacity-50"
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : null}
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
