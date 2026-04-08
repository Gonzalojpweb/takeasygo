'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Loader2, QrCode, Save, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Props {
  tenantSlug: string
  initial?: {
    enabled: boolean
    clubName: string
    welcomeMessage: string
  }
}

const SOURCE_LABELS: Record<string, string> = {
  checkout:      'En caja',
  qr_scan:       'Escaneo QR',
  admin:         'Manual admin',
  manual_import: 'Importación',
}

export default function LoyaltyClubSettings({ tenantSlug, initial }: Props) {
  const [enabled, setEnabled]       = useState(initial?.enabled ?? false)
  const [clubName, setClubName]     = useState(initial?.clubName ?? '')
  const [welcomeMsg, setWelcomeMsg] = useState(initial?.welcomeMessage ?? '')
  const [loading, setLoading]       = useState(false)
  const [saving, setSaving]         = useState(false)

  useEffect(() => {
    if (initial) {
      setEnabled(initial.enabled)
      setClubName(initial.clubName)
      setWelcomeMsg(initial.welcomeMessage)
    }
  }, [initial])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/loyalty/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, clubName, welcomeMessage: welcomeMsg }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      toast.success('Configuración del club guardada')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="border-2 border-border/60 rounded-[2.5rem] overflow-hidden">
      <CardHeader className="p-8 border-b border-border/40 bg-muted/5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500">
            <QrCode size={24} strokeWidth={2.5} />
          </div>
          <div>
            <CardTitle className="text-xl font-bold tracking-tight">Club de Fidelización</CardTitle>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              Activá el club para captar clientes frecuentes y vincular pedidos.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-8 space-y-8">
        <div className="flex items-center justify-between p-6 rounded-2xl bg-muted/30 border border-border/40">
          <div className="flex items-center gap-4">
            <div className={cn(
              'w-12 h-12 rounded-2xl flex items-center justify-center transition-colors',
              enabled ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'
            )}>
              {enabled ? <Eye size={24} /> : <EyeOff size={24} />}
            </div>
            <div>
              <Label className="text-base font-bold cursor-pointer" htmlFor="club-enabled">
                {enabled ? 'Club activo' : 'Club desactivado'}
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {enabled
                  ? 'Los clientes pueden registrarse escaneando el QR o en el checkout.'
                  : 'Activalo para comenzar a captar miembros del club.'}
              </p>
            </div>
          </div>
          <Switch
            id="club-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
            className="data-[state=checked]:bg-emerald-500"
          />
        </div>

        <div className={cn('space-y-6 transition-opacity', enabled ? 'opacity-100' : 'opacity-40 pointer-events-none')}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">
                Nombre del club
              </Label>
              <Input
                value={clubName}
                onChange={e => setClubName(e.target.value.slice(0, 80))}
                placeholder="Ej: Club La Pizzada"
                maxLength={80}
                className="bg-muted/40 border-2 border-border/60 focus:border-primary/40 h-12 rounded-xl text-sm font-medium"
              />
              <p className="text-[10px] text-muted-foreground/50 text-right">{clubName.length}/80</p>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">
                Límite de miembros
              </Label>
              <div className="flex items-center gap-2 h-12 px-4 rounded-xl bg-muted/20 border-2 border-border/60">
                <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 font-bold">
                  Según tu plan
                </Badge>
                <span className="text-sm text-muted-foreground font-medium">
                  Trial: 30 • Inicial: 150 • Crecimiento+: Ilimitado
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">
              Mensaje de bienvenida
            </Label>
            <textarea
              value={welcomeMsg}
              onChange={e => setWelcomeMsg(e.target.value.slice(0, 300))}
              placeholder="¡Bienvenido/a a nuestro club! Próximamente tendrás beneficios exclusivos."
              maxLength={300}
              rows={3}
              className="w-full bg-muted/40 border-2 border-border/60 focus:border-primary/40 rounded-xl px-4 py-3 text-sm font-medium outline-none transition-all resize-none"
            />
            <p className="text-[10px] text-muted-foreground/50 text-right">{welcomeMsg.length}/300</p>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-4 border-t border-border/40">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest px-8 h-12 rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95"
          >
            {saving ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : <Save size={16} className="mr-2 stroke-[3px]" />}
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
