'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus, X, User as UserIcon, Mail, Shield, UserPlus, ShieldCheck, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  admin: { label: 'Admin', color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20', icon: ShieldCheck },
  manager: { label: 'Manager', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: Shield },
  staff: { label: 'Staff', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', icon: UserIcon },
  cashier: { label: 'Cashier', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20', icon: UserIcon },
}

interface Props {
  users: any[]
  tenantSlug: string
  tenantId: string
}

const EMPTY_FORM = { name: '', email: '', password: '', role: 'staff' }

export default function UsersManager({ users, tenantSlug, tenantId }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al crear usuario')
      toast.success('Miembro del equipo agregado')
      setForm(EMPTY_FORM)
      setShowForm(false)
      router.refresh()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const labelCls = "text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50 mb-2 block"
  const inputCls = "w-full bg-muted/40 border-2 border-border/60 focus:border-primary/40 focus:bg-white text-foreground text-sm font-medium rounded-2xl px-4 py-3 outline-none transition-all shadow-sm"

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="px-4 py-1.5 border-2 border-primary/20 bg-primary/5 text-primary text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">
            {users.length} Miembros
          </Badge>
          <p className="text-muted-foreground text-sm font-medium">Gestiona los accesos de tu equipo.</p>
        </div>

        <Button
          onClick={() => setShowForm(true)}
          className="bg-primary hover:bg-primary/90 text-white font-bold rounded-xl px-5 shadow-lg shadow-primary/20 transition-all active:scale-95"
        >
          <UserPlus size={16} className="mr-2 stroke-[3px]" /> Agregar usuario
        </Button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
          >
            <Card className="bg-card border-2 border-primary/20 shadow-2xl rounded-[2.5rem] overflow-hidden">
              <CardHeader className="p-8 border-b border-border/40 bg-muted/10 relative">
                <button onClick={() => setShowForm(false)} className="absolute top-8 right-8 text-muted-foreground hover:text-foreground p-2 rounded-full hover:bg-muted transition-all">
                  <X size={20} strokeWidth={3} />
                </button>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                    <UserPlus size={24} strokeWidth={2.5} />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold tracking-tight">Nuevo Miembro</CardTitle>
                    <p className="text-xs text-muted-foreground font-medium">Completa los datos para habilitar el acceso.</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-8">
                <form onSubmit={handleCreate} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className={labelCls}>Nombre Completo</label>
                      <div className="relative group">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/40 group-focus-within:text-primary transition-colors">
                          <UserIcon size={18} />
                        </div>
                        <input required placeholder="Ej: Juan Pérez" value={form.name}
                          onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                          className={cn(inputCls, "pl-12")} />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className={labelCls}>Correo Electrónico</label>
                      <div className="relative group">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/40 group-focus-within:text-primary transition-colors">
                          <Mail size={18} />
                        </div>
                        <input required type="email" placeholder="juan@ejemplo.com" value={form.email}
                          onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                          className={cn(inputCls, "pl-12")} />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className={labelCls}>Contraseña Temporal</label>
                      <input required type="password" placeholder="••••••••" value={form.password}
                        onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                        className={inputCls} />
                    </div>

                    <div className="space-y-2">
                      <label className={labelCls}>Rol en el equipo</label>
                      <select value={form.role}
                        onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                        className={cn(inputCls, "appearance-none cursor-pointer")}>
                        <option value="admin">Administrador (Control total)</option>
                        <option value="manager">Mánager (Gestión de ventas)</option>
                        <option value="staff">Personal (Visualización)</option>
                        <option value="cashier">Cajero (Operativa)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-4">
                    <Button type="submit" disabled={loading} className="bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest px-10 h-14 rounded-2xl shadow-xl shadow-primary/20 transition-all active:scale-95 disabled:opacity-50">
                      {loading ? <Loader2 className="animate-spin h-5 w-5" /> : 'Crear Usuario'}
                    </Button>
                    <Button type="button" variant="ghost" className="text-muted-foreground font-bold px-8 h-14 rounded-2xl" onClick={() => setShowForm(false)}>
                      Cancelar
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {users.length === 0 ? (
          <div className="col-span-full py-24 text-center border-2 border-dashed border-border/60 rounded-[3rem] bg-muted/10">
            <p className="text-muted-foreground font-bold">Aún no has agregado miembros a tu equipo.</p>
          </div>
        ) : (
          users.map((user: any, index: number) => {
            const config = ROLE_CONFIG[user.role] || ROLE_CONFIG.staff
            const Icon = config.icon
            return (
              <motion.div
                key={user._id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="bg-card border-2 border-border/60 rounded-[2.5rem] overflow-hidden hover:border-primary/30 shadow-md hover:shadow-xl transition-all duration-300 group">
                  <CardContent className="p-8">
                    <div className="flex items-start justify-between mb-6">
                      <div className="w-14 h-14 rounded-2xl bg-muted group-hover:bg-primary/10 flex items-center justify-center text-muted-foreground group-hover:text-primary transition-all duration-500">
                        <UserIcon size={24} />
                      </div>
                      <Badge className={cn("px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border-2", config.color)}>
                        {config.label}
                      </Badge>
                    </div>

                    <div className="space-y-1">
                      <h4 className="text-lg font-black tracking-tight text-foreground truncate">{user.name}</h4>
                      <p className="text-xs text-muted-foreground font-medium truncate flex items-center gap-1.5">
                        <Mail size={12} className="opacity-40" /> {user.email}
                      </p>
                    </div>

                    <div className="mt-8 pt-6 border-t border-border/40 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-2.5 h-2.5 rounded-full",
                          user.isActive ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-muted-foreground/30"
                        )} />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          {user.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                      <Icon size={16} className="text-muted-foreground/20" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })
        )}
      </div>
    </div>
  )
}