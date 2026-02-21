'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  manager: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  staff: 'bg-green-500/20 text-green-400 border-green-500/30',
  cashier: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
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
      toast.success('Usuario creado')
      setForm(EMPTY_FORM)
      setShowForm(false)
      router.refresh()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {/* Lista de usuarios */}
      <Card className="bg-zinc-800 border-zinc-700 mb-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-white text-base">Equipo</CardTitle>
          <Button size="sm" variant="outline"
            className="border-zinc-600 text-zinc-400 hover:text-white"
            onClick={() => setShowForm(true)}>
            <Plus size={14} className="mr-2" /> Nuevo usuario
          </Button>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-zinc-500 text-sm">No hay usuarios todavía</p>
          ) : (
            <div className="space-y-3">
              {users.map((user: any) => (
                <div key={user._id}
                  className="flex items-center justify-between py-2 border-b border-zinc-700 last:border-0">
                  <div>
                    <p className="text-white text-sm font-medium">{user.name}</p>
                    <p className="text-zinc-500 text-xs">{user.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={ROLE_COLORS[user.role] || ''}>
                      {user.role}
                    </Badge>
                    <div className="w-2 h-2 rounded-full" style={{
                      backgroundColor: user.isActive ? '#4ade80' : '#f87171'
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form nuevo usuario */}
      {showForm && (
        <Card className="bg-zinc-800 border-zinc-700">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-white text-base">Nuevo usuario</CardTitle>
            <button onClick={() => setShowForm(false)}>
              <X size={16} className="text-zinc-400" />
            </button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-3">
              <input required placeholder="Nombre *" value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-zinc-400" />
              <input required type="email" placeholder="Email *" value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className="w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-zinc-400" />
              <input required type="password" placeholder="Contraseña *" value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                className="w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-zinc-400" />
              <select value={form.role}
                onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                className="w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-zinc-400">
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="staff">Staff</option>
                <option value="cashier">Cashier</option>
              </select>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Creando...' : 'Crear usuario'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}