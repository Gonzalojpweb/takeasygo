'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'

interface Props {
  tenant: any
}

export default function EditTenantForm({ tenant }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [form, setForm] = useState({
    name: tenant.name,
    slug: tenant.slug,
    plan: tenant.plan,
    isActive: tenant.isActive,
  })

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch(`/api/superadmin/tenants/${tenant._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      toast.success('Tenant actualizado')
      router.push('/superadmin/tenants')
      router.refresh()
    } catch {
      toast.error('Error al actualizar')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar permanentemente el tenant "${tenant.name}"?\nEsta acción no se puede deshacer.`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/superadmin/tenants/${tenant._id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Tenant eliminado')
      router.push('/superadmin/tenants')
      router.refresh()
    } catch {
      toast.error('Error al eliminar')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="bg-zinc-800 border-zinc-700">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-zinc-400 text-sm block mb-1.5">Nombre del restaurante</label>
              <input required value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-zinc-400" />
            </div>

            <div>
              <label className="text-zinc-400 text-sm block mb-1.5">Slug (URL)</label>
              <input required value={form.slug}
                onChange={e => setForm(p => ({ ...p, slug: e.target.value }))}
                className="w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-zinc-400 font-mono" />
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

            <div className="flex items-center justify-between py-2">
              <label className="text-zinc-400 text-sm">Tenant activo</label>
              <button type="button"
                onClick={() => setForm(p => ({ ...p, isActive: !p.isActive }))}
                className={`w-11 h-6 rounded-full transition-colors ${form.isActive ? 'bg-green-500' : 'bg-zinc-600'}`}>
                <div className={`w-4 h-4 rounded-full bg-white mx-1 transition-transform ${form.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline"
                className="flex-1 border-zinc-600 text-zinc-400"
                onClick={() => router.back()}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="bg-zinc-800 border-red-900/40">
        <CardContent className="pt-6">
          <p className="text-red-400 text-sm font-semibold mb-1">Zona de peligro</p>
          <p className="text-zinc-500 text-xs mb-4">
            Eliminar el tenant borra permanentemente el restaurante y todos sus datos del sistema. Esta acción no se puede deshacer.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={deleting}
            onClick={handleDelete}
            className="border-red-800 text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:border-red-700 w-full">
            <Trash2 size={14} className="mr-2" />
            {deleting ? 'Eliminando...' : `Eliminar "${tenant.name}"`}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
