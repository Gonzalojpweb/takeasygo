'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Loader2, Smartphone, CreditCard, QrCode, Bell, Save } from 'lucide-react'
import { toast } from 'sonner'
import { cn, fmt } from '@/lib/utils'
import { markGeofenceNotified } from '@/components/feedback/GeofenceFeedback'

interface Props {
  tenantSlug: string
  initial: {
    clubName?: string
    wallet?: {
      enabled: boolean
      cardColor: string
      labelColor: string
      logoUrl: string
      geofenceRadius?: number
      geofenceMessage?: string
    }
  }
}

export default function WalletDesignSettings({ tenantSlug, initial }: Props) {
  const [walletEnabled, setWalletEnabled] = useState(initial?.wallet?.enabled ?? false)
  const [cardColor, setCardColor] = useState(initial?.wallet?.cardColor ?? '#000000')
  const [labelColor, setLabelColor] = useState(initial?.wallet?.labelColor ?? '#FFFFFF')
  const [walletLogoUrl, setWalletLogoUrl] = useState(initial?.wallet?.logoUrl ?? '')
  const [geofenceRadius, setGeofenceRadius] = useState(initial?.wallet?.geofenceRadius ?? 500)
  const [geofenceMessage, setGeofenceMessage] = useState(initial?.wallet?.geofenceMessage ?? '')
  const [notificationTitle, setNotificationTitle] = useState('')
  const [notificationBody, setNotificationBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [sendingNotification, setSendingNotification] = useState(false)

  const clubName = initial?.clubName ?? ''

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/loyalty/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: {
            enabled: walletEnabled,
            cardColor,
            labelColor,
            logoUrl: walletLogoUrl,
            geofenceRadius,
            geofenceMessage,
          }
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Error al guardar')
      toast.success('Wallet actualizada')
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
          title: notificationTitle || `Estás cerca de ${clubName || 'nuestro local'}`,
          body: notificationBody || 'No olvides que con tus puntos también puedes visitarnos y canjear. Valida nuestras promociones actuales.',
          geofenceRadius,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Error al enviar')
      toast.success('Notificación de proximidad enviada')
      markGeofenceNotified()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSendingNotification(false)
    }
  }

  const labelCls = "text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50"

  return (
    <div className="space-y-8">
      {/* ── WALLET DIGITAL ── */}
      <Card className="border-2 border-border/60 shadow-xl rounded-[2.5rem] overflow-hidden">
        <CardHeader className="p-8 border-b border-border/40 bg-muted/10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center text-violet-500">
              <Smartphone size={24} strokeWidth={2.5} />
            </div>
            <div>
              <CardTitle className="text-xl font-bold tracking-tight">Wallet Digital</CardTitle>
              <p className="text-xs text-muted-foreground font-medium">Google Wallet & Apple Wallet para tus clientes</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-8 space-y-8">

          <div className="flex items-center justify-between p-6 rounded-2xl bg-muted/30 border border-border/40">
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
                <Label className={labelCls}>Color de tarjeta</Label>
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
                <Label className={labelCls}>Color de texto</Label>
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
              <Label className={labelCls}>URL del logo</Label>
              <Input
                value={walletLogoUrl}
                onChange={e => setWalletLogoUrl(e.target.value)}
                placeholder="https://..."
                className="bg-muted/40 border-2 border-border/60 focus:border-primary/40 h-12 rounded-xl text-sm font-medium"
              />
              <p className="text-[10px] text-muted-foreground/50">Se usará el logo del branding si está vacío</p>
            </div>

            {/* Preview de la tarjeta */}
            <div className="space-y-2">
              <Label className={labelCls}>Preview</Label>
              <div className="rounded-2xl p-6 text-white shadow-xl" style={{ backgroundColor: cardColor, color: labelColor }}>
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
        </CardContent>
      </Card>

      {/* ── GEOFENCING Y PROXIMIDAD ── */}
      {walletEnabled && (
        <Card className="border-2 border-border/60 shadow-xl rounded-[2.5rem] overflow-hidden">
          <CardHeader className="p-8 border-b border-border/40 bg-muted/10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                <Bell size={24} strokeWidth={2.5} />
              </div>
              <div>
                <CardTitle className="text-xl font-bold tracking-tight">Geofencing y Proximidad</CardTitle>
                <p className="text-xs text-muted-foreground font-medium">Notificaciones automáticas cuando un miembro está cerca</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div className="space-y-4 p-6 rounded-2xl bg-muted/30 border border-border/40">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className={labelCls}>Radio (metros)</Label>
                  <Input
                    type="number"
                    value={geofenceRadius}
                    onChange={e => setGeofenceRadius(Number(e.target.value))}
                    min={50} max={5000}
                    className="bg-muted/40 border-2 border-border/60 focus:border-primary/40 h-12 rounded-xl text-sm font-medium"
                  />
                </div>
                <div className="space-y-2">
                  <Label className={labelCls}>Mensaje por defecto</Label>
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
                <Label className={labelCls}>Título (opcional)</Label>
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
                <Label className={labelCls}>Mensaje (opcional)</Label>
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
          </CardContent>
        </Card>
      )}

      {/* Botón guardar */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest px-10 h-14 rounded-2xl shadow-xl shadow-primary/20 transition-all active:scale-95 disabled:opacity-50"
        >
          {saving ? <Loader2 className="animate-spin h-5 w-5" /> : <><Save size={18} className="mr-2" /> Guardar wallet</>}
        </Button>
      </div>
    </div>
  )
}
