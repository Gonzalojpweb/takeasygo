'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search,
  Users,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Link2,
  RefreshCw,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import UserDetailModal from './UserDetailModal'

interface UserData {
  _id: string
  name: string
  email: string
  image?: string
  role: string
  isActive: boolean
  createdAt: string
}

const ROLE_BADGES: Record<string, { label: string; className: string }> = {
  consumer: { label: 'Consumer', className: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  admin: { label: 'Admin', className: 'bg-primary/10 text-primary border-primary/20' },
  manager: { label: 'Manager', className: 'bg-violet-500/10 text-violet-500 border-violet-500/20' },
  staff: { label: 'Staff', className: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
  cashier: { label: 'Cajero', className: 'bg-sky-500/10 text-sky-500 border-sky-500/20' },
  seller: { label: 'Vendedor', className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
}

interface Props {
  tenantSlug?: string
}

export default function UsersList({}: Props) {
  const [users, setUsers] = useState<UserData[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalUsers, setTotalUsers] = useState(0)
  const [activeUsers, setActiveUsers] = useState(0)
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '15',
        search,
      })
      if (roleFilter) params.set('role', roleFilter)
      if (statusFilter) params.set('status', statusFilter)

      const res = await fetch(`/api/superadmin/users?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setUsers(data.users)
      setTotalPages(data.pagination.pages)
      setTotalUsers(data.summary.total)
      setActiveUsers(data.summary.active)
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar usuarios')
    } finally {
      setLoading(false)
    }
  }, [page, search, roleFilter, statusFilter])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  useEffect(() => { setPage(1) }, [search, roleFilter, statusFilter])

  function openDetail(user: UserData) {
    setSelectedUser(user)
    setDetailOpen(true)
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Badge variant="outline" className="px-4 py-1.5 border-2 border-blue-500/20 bg-blue-500/5 text-blue-600 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">
          {totalUsers} usuarios
        </Badge>
        <span className="text-muted-foreground text-sm font-medium">
          {activeUsers} activos
        </span>
      </div>

      <Card className="border-2 border-border/60 rounded-[2.5rem] overflow-hidden">
        <CardHeader className="p-6 border-b border-border/40 bg-muted/5">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
              <Input
                placeholder="Buscar por nombre o email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10 bg-muted/40 border-2 border-border/60 focus:border-primary/40 h-10 rounded-xl text-sm font-medium"
              />
            </div>
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="h-10 rounded-xl border-2 border-border/60 bg-muted/40 px-3 text-sm font-medium outline-none focus:border-primary/40"
            >
              <option value="">Todos los roles</option>
              <option value="consumer">Consumer</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
              <option value="cashier">Cajero</option>
              <option value="seller">Vendedor</option>
            </select>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="h-10 rounded-xl border-2 border-border/60 bg-muted/40 px-3 text-sm font-medium outline-none focus:border-primary/40"
            >
              <option value="">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="animate-spin h-8 w-8 text-primary" />
            </div>
          ) : users.length === 0 ? (
            <div className="py-20 text-center">
              <Users size={48} className="mx-auto text-muted-foreground/20 mb-4" />
              <p className="text-muted-foreground font-bold">No se encontraron usuarios.</p>
              <p className="text-muted-foreground/60 text-sm mt-1">Probá con otros filtros de búsqueda.</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-6">Usuario</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Registrado</TableHead>
                    <TableHead className="pr-6"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow
                      key={u._id}
                      className="hover:bg-muted/10 cursor-pointer"
                      onClick={() => openDetail(u)}
                    >
                      <TableCell className="pl-6">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 rounded-full">
                            {u.image ? (
                              <AvatarImage src={u.image} alt={u.name} />
                            ) : null}
                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                              {u.name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-bold text-sm">{u.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-mono text-muted-foreground">{u.email}</span>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn(
                          'text-[9px] font-black uppercase tracking-widest border-2',
                          ROLE_BADGES[u.role]?.className ?? 'bg-muted/10 text-muted-foreground border-muted/20'
                        )}>
                          {ROLE_BADGES[u.role]?.label ?? u.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          'inline-flex items-center gap-1.5 text-[10px] font-bold',
                          u.isActive ? 'text-emerald-500' : 'text-muted-foreground'
                        )}>
                          <span className={cn(
                            'w-2 h-2 rounded-full',
                            u.isActive ? 'bg-emerald-500' : 'bg-muted-foreground'
                          )} />
                          {u.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{formatDate(u.createdAt)}</span>
                      </TableCell>
                      <TableCell className="pr-6">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-xl text-xs font-bold"
                          onClick={(e) => { e.stopPropagation(); openDetail(u) }}
                        >
                          Ver detalle
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 p-4 border-t border-border/40">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                    className="rounded-xl"
                  >
                    <ChevronLeft size={14} className="mr-1" /> Anterior
                  </Button>
                  <span className="text-sm text-muted-foreground font-medium px-4">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="rounded-xl"
                  >
                    Siguiente <ChevronRight size={14} className="ml-1" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              const res = await fetch('/api/superadmin/users/link-members', { method: 'POST' })
              const data = await res.json()
              if (!res.ok) throw new Error(data.error)
              toast.success(`${data.linked} miembros vinculados, ${data.skipped} omitidos`)
              fetchUsers()
            } catch (err: any) {
              toast.error(err.message)
            }
          }}
          className="rounded-xl text-xs font-bold"
        >
          <Link2 size={14} className="mr-2" /> Vincular miembros sin userId
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchUsers}
          className="rounded-xl text-xs"
        >
          <RefreshCw size={14} className="mr-2" /> Refrescar
        </Button>
      </div>

      {selectedUser && (
        <UserDetailModal
          userId={selectedUser._id}
          open={detailOpen}
          onOpenChange={(open) => {
            setDetailOpen(open)
            if (!open) setSelectedUser(null)
          }}
          onUpdate={fetchUsers}
        />
      )}
    </div>
  )
}
