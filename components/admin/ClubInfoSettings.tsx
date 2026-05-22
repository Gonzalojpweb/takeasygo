'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Loader2, Eye, EyeOff, Save } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Plan } from '@/lib/plans'

interface Props {
  tenantSlug: string
  initial: {
    enabled: boolean
    clubName: string
    welcomeMessage: string
  }
  plan: Plan
}

export default function ClubInfoSettings({ tenantSlug, initial, plan }: Props) {
  const [enabled, setEnabled] = useState(initial?.enabled ?? false)
  const [clubName, setClubName] = useState(initial?.clubName ?? '')
  const [welcomeMsg, setWelcomeMsg] = useState(initial?.welcomeMessage ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/loyalty/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, clubName, welcomeMessage: welcomeMsg }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Error al guardar')
      toast.success('Club actualizado')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const labelCls = "text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50"

  return (
    <Card className="border-2 border-border/60 shadow-xl rounded-[2.5rem] overflow-hidden">
      <CardHeader className="p-8 border-b border-border/40 bg-muted/10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
            <Eye size={24} strokeWidth={2.5} />
          </div>
          <div>
            <CardTitle className="text-xl font-bold tracking-tight">Información del Club</CardTitle>
            <p className="text-xs text-muted-foreground font-medium">Nombre, visibilidad y mensaje de bienvenida</p>
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
              <Label className={labelCls}>Nombre del club</Label>
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
              <Label className={labelCls}>Límite de miembros</Label>
              <div className="flex items-center gap-2 h-12 px-4 rounded-xl bg-muted/20 border-2 border-border/60">
                <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 font-bold">
                  Según tu plan
                </Badge>
                <span className="text-sm text-muted-foreground font-medium">
                  {plan === 'trial' ? '30 miembros' : plan === 'try' ? '150 miembros' : 'Ilimitado'}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className={labelCls}>Mensaje de bienvenida</Label>
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

        <div className="flex items-center gap-3 pt-6 border-t border-border/40">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest px-10 h-14 rounded-2xl shadow-xl shadow-primary/20 transition-all active:scale-95 disabled:opacity-50"
          >
            {saving ? <Loader2 className="animate-spin h-5 w-5" /> : <><Save size={18} className="mr-2" /> Guardar</>}
          </Button>
        </div>

      </CardContent>
    </Card>
  )
}
