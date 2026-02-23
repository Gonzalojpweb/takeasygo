'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { CheckCircle2, AlertCircle, ExternalLink, ShieldCheck, Key, Lock, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  tenantSlug: string
  isConfigured: boolean
}

export default function MercadoPagoSettings({ tenantSlug, isConfigured }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ accessToken: '', publicKey: '' })
  const [editing, setEditing] = useState(!isConfigured)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/settings/mercadopago`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      toast.success('Credenciales guardadas correctamente')
      setEditing(false)
      router.refresh()
    } catch {
      toast.error('Error al guardar credenciales')
    } finally {
      setLoading(false)
    }
  }

  const labelCls = "text-[10px] uppercase font-bold tracking-[0.2em] text-muted-foreground/60 mb-2 block"
  const inputCls = 'w-full bg-muted/30 border-2 border-border/80 focus:border-primary/40 focus:bg-white text-foreground text-sm font-mono rounded-2xl px-4 py-3 outline-none transition-all shadow-sm'

  return (
    <Card className="bg-card border-border/60 shadow-xl rounded-[2.5rem] overflow-hidden">
      <CardHeader className="p-8 border-b border-border/40 bg-muted/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#009EE3]/10 flex items-center justify-center text-[#009EE3]">
              <ShieldCheck size={24} strokeWidth={2.5} />
            </div>
            <div>
              <CardTitle className="text-xl font-bold tracking-tight">Pasarela de Pagos</CardTitle>
              <p className="text-xs text-muted-foreground font-medium">Configura tu integración con Mercado Pago</p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border-2",
              isConfigured
                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                : "bg-amber-500/10 text-amber-500 border-amber-500/20"
            )}
          >
            {isConfigured ? 'Conectado' : 'Pendiente'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-8">
        {isConfigured && !editing ? (
          <div className="space-y-6">
            <div className="flex items-center gap-4 p-6 rounded-3xl bg-emerald-500/5 border-2 border-emerald-500/10">
              <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white shrink-0">
                <CheckCircle2 size={20} />
              </div>
              <div className="flex-1">
                <p className="text-emerald-700 font-bold text-sm">Tu cuenta está vinculada</p>
                <p className="text-emerald-600/70 text-xs font-medium">Los pagos se procesarán automáticamente a tu cuenta de Mercado Pago.</p>
              </div>
            </div>

            <div className="flex justify-start">
              <Button
                variant="outline"
                className="border-2 border-border/80 rounded-xl font-bold text-xs px-6 py-5 hover:bg-muted transition-all"
                onClick={() => setEditing(true)}
              >
                Actualizar credenciales de API
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="p-6 rounded-3xl bg-amber-500/5 border-2 border-amber-500/10 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                <AlertCircle size={80} />
              </div>
              <div className="flex gap-4">
                <AlertCircle className="text-amber-500 shrink-0 mt-0.5" size={18} />
                <div className="space-y-2">
                  <p className="text-amber-700 font-bold text-sm">Información de seguridad importante</p>
                  <p className="text-amber-600/80 text-xs font-medium leading-relaxed max-w-xl">
                    Para habilitar los cobros online, necesitás tus credenciales de producción.
                    Podés obtenerlas de forma gratuita y segura en
                    <a href="https://www.mercadopago.com.ar/developers/panel/app"
                      target="_blank"
                      className="text-amber-600 font-bold underline underline-offset-4 ml-1 inline-flex items-center gap-1 group">
                      Tu Panel de Mercado Pago Developers
                      <ExternalLink size={10} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    </a>
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className={labelCls}>
                  <div className="flex items-center gap-2">
                    <Lock size={10} /> Access Token
                  </div>
                </label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/40 group-focus-within:text-primary transition-colors">
                    <Key size={16} />
                  </div>
                  <input
                    required
                    type="password"
                    value={form.accessToken}
                    onChange={e => setForm(p => ({ ...p, accessToken: e.target.value }))}
                    placeholder="APP_USR-782..."
                    className={cn(inputCls, "pl-11")}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className={labelCls}>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={10} /> Public Key
                  </div>
                </label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/40 group-focus-within:text-primary transition-colors">
                    <Key size={16} />
                  </div>
                  <input
                    required
                    value={form.publicKey}
                    onChange={e => setForm(p => ({ ...p, publicKey: e.target.value }))}
                    placeholder="APP_USR-291..."
                    className={cn(inputCls, "pl-11")}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-6 border-t border-border/40">
              <Button
                type="submit"
                disabled={loading}
                className="bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest px-10 h-14 rounded-2xl shadow-xl shadow-primary/20 flex-1 sm:flex-none active:scale-95 disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin h-5 w-5" /> : 'Guardar Credenciales'}
              </Button>
              {isConfigured && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-muted-foreground font-bold px-8 h-14 rounded-2xl"
                  onClick={() => setEditing(false)}
                >
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

import { Badge } from '@/components/ui/badge'