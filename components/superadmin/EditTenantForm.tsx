'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Trash2, Store, Globe, CreditCard, ShieldAlert, ArrowLeft, Loader2, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

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
      toast.success('Tenant actualizado correctamente')
      router.push('/superadmin/tenants')
      router.refresh()
    } catch {
      toast.error('Error al actualizar el tenant')
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
      toast.success('Tenant eliminado del sistema')
      router.push('/superadmin/tenants')
      router.refresh()
    } catch {
      toast.error('Error al eliminar el tenant')
    } finally {
      setDeleting(false)
    }
  }

  const labelCls = "text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50 mb-2 block"
  const inputCls = "w-full bg-muted/40 border-2 border-border/60 focus:border-primary/40 focus:bg-white text-foreground text-sm font-medium rounded-2xl px-4 py-3 outline-none transition-all shadow-sm"

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Card className="bg-card border-2 border-border/60 shadow-xl rounded-[2.5rem] overflow-hidden">
        <CardHeader className="p-8 border-b border-border/40 bg-muted/10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <Store size={24} strokeWidth={2.5} />
            </div>
            <div>
              <CardTitle className="text-xl font-bold tracking-tight">Datos del Restaurante</CardTitle>
              <p className="text-xs text-muted-foreground font-medium">Información principal y plan de suscripción</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-8">
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className={labelCls}>Nombre del Restaurante</label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/40 group-focus-within:text-primary transition-colors">
                    <Store size={18} />
                  </div>
                  <input required value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    className={cn(inputCls, "pl-12")} />
                </div>
              </div>

              <div className="space-y-2">
                <label className={labelCls}>Identificador (Slug / URL)</label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/40 group-focus-within:text-primary transition-colors">
                    <Globe size={18} />
                  </div>
                  <input required value={form.slug}
                    onChange={e => setForm(p => ({ ...p, slug: e.target.value }))}
                    className={cn(inputCls, "pl-12 font-mono")} />
                </div>
              </div>

              <div className="space-y-2">
                <label className={labelCls}>Plan de Servicio</label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/40 group-focus-within:text-primary transition-colors pointer-events-none">
                    <CreditCard size={18} />
                  </div>
                  <select value={form.plan}
                    onChange={e => setForm(p => ({ ...p, plan: e.target.value }))}
                    className={cn(inputCls, "pl-12 appearance-none cursor-pointer")}>
                    <option value="try">Probar — USD 250 / mes</option>
                    <option value="buy">Comprar — USD 600 / mes</option>
                    <option value="full">Full Access — USD 800 / mes</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between p-5 bg-muted/30 border-2 border-border/40 rounded-[2rem] self-end h-[58px]">
                <div className="flex items-center gap-3">
                  <div className={cn("w-2 h-2 rounded-full", form.isActive ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-destructive")} />
                  <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Estado del Tenant</span>
                </div>
                <button type="button"
                  onClick={() => setForm(p => ({ ...p, isActive: !p.isActive }))}
                  className={cn(
                    "w-12 h-6 rounded-full transition-all relative flex items-center",
                    form.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/20'
                  )}>
                  <div className={cn(
                    "w-4 h-4 rounded-full bg-white shadow-sm transition-all absolute",
                    form.isActive ? 'left-[26px]' : 'left-1'
                  )} />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-8 border-t border-border/40">
              <Button type="submit" disabled={loading} className="bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest px-10 h-14 rounded-2xl shadow-xl shadow-primary/20 transition-all active:scale-95 disabled:opacity-50">
                {loading ? <Loader2 className="animate-spin h-5 w-5" /> : <><Save size={18} className="mr-2" /> Guardar Cambios</>}
              </Button>
              <Button type="button" variant="ghost" className="text-muted-foreground font-bold px-8 h-14 rounded-2xl" onClick={() => router.back()}>
                Cancelar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="bg-white border-2 border-destructive/20 shadow-xl rounded-[2.5rem] overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none text-destructive">
          <ShieldAlert size={120} />
        </div>
        <CardContent className="p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center text-destructive">
              <ShieldAlert size={24} strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-lg font-bold text-destructive tracking-tight">Zona de Eliminación</p>
              <p className="text-xs text-muted-foreground font-medium">Esta acción eliminará permanentemente el restaurante y todos sus datos vinculados.</p>
            </div>
          </div>

          <div className="p-6 bg-destructive/5 border-2 border-destructive/10 rounded-3xl mb-8">
            <p className="text-sm text-destructive font-bold leading-relaxed">
              Atención: Al eliminar "{tenant.name}", se borrarán menús, pedidos, configuraciones y accesos de personal.
              No hay forma de revertir esta operación.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={deleting}
            onClick={handleDelete}
            className="border-2 border-destructive/20 text-destructive hover:bg-destructive hover:text-white hover:border-destructive rounded-xl font-black text-[10px] uppercase tracking-[0.2em] px-8 h-12 transition-all active:scale-95">
            {deleting ? 'Eliminando...' : `Eliminar Permanentemente`}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
