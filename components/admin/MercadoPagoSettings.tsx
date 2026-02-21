'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { CheckCircle, AlertCircle } from 'lucide-react'

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
      toast.success('Credenciales guardadas')
      setEditing(false)
      router.refresh()
    } catch {
      toast.error('Error al guardar credenciales')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="bg-zinc-800 border-zinc-700">
      <CardHeader>
        <CardTitle className="text-white text-base flex items-center gap-2">
          MercadoPago
          {isConfigured
            ? <CheckCircle size={16} className="text-green-400" />
            : <AlertCircle size={16} className="text-yellow-400" />
          }
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isConfigured && !editing ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle size={16} className="text-green-400" />
              <p className="text-green-400 text-sm">MercadoPago configurado correctamente</p>
            </div>
            <Button variant="outline"
              className="border-zinc-600 text-zinc-400 hover:text-white"
              onClick={() => setEditing(true)}>
              Actualizar credenciales
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 mb-4">
              <p className="text-yellow-400 text-xs">
                Ingresá las credenciales de tu cuenta de MercadoPago. Las podés encontrar en{' '}
                <a href="https://www.mercadopago.com.ar/developers/panel/app"
                  target="_blank" className="underline">
                  Tu Panel de Desarrolladores
                </a>
              </p>
            </div>

            <div>
              <label className="text-zinc-400 text-sm block mb-1.5">Access Token *</label>
              <input
                required
                type="password"
                value={form.accessToken}
                onChange={e => setForm(p => ({ ...p, accessToken: e.target.value }))}
                placeholder="APP_USR-..."
                className="w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-zinc-400 font-mono"
              />
            </div>

            <div>
              <label className="text-zinc-400 text-sm block mb-1.5">Public Key *</label>
              <input
                required
                value={form.publicKey}
                onChange={e => setForm(p => ({ ...p, publicKey: e.target.value }))}
                placeholder="APP_USR-..."
                className="w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-zinc-400 font-mono"
              />
            </div>

            <div className="flex gap-3">
              {isConfigured && (
                <Button type="button" variant="outline"
                  className="border-zinc-600 text-zinc-400"
                  onClick={() => setEditing(false)}>
                  Cancelar
                </Button>
              )}
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? 'Guardando...' : 'Guardar credenciales'}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}