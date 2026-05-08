'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Save, Settings, Clock } from 'lucide-react'
import { toast } from 'sonner'
import ImageUpload from './ImageUpload'

interface StoreConfig {
  enabled: boolean
  title: string
  description: string
  heroImageUrl: string
  allowOnlineRedemption: boolean
  redemptionExpiryHours: number
}

interface Props {
  tenantSlug: string
}

export default function StoreSettings({ tenantSlug }: Props) {
  const [config, setConfig] = useState<StoreConfig>({
    enabled: false,
    title: 'Tienda de Recompensas',
    description: 'Canjea tus puntos por recompensas exclusivas',
    heroImageUrl: '',
    allowOnlineRedemption: false,
    redemptionExpiryHours: 24,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchConfig()
  }, [tenantSlug])

  async function fetchConfig() {
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/store/config`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar configuración')
      const fetchedConfig = data.config
      // Only update config if we have valid data
      if (fetchedConfig && typeof fetchedConfig === 'object') {
        setConfig({
          enabled: typeof fetchedConfig.enabled === 'boolean' ? fetchedConfig.enabled : false,
          title: typeof fetchedConfig.title === 'string' ? fetchedConfig.title : 'Tienda de Recompensas',
          description: typeof fetchedConfig.description === 'string' ? fetchedConfig.description : 'Canjea tus puntos por recompensas exclusivas',
          heroImageUrl: typeof fetchedConfig.heroImageUrl === 'string' ? fetchedConfig.heroImageUrl : '',
          allowOnlineRedemption: typeof fetchedConfig.allowOnlineRedemption === 'boolean' ? fetchedConfig.allowOnlineRedemption : false,
          redemptionExpiryHours: typeof fetchedConfig.redemptionExpiryHours === 'number' ? fetchedConfig.redemptionExpiryHours : 24,
        })
      }
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/store/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar configuración')
      toast.success('Configuración guardada')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card className="border-2 border-border/60 rounded-[2.5rem] overflow-hidden">
        <CardContent className="p-8">
          <div className="text-center py-12 text-muted-foreground">Cargando...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-2 border-border/60 rounded-[2.5rem] overflow-hidden">
      <CardHeader className="p-8 border-b border-border/40 bg-muted/5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-500">
            <Settings size={24} strokeWidth={2.5} />
          </div>
          <div>
            <CardTitle className="text-xl font-bold tracking-tight">Configuración de Tienda</CardTitle>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              Configura la tienda de recompensas del club
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-8 space-y-8">
        <div className="flex items-center justify-between p-6 rounded-2xl bg-muted/30 border border-border/40">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${
              config.enabled ? 'bg-purple-500/10 text-purple-500' : 'bg-muted text-muted-foreground'
            }`}>
              <Settings size={24} />
            </div>
            <div>
              <Label className="text-base font-bold cursor-pointer" htmlFor="store-enabled">
                {config.enabled ? 'Tienda activa' : 'Tienda desactivada'}
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {config.enabled
                  ? 'Los miembros pueden canjear puntos por artículos.'
                  : 'Activa la tienda para permitir canjes de puntos.'}
              </p>
            </div>
          </div>
          <Switch
            id="store-enabled"
            checked={config.enabled ?? false}
            onCheckedChange={(checked) => setConfig({ ...config, enabled: checked })}
            className="data-[state=checked]:bg-purple-500"
          />
        </div>

        <div className={`space-y-6 transition-opacity ${config.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">
                Título de la Tienda
              </Label>
              <Input
                value={config.title || ''}
                onChange={e => setConfig({ ...config, title: e.target.value })}
                placeholder="Tienda de Recompensas"
                maxLength={50}
                className="bg-muted/40 border-2 border-border/60 focus:border-primary/40 h-12 rounded-xl text-sm font-medium"
              />
              <p className="text-[10px] text-muted-foreground/50 text-right">{(config.title || '').length}/50</p>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">
                Expiración de Códigos (horas)
              </Label>
              <div className="flex items-center gap-3">
                <Clock size={16} className="text-muted-foreground" />
                <Input
                  type="number"
                  value={config.redemptionExpiryHours || 24}
                  onChange={e => setConfig({ ...config, redemptionExpiryHours: parseInt(e.target.value) || 24 })}
                  min="1"
                  max="168"
                  className="flex-1 bg-muted/40 border-2 border-border/60 focus:border-primary/40 h-12 rounded-xl text-sm font-medium"
                />
              </div>
              <p className="text-[10px] text-muted-foreground/50">
                Tiempo para reclamar el canje (1-168 horas)
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">
              Descripción
            </Label>
            <textarea
              value={config.description || ''}
              onChange={e => setConfig({ ...config, description: e.target.value })}
              placeholder="Canjea tus puntos por recompensas exclusivas"
              maxLength={200}
              rows={3}
              className="w-full bg-muted/40 border-2 border-border/60 focus:border-primary/40 rounded-xl px-4 py-3 text-sm font-medium outline-none transition-all resize-none"
            />
            <p className="text-[10px] text-muted-foreground/50 text-right">{(config.description || '').length}/200</p>
          </div>

          <ImageUpload
            value={config.heroImageUrl || ''}
            onChange={value => setConfig({ ...config, heroImageUrl: value })}
            label="URL de Imagen Hero"
            placeholder="https://..."
            tenantSlug={tenantSlug}
          />

          <div className="flex items-center justify-between p-6 rounded-2xl bg-muted/30 border border-border/40">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                <Clock size={24} />
              </div>
              <div>
                <Label className="text-base font-bold cursor-pointer" htmlFor="online-redemption">
                  {config.allowOnlineRedemption ? 'Canje Online' : 'Canje Presencial'}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {config.allowOnlineRedemption
                    ? 'Los miembros pueden canjear sin ir al local.'
                    : 'Requiere presencia física para reclamar.'}
                </p>
              </div>
            </div>
            <Switch
              id="online-redemption"
              checked={config.allowOnlineRedemption ?? false}
              onCheckedChange={(checked) => setConfig({ ...config, allowOnlineRedemption: checked })}
              className="data-[state=checked]:bg-blue-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-4 border-t border-border/40">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest px-8 h-12 rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95"
          >
            {saving ? 'Guardando...' : <Save size={16} className="mr-2 stroke-[3px]" />}
            {saving ? '' : 'Guardar cambios'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
