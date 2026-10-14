'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus, X, Trash2, ShieldCheck, User as UserIcon, Loader2, MapPin, ToggleLeft, ToggleRight } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  admin: { label: 'Admin', color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20' },
  manager: { label: 'Manager', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  staff: { label: 'Staff', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
  cashier: { label: 'Cajero', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
  waiter: { label: 'Mozo', color: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
  host: { label: 'Host', color: 'bg-pink-500/10 text-pink-500 border-pink-500/20' },
  auditor: { label: 'Auditor', color: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
  seller: { label: 'Vendedor', color: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20' },
}

const ALL_ROLES = Object.keys(ROLE_LABELS)

interface Assignment {
  _id: string
  userId: string
  userName: string
  userEmail: string
  locationId: string | null
  locationName: string
  role: string
  isActive: boolean
}

interface Props {
  tenantSlug: string
  users: { _id: string; name: string; email: string }[]
  locations: { _id: string; name: string }[]
}

const EMPTY_FORM = { userId: '', locationId: '', role: 'staff' }

export default function RoleLocationManager({ tenantSlug, users, locations }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  const fetchAssignments = useCallback(async () => {
    try {
      const res = await fetch(`/api/${tenantSlug}/user-location-roles`)
      if (!res.ok) throw new Error('Error al cargar asignaciones')
      const data = await res.json()
      setAssignments(data.assignments)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [tenantSlug])

  useEffect(() => {
    fetchAssignments()
  }, [fetchAssignments])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/user-location-roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, locationId: form.locationId || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      toast.success('Asignación guardada')
      setForm(EMPTY_FORM)
      setShowForm(false)
      fetchAssignments()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(a: Assignment) {
    try {
      const res = await fetch(`/api/${tenantSlug}/user-location-roles/${a._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !a.isActive }),
      })
      if (!res.ok) throw new Error('Error al actualizar')
      setAssignments(prev => prev.map(x => x._id === a._id ? { ...x, isActive: !x.isActive } : x))
      toast.success(a.isActive ? 'Asignación desactivada' : 'Asignación activada')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    }
  }

  async function handleDelete(a: Assignment) {
    if (!confirm(`¿Eliminar el rol ${ROLE_LABELS[a.role]?.label} de ${a.userName} en ${a.locationName}?`)) return
    try {
      const res = await fetch(`/api/${tenantSlug}/user-location-roles/${a._id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al eliminar')
      setAssignments(prev => prev.filter(x => x._id !== a._id))
      toast.success('Asignación eliminada')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    }
  }

  const labelCls = "text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50 mb-2 block"
  const inputCls = "w-full bg-muted/40 border-2 border-border/60 focus:border-primary/40 focus:bg-white text-foreground text-sm font-medium rounded-2xl px-4 py-3 outline-none transition-all shadow-sm"

  return (
    <Card className="bg-card border-2 border-border/60 rounded-[2.5rem] overflow-hidden">
      <CardHeader className="p-8 border-b border-border/40 bg-muted/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <ShieldCheck size={24} strokeWidth={2.5} />
            </div>
            <div>
              <CardTitle className="text-xl font-bold tracking-tight">Roles por Sede</CardTitle>
              <p className="text-xs text-muted-foreground font-medium">
                Asigná roles específicos por sede. Sin asignación, el rol base del usuario aplica a todas las sedes.
              </p>
            </div>
          </div>
          <Button
            onClick={() => setShowForm(true)}
            className="bg-primary hover:bg-primary/90 text-white font-bold rounded-xl px-5 shadow-lg shadow-primary/20 transition-all active:scale-95"
          >
            <Plus size={16} className="mr-2 stroke-[3px]" /> Asignar rol
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-8">
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              className="mb-8"
            >
              <div className="bg-muted/20 border-2 border-primary/20 rounded-[2rem] p-8 relative">
                <button onClick={() => setShowForm(false)} className="absolute top-6 right-6 text-muted-foreground hover:text-foreground p-2 rounded-full hover:bg-muted transition-all">
                  <X size={18} strokeWidth={3} />
                </button>
                <h3 className="text-lg font-bold tracking-tight mb-6">Nueva Asignación</h3>
                <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <label className={labelCls}>Usuario</label>
                    <select required value={form.userId} onChange={e => setForm(p => ({ ...p, userId: e.target.value }))} className={cn(inputCls, "appearance-none cursor-pointer")}>
                      <option value="">Seleccionar...</option>
                      {users.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className={labelCls}>Sede</label>
                    <select value={form.locationId} onChange={e => setForm(p => ({ ...p, locationId: e.target.value }))} className={cn(inputCls, "appearance-none cursor-pointer")}>
                      <option value="">Todas las sedes</option>
                      {locations.map(l => <option key={l._id} value={l._id}>{l.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className={labelCls}>Rol</label>
                    <select required value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} className={cn(inputCls, "appearance-none cursor-pointer")}>
                      {ALL_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]?.label}</option>)}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <Button type="submit" disabled={saving} className="w-full bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest h-[46px] rounded-2xl shadow-xl shadow-primary/20 transition-all active:scale-95 disabled:opacity-50">
                      {saving ? <Loader2 className="animate-spin h-5 w-5" /> : 'Guardar'}
                    </Button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <Loader2 className="animate-spin h-8 w-8 text-primary" />
          </div>
        ) : assignments.length === 0 ? (
          <div className="py-16 text-center border-2 border-dashed border-border/60 rounded-[2rem] bg-muted/10">
            <p className="text-muted-foreground font-bold">No hay asignaciones de roles por sede todavía.</p>
            <p className="text-xs text-muted-foreground/60 mt-2">Los usuarios usan su rol base hasta que les asignes un rol específico por sede.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {assignments.map((a, i) => {
              const roleCfg = ROLE_LABELS[a.role] || ROLE_LABELS.staff
              return (
                <motion.div
                  key={a._id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={cn(
                    "flex items-center justify-between p-4 rounded-2xl border-2 transition-all",
                    a.isActive ? "border-border/60 bg-muted/20" : "border-border/40 bg-muted/10 opacity-60"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
                      <UserIcon size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">{a.userName}</p>
                      <p className="text-[10px] text-muted-foreground font-medium">{a.userEmail}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin size={14} />
                      <span className="text-xs font-semibold">{a.locationName}</span>
                    </div>

                    <Badge className={cn("px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border-2", roleCfg.color)}>
                      {roleCfg.label}
                    </Badge>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleToggleActive(a)}
                        className="p-2 rounded-lg hover:bg-muted transition-all text-muted-foreground hover:text-foreground"
                        title={a.isActive ? 'Desactivar' : 'Activar'}
                      >
                        {a.isActive ? <ToggleRight size={20} className="text-emerald-500" /> : <ToggleLeft size={20} />}
                      </button>
                      <button
                        onClick={() => handleDelete(a)}
                        className="p-2 rounded-lg hover:bg-red-500/10 transition-all text-muted-foreground hover:text-red-500"
                        title="Eliminar"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
