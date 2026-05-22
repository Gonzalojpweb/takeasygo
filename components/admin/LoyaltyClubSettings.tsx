'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Loader2, QrCode, Save, Eye, EyeOff, Smartphone, Palette, CreditCard, Percent, Calculator, Bell } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { canAccess } from '@/lib/plans'

interface Props {
  tenantSlug: string
  plan?: string
  initial?: {
    enabled: boolean
    clubName: string
    welcomeMessage: string
    sosLimit?: number
    wallet?: {
      enabled: boolean
      cardColor: string
      labelColor: string
      logoUrl: string
      geofenceRadius?: number
      geofenceMessage?: string
    }
    pointsConfig?: {
      enabled: boolean
      mode: 'fixed_per_currency' | 'percentage' | 'hybrid'
      pointsPerCurrency: number
      pointsPercentage: number
      pointsPerOrder: number
      minOrderForPoints: number
      pointsRedemptionValue: number
      redemptionEnabled: boolean
    }
  }
  sosMaxLimit?: number
}

const SOURCE_LABELS: Record<string, string> = {
  checkout:      'En caja',
  qr_scan:       'Escaneo QR',
  admin:         'Manual admin',
  manual_import: 'Importación',
}

export default function LoyaltyClubSettings({ tenantSlug, initial, plan, sosMaxLimit = 0 }: Props) {
  const [enabled, setEnabled]       = useState(initial?.enabled ?? false)
  const [clubName, setClubName]     = useState(initial?.clubName ?? '')
  const [welcomeMsg, setWelcomeMsg] = useState(initial?.welcomeMessage ?? '')
  const [loading, setLoading]       = useState(false)
  const [saving, setSaving]         = useState(false)
  const [sosLimit, setSosLimit]     = useState(initial?.sosLimit ?? 0)
  
  // Wallet states
  const [walletEnabled, setWalletEnabled] = useState(initial?.wallet?.enabled ?? false)
  const [cardColor, setCardColor]         = useState(initial?.wallet?.cardColor ?? '#000000')
  const [labelColor, setLabelColor]       = useState(initial?.wallet?.labelColor ?? '#FFFFFF')
  const [walletLogoUrl, setWalletLogoUrl] = useState(initial?.wallet?.logoUrl ?? '')

  // Points config states
  const [pointsEnabled, setPointsEnabled] = useState(initial?.pointsConfig?.enabled ?? false)
  const [pointsMode, setPointsMode] = useState<'fixed_per_currency' | 'percentage' | 'hybrid'>(initial?.pointsConfig?.mode ?? 'fixed_per_currency')
  const [pointsPerCurrency, setPointsPerCurrency] = useState(initial?.pointsConfig?.pointsPerCurrency ?? 0.1)
  const [pointsPercentage, setPointsPercentage] = useState(initial?.pointsConfig?.pointsPercentage ?? 10)
  const [pointsPerOrder, setPointsPerOrder] = useState(initial?.pointsConfig?.pointsPerOrder ?? 0)
  const [minOrderForPoints, setMinOrderForPoints] = useState(initial?.pointsConfig?.minOrderForPoints ?? 0)
  const [pointsRedemptionValue, setPointsRedemptionValue] = useState(initial?.pointsConfig?.pointsRedemptionValue ?? 10)
  const [redemptionEnabled, setRedemptionEnabled] = useState(initial?.pointsConfig?.redemptionEnabled ?? true)

  // Geofencing states
  const [geofenceRadius, setGeofenceRadius] = useState(500)
  const [geofenceMessage, setGeofenceMessage] = useState('')

  // Proximity notification states
  const [notificationTitle, setNotificationTitle] = useState('')
  const [notificationBody, setNotificationBody] = useState('')
  const [sendingNotification, setSendingNotification] = useState(false)

  useEffect(() => {
    if (initial) {
      setEnabled(initial.enabled)
      setClubName(initial.clubName)
      setWelcomeMsg(initial.welcomeMessage)
      setSosLimit(initial.sosLimit ?? 0)
      setWalletEnabled(initial.wallet?.enabled ?? false)
      setCardColor(initial.wallet?.cardColor ?? '#000000')
      setLabelColor(initial.wallet?.labelColor ?? '#FFFFFF')
      setWalletLogoUrl(initial.wallet?.logoUrl ?? '')
      setGeofenceRadius(initial.wallet?.geofenceRadius ?? 500)
      setGeofenceMessage(initial.wallet?.geofenceMessage ?? '')
      setPointsEnabled(initial.pointsConfig?.enabled ?? false)
      setPointsMode(initial.pointsConfig?.mode ?? 'fixed_per_currency')
      setPointsPerCurrency(initial.pointsConfig?.pointsPerCurrency ?? 0.1)
      setPointsPercentage(initial.pointsConfig?.pointsPercentage ?? 10)
      setPointsPerOrder(initial.pointsConfig?.pointsPerOrder ?? 0)
      setMinOrderForPoints(initial.pointsConfig?.minOrderForPoints ?? 0)
      setPointsRedemptionValue(initial.pointsConfig?.pointsRedemptionValue ?? 10)
      setRedemptionEnabled(initial.pointsConfig?.redemptionEnabled ?? true)
    }
  }, [initial])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/loyalty/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          clubName,
          welcomeMessage: welcomeMsg,
          sosLimit,
          wallet: {
            enabled: walletEnabled,
            cardColor,
            labelColor,
            logoUrl: walletLogoUrl,
            geofenceRadius,
            geofenceMessage,
          },
          pointsConfig: {
            enabled: pointsEnabled,
            mode: pointsMode,
            pointsPerCurrency,
            pointsPercentage,
            pointsPerOrder,
            minOrderForPoints,
            pointsRedemptionValue,
            redemptionEnabled
          }
        }),
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

  async function handleSendProximityNotification() {
    setSendingNotification(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/loyalty/notifications/proximity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: notificationTitle || undefined,
          body: notificationBody || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al enviar notificaciones')
      toast.success(`Notificaciones enviadas: ${data.sent}`)
      setNotificationTitle('')
      setNotificationBody('')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSendingNotification(false)
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

        {/* ─────────────────────────────────────────────────────────────────────
            WALLET DIGITAL
        ───────────────────────────────────────────────────────────────────── */}
        <div className="pt-6 border-t border-border/40">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center text-violet-500">
              <Smartphone size={24} strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="text-base font-bold">Wallet Digital</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Google Wallet & Apple Wallet para tus clientes
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between p-6 rounded-2xl bg-muted/30 border border-border/40 mb-6">
            <div className="flex items-center gap-4">
              <div className={cn(
                'w-12 h-12 rounded-2xl flex items-center justify-center transition-colors',
                walletEnabled ? 'bg-violet-500/10 text-violet-500' : 'bg-muted text-muted-foreground'
              )}>
                <CreditCard size={24} />
              </div>
              <div>
                <Label className="text-base font-bold cursor-pointer" htmlFor="wallet-enabled">
                  {walletEnabled ? 'Wallet activo' : 'Wallet desactivado'}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {walletEnabled
                    ? 'Los clientes pueden agregar su tarjeta a Google/Apple Wallet.'
                    : 'Activalo para que los clientes tengan su tarjeta digital.'}
                </p>
              </div>
            </div>
            <Switch
              id="wallet-enabled"
              checked={walletEnabled}
              onCheckedChange={setWalletEnabled}
              className="data-[state=checked]:bg-violet-500"
            />
          </div>

          <div className={cn('space-y-6 transition-opacity', walletEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none')}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">
                  Color de tarjeta
                </Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={cardColor}
                    onChange={e => setCardColor(e.target.value)}
                    className="w-12 h-12 rounded-xl cursor-pointer border-2 border-border/60"
                  />
                  <Input
                    value={cardColor}
                    onChange={e => setCardColor(e.target.value)}
                    placeholder="#000000"
                    className="flex-1 bg-muted/40 border-2 border-border/60 focus:border-primary/40 h-12 rounded-xl text-sm font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">
                  Color de texto
                </Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={labelColor}
                    onChange={e => setLabelColor(e.target.value)}
                    className="w-12 h-12 rounded-xl cursor-pointer border-2 border-border/60"
                  />
                  <Input
                    value={labelColor}
                    onChange={e => setLabelColor(e.target.value)}
                    placeholder="#FFFFFF"
                    className="flex-1 bg-muted/40 border-2 border-border/60 focus:border-primary/40 h-12 rounded-xl text-sm font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">
                URL del logo
              </Label>
              <Input
                value={walletLogoUrl}
                onChange={e => setWalletLogoUrl(e.target.value)}
                placeholder="https://..."
                className="bg-muted/40 border-2 border-border/60 focus:border-primary/40 h-12 rounded-xl text-sm font-medium"
              />
              <p className="text-[10px] text-muted-foreground/50">
                Se usará el logo del branding si está vacío
              </p>
            </div>

            {/* Preview de la tarjeta */}
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">
                Preview
              </Label>
              <div 
                className="rounded-2xl p-6 text-white shadow-xl"
                style={{ backgroundColor: cardColor, color: labelColor }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider opacity-70">Club de Fidelización</p>
                    <h3 className="text-lg font-bold">{clubName || 'Tu Restaurante'}</h3>
                  </div>
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <QrCode size={20} />
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-black">1,250</p>
                    <p className="text-xs uppercase tracking-wider opacity-70">Puntos</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">Oro</p>
                    <p className="text-xs uppercase tracking-wider opacity-70">Nivel</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────────────
            SISTEMA DE PUNTOS
        ───────────────────────────────────────────────────────────────────── */}
        <div className="pt-6 border-t border-border/40">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-500">
              <Calculator size={24} strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="text-base font-bold">Sistema de Puntos</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configurá cómo se acumulan puntos automáticamente
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between p-6 rounded-2xl bg-muted/30 border border-border/40 mb-6">
            <div className="flex items-center gap-4">
              <div className={cn(
                'w-12 h-12 rounded-2xl flex items-center justify-center transition-colors',
                pointsEnabled ? 'bg-orange-500/10 text-orange-500' : 'bg-muted text-muted-foreground'
              )}>
                <Percent size={24} />
              </div>
              <div>
                <Label className="text-base font-bold cursor-pointer" htmlFor="points-enabled">
                  {pointsEnabled ? 'Puntos activos' : 'Puntos desactivados'}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {pointsEnabled
                    ? 'Los puntos se suman automáticamente después de cada pago.'
                    : 'Activalo para que los clientes acumulen puntos en sus compras.'}
                </p>
              </div>
            </div>
            <Switch
              id="points-enabled"
              checked={pointsEnabled}
              onCheckedChange={setPointsEnabled}
              className="data-[state=checked]:bg-orange-500"
            />
          </div>

          <div className={cn('space-y-6 transition-opacity', pointsEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none')}>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">
                Modo de cálculo
              </Label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setPointsMode('fixed_per_currency')}
                  className={cn(
                    'p-4 rounded-xl border-2 text-left transition-all',
                    pointsMode === 'fixed_per_currency'
                      ? 'border-orange-500 bg-orange-500/10'
                      : 'border-border/60 bg-muted/20 hover:border-border/80'
                  )}
                >
                  <p className="font-bold text-sm mb-1">Fijo por monto</p>
                  <p className="text-xs text-muted-foreground">1 punto cada $10</p>
                </button>
                <button
                  type="button"
                  onClick={() => setPointsMode('percentage')}
                  className={cn(
                    'p-4 rounded-xl border-2 text-left transition-all',
                    pointsMode === 'percentage'
                      ? 'border-orange-500 bg-orange-500/10'
                      : 'border-border/60 bg-muted/20 hover:border-border/80'
                  )}
                >
                  <p className="font-bold text-sm mb-1">Porcentaje</p>
                  <p className="text-xs text-muted-foreground">10% del monto</p>
                </button>
                <button
                  type="button"
                  onClick={() => setPointsMode('hybrid')}
                  className={cn(
                    'p-4 rounded-xl border-2 text-left transition-all',
                    pointsMode === 'hybrid'
                      ? 'border-orange-500 bg-orange-500/10'
                      : 'border-border/60 bg-muted/20 hover:border-border/80'
                  )}
                >
                  <p className="font-bold text-sm mb-1">Híbrido</p>
                  <p className="text-xs text-muted-foreground">Ambos métodos</p>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {pointsMode === 'fixed_per_currency' || pointsMode === 'hybrid' ? (
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">
                    Puntos por cada $1
                  </Label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={pointsPerCurrency}
                      onChange={e => setPointsPerCurrency(parseFloat(e.target.value) || 0)}
                      className="bg-muted/40 border-2 border-border/60 focus:border-primary/40 h-12 rounded-xl text-sm font-medium"
                    />
                    <div className="text-xs text-muted-foreground font-medium whitespace-nowrap">
                      Ej: 0.1 = 1 punto cada $10
                    </div>
                  </div>
                </div>
              ) : null}

              {pointsMode === 'percentage' || pointsMode === 'hybrid' ? (
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">
                    Porcentaje del monto
                  </Label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      value={pointsPercentage}
                      onChange={e => setPointsPercentage(parseFloat(e.target.value) || 0)}
                      className="bg-muted/40 border-2 border-border/60 focus:border-primary/40 h-12 rounded-xl text-sm font-medium"
                    />
                    <div className="text-xs text-muted-foreground font-medium whitespace-nowrap">
                      % del monto
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">
                  Puntos fijos por pedido
                </Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min="0"
                    value={pointsPerOrder}
                    onChange={e => setPointsPerOrder(parseInt(e.target.value) || 0)}
                    className="bg-muted/40 border-2 border-border/60 focus:border-primary/40 h-12 rounded-xl text-sm font-medium"
                  />
                  <div className="text-xs text-muted-foreground font-medium whitespace-nowrap">
                    Opcional
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">
                  Monto mínimo
                </Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={minOrderForPoints}
                    onChange={e => setMinOrderForPoints(parseFloat(e.target.value) || 0)}
                    className="bg-muted/40 border-2 border-border/60 focus:border-primary/40 h-12 rounded-xl text-sm font-medium"
                  />
                  <div className="text-xs text-muted-foreground font-medium whitespace-nowrap">
                    $ mínimo
                  </div>
                </div>
              </div>

               <div className="space-y-2">
                 <Label className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">
                   Valor de canje (ARS)
                 </Label>
                 <div className="flex items-center gap-3">
                   <Input
                     type="number"
                     min="0"
                     step="1"
                     value={pointsRedemptionValue}
                     onChange={e => setPointsRedemptionValue(parseInt(e.target.value) || 0)}
                     className="bg-muted/40 border-2 border-border/60 focus:border-primary/40 h-12 rounded-xl text-sm font-medium"
                   />
                   <div className="text-xs text-muted-foreground font-medium whitespace-nowrap">
                     $ cada 1 punto
                   </div>
                 </div>
               </div>

               <div className="flex items-center justify-between p-6 rounded-2xl bg-muted/30 border border-border/40">
                 <div className="flex items-center gap-4">
                   <div className={cn(
                     'w-12 h-12 rounded-2xl flex items-center justify-center transition-colors',
                     redemptionEnabled ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'
                   )}>
                     <Percent size={24} />
                   </div>
                   <div>
                     <Label className="text-base font-bold cursor-pointer" htmlFor="redemption-enabled">
                       {redemptionEnabled ? 'Canje activo' : 'Canje desactivado'}
                     </Label>
                     <p className="text-xs text-muted-foreground mt-0.5">
                       {redemptionEnabled
                         ? 'Los clientes pueden usar puntos en el checkout.'
                         : 'Desactivá para pausar el uso de puntos temporalmente.'}
                     </p>
                   </div>
                 </div>
                 <Switch
                   id="redemption-enabled"
                   checked={redemptionEnabled}
                   onCheckedChange={setRedemptionEnabled}
                   className="data-[state=checked]:bg-emerald-500"
                 />
               </div>
             </div>

            {/* Preview de cálculo */}
            <div className="p-4 rounded-xl bg-muted/20 border border-border/40">
              <Label className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50 mb-3">
                Ejemplo de cálculo
              </Label>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Monto del pedido:</span>
                  <span className="font-bold">$1,000</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Puntos ganados:</span>
                  <span className="font-bold text-orange-500">
                    {(() => {
                      const total = 1000
                      let points = 0
                      if (pointsMode === 'fixed_per_currency' || pointsMode === 'hybrid') {
                        points += Math.floor(total * pointsPerCurrency)
                      }
                      if (pointsMode === 'percentage' || pointsMode === 'hybrid') {
                        points += Math.floor(total * pointsPercentage / 100)
                      }
                      points += pointsPerOrder
                      return points.toLocaleString()
                    })()} puntos
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────────────
            MECANISMO SOS
        ───────────────────────────────────────────────────────────────────── */}
        <div className="pt-6 border-t border-border/40">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500">
              <span className="text-2xl font-black">SOS</span>
            </div>
            <div>
              <h3 className="text-base font-bold">Mecanismo SOS</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Permití que los clientes canjeen premios aunque les falten algunos puntos
              </p>
            </div>
          </div>

          {plan && canAccess(plan as any, 'sos') ? (
            <div className="space-y-4">
              {/* ── Slider principal ── */}
              <div className="p-6 rounded-2xl bg-muted/30 border border-border/40 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">
                      Reward Advance (SOS)
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      {sosLimit === 0
                        ? 'Desactivado — el cliente debe tener los puntos exactos'
                        : `Préstamo de hasta ${sosLimit.toLocaleString()} puntos`}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black tabular-nums">{sosLimit.toLocaleString()}</span>
                    <p className="text-[10px] text-muted-foreground">pts máx</p>
                  </div>
                </div>

                <div className="relative">
                  {/* Marcadores de zonas de referencia */}
                  <div className="absolute -top-4 left-0 right-0 flex justify-between px-0 pointer-events-none z-10">
                    {[0, 25, 50, 75, 100].map(pct => {
                      const val = Math.round((sosMaxLimit * pct) / 100)
                      return (
                        <div key={pct} className="flex flex-col items-center">
                          <div className="w-px h-3 bg-border/40" />
                          <span className="text-[9px] text-muted-foreground/50 mt-1">{val.toLocaleString()}</span>
                        </div>
                      )
                    })}
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={sosMaxLimit}
                    step={10}
                    value={sosLimit}
                    onChange={e => setSosLimit(parseInt(e.target.value) || 0)}
                    className="w-full h-2 bg-gradient-to-r from-emerald-400 via-amber-400 to-red-400 rounded-lg appearance-none cursor-pointer accent-red-500 mt-4"
                    style={{ backgroundSize: `${(sosLimit / Math.max(sosMaxLimit, 1)) * 100}% 100%` }}
                  />
                </div>

                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>0 (desactivado)</span>
                  <span>Límite superadmin: {sosMaxLimit.toLocaleString()}</span>
                </div>

                {sosLimit > 0 && (
                  <>
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <p className="text-xs text-amber-700 font-medium">
                        Si al cliente le faltan hasta {sosLimit.toLocaleString()} puntos para un premio, 
                        el sistema le presta los puntos y su saldo queda en negativo. 
                        Deberá volver a comprar para liberar la deuda.
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* ── Asesoría: Matriz de referencia ── */}
              <div className="p-5 rounded-2xl bg-blue-500/[0.04] border border-blue-500/20 space-y-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 shrink-0 mt-0.5 text-xs font-bold">i</div>
                  <div>
                    <p className="text-xs font-bold text-blue-700">Asesoría de configuración</p>
                    <p className="text-[11px] text-blue-600/70 mt-0.5">
                      El Reward Advance (SOS) deja que el cliente canjee aunque le falten puntos. 
                      El sistema le presta la diferencia y su saldo queda negativo hasta que complete una compra.
                      Acá hay referencias según el ticket promedio de tu negocio:
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { ticket: '$5.000', label: 'Cafetería básica', sos: 280, max: 350 },
                    { ticket: '$8.000', label: 'Café especialidad', sos: 440, max: 550 },
                    { ticket: '$18.000', label: 'Hamburguesería', sos: 1000, max: 1200 },
                    { ticket: '$28.000', label: 'Pizzería gourmet', sos: 1500, max: 1800 },
                  ].map((esc, i) => {
                    const isSelected = sosLimit >= esc.sos && sosLimit <= esc.max
                    const isNear = !isSelected && Math.abs(sosLimit - esc.sos) <= 100
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSosLimit(Math.min(esc.sos, sosMaxLimit))}
                        className={cn(
                          'text-left p-3 rounded-xl border-2 transition-all',
                          isSelected
                            ? 'border-blue-500 bg-blue-500/10'
                            : isNear
                              ? 'border-blue-300/50 bg-blue-500/5'
                              : 'border-border/40 bg-white/40 hover:border-blue-300/50'
                        )}
                      >
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">{esc.label}</p>
                        <p className="text-lg font-black tabular-nums mt-0.5">{esc.sos.toLocaleString()}</p>
                        <p className="text-[10px] text-muted-foreground">Ticket {esc.ticket} · Máx {esc.max}</p>
                      </button>
                    )
                  })}
                </div>

                <div className="flex items-center gap-2 text-[11px] text-blue-600/60">
                  <span>Hacé clic en el escenario que más se parezca a tu negocio para aplicar su SOS recomendado.</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 rounded-2xl bg-muted/30 border border-border/40 opacity-60">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">
                    Reward Advance (SOS)
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Disponible en plan Crecimiento y Premium. Actualizá tu plan para acceder.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ─────────────────────────────────────────────────────────────────────
            GEOFENCING (configuración automática)
        ───────────────────────────────────────────────────────────────────── */}
        {walletEnabled && (
          <div className="pt-6 border-t border-border/40">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                <Bell size={24} strokeWidth={2.5} />
              </div>
              <div>
                <h3 className="text-base font-bold">Geofencing y Proximidad</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Notificaciones automáticas cuando un miembro está cerca
                </p>
              </div>
            </div>

            <div className="space-y-4 p-6 rounded-2xl bg-muted/30 border border-border/40">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">
                    Radio (metros)
                  </Label>
                  <Input
                    type="number"
                    value={geofenceRadius}
                    onChange={e => setGeofenceRadius(Number(e.target.value))}
                    min={50}
                    max={5000}
                    className="bg-muted/40 border-2 border-border/60 focus:border-primary/40 h-12 rounded-xl text-sm font-medium"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">
                    Mensaje por defecto
                  </Label>
                  <Input
                    value={geofenceMessage}
                    onChange={e => setGeofenceMessage(e.target.value)}
                    placeholder={`¡Estás cerca de ${clubName}!`}
                    maxLength={120}
                    className="bg-muted/40 border-2 border-border/60 focus:border-primary/40 h-12 rounded-xl text-sm font-medium"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">
                  Título (opcional)
                </Label>
                <Input
                  value={notificationTitle}
                  onChange={e => setNotificationTitle(e.target.value)}
                  placeholder={`Estás cerca de ${clubName || 'nuestro local'}`}
                  maxLength={100}
                  className="bg-muted/40 border-2 border-border/60 focus:border-primary/40 h-12 rounded-xl text-sm font-medium"
                />
                <p className="text-[10px] text-muted-foreground/50 text-right">{notificationTitle.length}/100</p>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">
                  Mensaje (opcional)
                </Label>
                <textarea
                  value={notificationBody}
                  onChange={e => setNotificationBody(e.target.value.slice(0, 200))}
                  placeholder="No olvides que con tus puntos también puedes visitarnos y canjear. Valida nuestras promociones actuales."
                  maxLength={200}
                  rows={2}
                  className="w-full bg-muted/40 border-2 border-border/60 focus:border-primary/40 rounded-xl px-4 py-3 text-sm font-medium outline-none transition-all resize-none"
                />
                <p className="text-[10px] text-muted-foreground/50 text-right">{notificationBody.length}/200</p>
              </div>

              <Button
                onClick={handleSendProximityNotification}
                disabled={sendingNotification}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold uppercase tracking-widest h-12 rounded-xl shadow-lg shadow-blue-500/20 transition-all active:scale-95"
              >
                {sendingNotification ? <Loader2 className="animate-spin h-5 w-5" /> : <Bell size={16} className="mr-2" />}
                {sendingNotification ? 'Enviando...' : 'Enviar notificación'}
              </Button>
            </div>
          </div>
        )}

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
