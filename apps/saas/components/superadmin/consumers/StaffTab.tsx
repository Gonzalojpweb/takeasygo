'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search, Loader2, AlertTriangle,
  Shield, ShieldCheck, UserCog, Wallet, Store, Briefcase,
} from 'lucide-react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'

interface StaffUser {
  _id: string
  name: string
  email: string
  image?: string
  role: string
  tenantId: string | null
  tenantName: string | null
  assignedTenants: string[]
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

interface StaffStats {
  superadmin: number
  admin: number
  manager: number
  staff: number
  cashier: number
  seller: number
  [key: string]: number
}

const ROLE_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  superadmin: { label: 'Superadmin', color: 'text-purple-600', bgColor: 'bg-purple-500/10 border-purple-500/20', icon: ShieldCheck },
  admin: { label: 'Admin', color: 'text-blue-600', bgColor: 'bg-blue-500/10 border-blue-500/20', icon: Shield },
  manager: { label: 'Manager', color: 'text-amber-600', bgColor: 'bg-amber-500/10 border-amber-500/20', icon: UserCog },
  staff: { label: 'Staff', color: 'text-emerald-600', bgColor: 'bg-emerald-500/10 border-emerald-500/20', icon: Briefcase },
  cashier: { label: 'Caja', color: 'text-orange-600', bgColor: 'bg-orange-500/10 border-orange-500/20', icon: Wallet },
  seller: { label: 'Vendedor', color: 'text-cyan-600', bgColor: 'bg-cyan-500/10 border-cyan-500/20', icon: Store },
}

export default function StaffTab() {
  const [users, setUsers] = useState<StaffUser[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [stats, setStats] = useState<StaffStats | null>(null)

  const debouncedSearch = useDebounce(search, 300)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (roleFilter) params.set('role', roleFilter)

      const res = await fetch(`/api/superadmin/staff?${params}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setUsers(data.users || [])
      setTotal(data.total ?? 0)
      setStats(data.stats)
    } catch {
      setError('Error al cargar staff')
      toast.error('Error al cargar staff')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, roleFilter])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  function formatDate(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {Object.entries(ROLE_CONFIG).map(([key, config]) => {
            const Icon = config.icon
            return (
              <div
                key={key}
                role="button"
                tabIndex={0}
                className={cn(
                  "p-3 rounded-xl border-2 cursor-pointer transition-all",
                  roleFilter === key
                    ? "border-primary bg-primary/5"
                    : "border-border/40 bg-muted/20 hover:bg-muted/30"
                )}
                onClick={() => setRoleFilter(roleFilter === key ? '' : key)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setRoleFilter(roleFilter === key ? '' : key) } }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon size={14} className={config.color} />
                  <span className="text-[9px] uppercase font-black tracking-wider text-muted-foreground">{config.label}</span>
                </div>
                <p className="text-xl font-black">{stats[key] ?? 0}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o email..."
            aria-label="Buscar por nombre o email"
            className="w-full bg-muted/40 border-2 border-border/60 focus:border-primary/40 focus:bg-background text-foreground text-sm font-medium rounded-xl pl-10 pr-4 py-2.5 outline-none transition-all"
          />
        </div>
        {roleFilter && (
          <button
            onClick={() => setRoleFilter('')}
            className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
          >
            Limpiar filtro
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-card border-2 border-border/60 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Lista de usuarios internos">
            <thead>
              <tr className="border-b border-border/40 bg-muted/20">
                <th className="text-left px-5 py-4 text-[10px] uppercase font-black tracking-wider text-muted-foreground/50">Usuario</th>
                <th className="text-left px-5 py-4 text-[10px] uppercase font-black tracking-wider text-muted-foreground/50">Rol</th>
                <th className="text-left px-5 py-4 text-[10px] uppercase font-black tracking-wider text-muted-foreground/50 hidden md:table-cell">Tenant</th>
                <th className="text-left px-5 py-4 text-[10px] uppercase font-black tracking-wider text-muted-foreground/50 hidden lg:table-cell">Último login</th>
                <th className="text-center px-5 py-4 text-[10px] uppercase font-black tracking-wider text-muted-foreground/50">Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center" role="status" aria-label="Cargando">
                    <Loader2 size={24} className="animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center">
                    <AlertTriangle size={40} className="mx-auto text-destructive/50 mb-3" />
                    <p className="text-destructive font-medium">{error}</p>
                    <Button variant="outline" size="sm" onClick={fetchUsers} className="mt-3 rounded-xl text-xs">
                      Reintentar
                    </Button>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center">
                    <Shield size={40} className="mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-muted-foreground font-medium">No hay usuarios internos</p>
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const roleConf = ROLE_CONFIG[u.role] || ROLE_CONFIG.staff
                  const RoleIcon = roleConf.icon
                  return (
                    <tr
                      key={u._id}
                      className="border-b border-border/20 hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 rounded-full">
                            {u.image ? (
                              <AvatarImage src={u.image} alt={u.name} />
                            ) : null}
                            <AvatarFallback className="bg-muted text-muted-foreground text-xs font-bold">
                              {u.name?.slice(0, 2).toUpperCase() || '??'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <span className="font-bold text-sm block">{u.name}</span>
                            <span className="text-[10px] text-muted-foreground font-mono">{u.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <Badge className={cn("border-2 text-[9px] font-bold", roleConf.bgColor, roleConf.color)}>
                          <RoleIcon size={10} className="mr-1" />
                          {roleConf.label}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 hidden md:table-cell">
                        {u.tenantName ? (
                          <span className="text-sm font-medium">{u.tenantName}</span>
                        ) : u.role === 'superadmin' ? (
                          <span className="text-xs text-muted-foreground italic">Global</span>
                        ) : u.role === 'seller' ? (
                          <span className="text-xs text-muted-foreground">Multi-tenant</span>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 hidden lg:table-cell">
                        <span className="text-sm text-muted-foreground">
                          {formatDate(u.lastLoginAt)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        {u.isActive ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 border-2 text-[9px] font-bold">
                            Activo
                          </Badge>
                        ) : (
                          <Badge className="bg-muted text-muted-foreground border-border/40 border-2 text-[9px] font-bold">
                            Inactivo
                          </Badge>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Total */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {total} usuarios internos
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchUsers}
          className="rounded-xl text-xs"
        >
          Refrescar
        </Button>
      </div>
    </div>
  )
}
