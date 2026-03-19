'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { PLAN_LABELS, PLAN_TAGLINES, PLAN_PRICE } from '@/lib/plans'
import type { Plan } from '@/lib/plans'

const PLAN_FEATURES_SHORT: Record<Plan, string[]> = {
  trial:     ['Menú + pedidos takeaway', 'Panel básico de órdenes', 'Hasta 30 pedidos → Informe ICO gratis'],
  try:       ['Menú + pedidos + MercadoPago', 'Impresión automática en cocina', '1 sede / 1 impresora'],
  buy:       ['Todo Inicial incluido', 'Reportes, múltiples sedes y usuarios', 'ICO — Fiabilidad Operativa'],
  full:      ['Todo Crecimiento incluido', 'Analytics avanzados + TPP + horarios', 'ICO diagnóstico completo'],
  anfitrion: ['Dashboard + Menú digital', 'Configuración del restaurante', 'Facturación y suscripción'],
}

export default function NewTenantForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '',
    slug: '',
    plan: 'trial',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    featuresReservations: false,
  })

  function handleNameChange(name: string) {
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    setForm(p => ({ ...p, name, slug }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      // Crear tenant
      const tenantRes = await fetch('/api/superadmin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug,
          plan: form.plan,
          features: { reservations: form.featuresReservations },
        }),
      })
      if (!tenantRes.ok) {
        const err = await tenantRes.json()
        throw new Error(err.error || 'Error al crear tenant')
      }
      const { tenant } = await tenantRes.json()

      // Crear usuario admin del tenant
      const userRes = await fetch('/api/superadmin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.adminName,
          email: form.adminEmail,
          password: form.adminPassword,
          role: 'admin',
          tenantId: tenant._id,
        }),
      })
      if (!userRes.ok) throw new Error('Error al crear usuario admin')

      toast.success(`Tenant "${form.name}" creado`)
      router.push('/superadmin/tenants')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="bg-zinc-800 border-zinc-700">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-zinc-400 text-sm block mb-1.5">Nombre del restaurante *</label>
            <input required value={form.name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="Ej: Burguer House"
              className="w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-zinc-400" />
          </div>

          <div>
            <label className="text-zinc-400 text-sm block mb-1.5">Slug (URL)</label>
            <input required value={form.slug}
              onChange={e => setForm(p => ({ ...p, slug: e.target.value }))}
              placeholder="burguer-house"
              className="w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-zinc-400 font-mono" />
            <p className="text-zinc-600 text-xs mt-1">tudominio.com/{form.slug || 'slug'}/menu</p>
          </div>

          <div>
            <label className="text-zinc-400 text-sm block mb-2">Plan</label>
            <div className="flex flex-col gap-2">
              {(['anfitrion', 'trial', 'try', 'buy', 'full'] as Plan[]).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, plan: p }))}
                  className={cn(
                    'text-left px-4 py-3 rounded-xl border-2 transition-all flex items-center gap-4',
                    form.plan === p
                      ? 'border-primary bg-primary/10'
                      : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-500'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={cn('font-bold text-sm', form.plan === p ? 'text-primary' : 'text-white')}>{PLAN_LABELS[p]}</p>
                      {p === 'trial' ? (
                        <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400">Prueba gratuita</span>
                      ) : p === 'anfitrion' ? (
                        <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">Lanzamiento · {PLAN_PRICE[p]}</span>
                      ) : (
                        <p className="text-zinc-500 text-[10px] font-bold">{PLAN_PRICE[p]}</p>
                      )}
                    </div>
                    <p className="text-zinc-500 text-xs mt-0.5 truncate">{PLAN_FEATURES_SHORT[p][0]}</p>
                  </div>
                  <div className={cn(
                    'w-4 h-4 rounded-full border-2 shrink-0 transition-all',
                    form.plan === p ? 'border-primary bg-primary' : 'border-zinc-600'
                  )} />
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-zinc-700 pt-4">
            <p className="text-zinc-400 text-sm font-medium mb-3">Módulos adicionales</p>
            <div className="flex items-center justify-between px-4 py-3 bg-zinc-700/50 border border-zinc-600 rounded-xl">
              <div>
                <p className="text-white text-sm font-bold">Reservaciones</p>
                <p className="text-zinc-500 text-xs">Habilitar módulo de reservas de mesa</p>
              </div>
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, featuresReservations: !p.featuresReservations }))}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${form.featuresReservations ? 'bg-primary' : 'bg-zinc-600'}`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform duration-200 ${form.featuresReservations ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>

          <div className="border-t border-zinc-700 pt-4">
            <p className="text-zinc-400 text-sm font-medium mb-3">Usuario Admin del restaurante</p>
            <div className="space-y-3">
              <input required value={form.adminName}
                onChange={e => setForm(p => ({ ...p, adminName: e.target.value }))}
                placeholder="Nombre *"
                className="w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-zinc-400" />
              <input required type="email" value={form.adminEmail}
                onChange={e => setForm(p => ({ ...p, adminEmail: e.target.value }))}
                placeholder="Email *"
                className="w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-zinc-400" />
              <input required type="password" value={form.adminPassword}
                onChange={e => setForm(p => ({ ...p, adminPassword: e.target.value }))}
                placeholder="Contraseña *"
                className="w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-zinc-400" />
            </div>
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Creando...' : 'Crear tenant'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}