'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export default function NewTenantForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '',
    slug: '',
    plan: 'try',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
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
        body: JSON.stringify({ name: form.name, slug: form.slug, plan: form.plan }),
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
            <label className="text-zinc-400 text-sm block mb-1.5">Plan</label>
            <select value={form.plan}
              onChange={e => setForm(p => ({ ...p, plan: e.target.value }))}
              className="w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-zinc-400">
              <option value="try">Probar — USD 250</option>
              <option value="buy">Comprar — USD 600</option>
              <option value="full">Full Access — USD 800</option>
            </select>
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