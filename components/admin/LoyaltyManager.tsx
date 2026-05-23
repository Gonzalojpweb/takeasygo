'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Users,
  Search,
  Plus,
  MoreVertical,
  Download,
  Upload,
  UserCheck,
  UserX,
  Trash2,
  Loader2,
  TrendingUp,
  TrendingDown,
  QrCode,
  Star,
  Eye,
  Edit,
  X,
  FileSpreadsheet,
  Camera,
  CameraOff,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Member {
  _id: string
  name: string
  phone: string
  email: string
  birthDate?: string | null
  status: 'active' | 'inactive' | 'blocked'
  joinedAt: string
  source: 'checkout' | 'qr_scan' | 'admin' | 'manual_import'
  cache: {
    totalOrders: number
    totalSpent: number
    lastOrderAt: string | null
  }
  loyalty?: {
    points: number
    tier: string
  }
  notes: string
}

interface Stats {
  overview: {
    total: number
    active: number
    inactive: number
    blocked: number
    returningRate: number
  }
  bySource: Record<string, number>
  recentMembers: Pick<Member, '_id' | 'name' | 'phone' | 'joinedAt' | 'source'>[]
  topSpenders: Pick<Member, '_id' | 'name' | 'phone' | 'cache'>[]
  period: { days: number; dateFrom: string }
  revenue: {
    total: number
    fromMembers: number
    ordersFromMembers: number
    memberShare: number
  }
}

interface Props {
  tenantSlug: string
  canExport: boolean
}

const STATUS_COLORS: Record<string, string> = {
  active:   'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  inactive: 'bg-muted text-muted-foreground border-border',
  blocked:  'bg-destructive/10 text-destructive border-destructive/20',
}

const SOURCE_LABELS: Record<string, string> = {
  checkout:      'En caja',
  qr_scan:       'QR',
  admin:         'Admin',
  manual_import: 'Importado',
}

const SOURCE_ICONS: Record<string, string> = {
  checkout:      'bg-blue-500/10 text-blue-500',
  qr_scan:       'bg-amber-500/10 text-amber-500',
  admin:         'bg-violet-500/10 text-violet-500',
  manual_import: 'bg-emerald-500/10 text-emerald-500',
}

export default function LoyaltyManager({ tenantSlug, canExport }: Props) {
  const [members, setMembers]       = useState<Member[]>([])
  const [stats, setStats]           = useState<Stats | null>(null)
  const [loading, setLoading]       = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [search, setSearch]         = useState('')
  const [page, setPage]             = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm]       = useState({ name: '', phone: '', email: '', birthDate: '', notes: '' })
  const [addLoading, setAddLoading]  = useState(false)
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [editForm, setEditForm]     = useState({ name: '', phone: '', email: '', birthDate: '', notes: '' })
  const [editLoading, setEditLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [importDialog, setImportDialog] = useState(false)
  const [importText, setImportText]  = useState('')
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [scanDialog, setScanDialog] = useState(false)
  const [scanId, setScanId] = useState('')
  const [scanLoading, setScanLoading] = useState(false)
  const [scannedMember, setScannedMember] = useState<any | null>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null)
  const [redeemDialog, setRedeemDialog] = useState(false)
  const [redeemPoints, setRedeemPoints] = useState(0)
  const [redeemLoading, setRedeemLoading] = useState(false)

  const fetchMembers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '15',
        search,
      })
      const res = await fetch(`/api/${tenantSlug}/loyalty/members?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMembers(data.members)
      setTotalPages(data.pagination.pages)
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar miembros')
    } finally {
      setLoading(false)
    }
  }, [tenantSlug, page, search])

  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/loyalty/stats?days=30`)
      const data = await res.json()
      if (res.ok) setStats(data)
    } catch (err) {
      console.error('Error loading stats', err)
    } finally {
      setStatsLoading(false)
    }
  }, [tenantSlug])

  useEffect(() => { fetchMembers() }, [fetchMembers])
  useEffect(() => { fetchStats() }, [fetchStats])

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault()
    setAddLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/loyalty/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Miembro agregado')
      setAddForm({ name: '', phone: '', email: '', birthDate: '', notes: '' })
      setShowAddForm(false)
      fetchMembers()
      fetchStats()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setAddLoading(false)
    }
  }

  async function handleUpdateStatus(memberId: string, status: string) {
    try {
      const res = await fetch(`/api/${tenantSlug}/loyalty/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Miembro ${status === 'active' ? 'activado' : status === 'inactive' ? 'desactivado' : 'bloqueado'}`)
      fetchMembers()
      fetchStats()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  async function handleDelete(memberId: string) {
    if (!confirm('¿Eliminar este miembro? Esta acción no se puede deshacer.')) return
    setDeletingId(memberId)
    try {
      const res = await fetch(`/api/${tenantSlug}/loyalty/members/${memberId}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Miembro eliminado')
      fetchMembers()
      fetchStats()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setDeletingId(null)
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingMember) return
    setEditLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/loyalty/members/${editingMember._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Miembro actualizado')
      setEditingMember(null)
      fetchMembers()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setEditLoading(false)
    }
  }

  async function handleImport() {
    if (!importText.trim()) {
      toast.error('Pegá el contenido del CSV')
      return
    }
    setImportLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/loyalty/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: importText }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setImportResult({ imported: data.imported, skipped: data.skipped })
      fetchMembers()
      fetchStats()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setImportLoading(false)
    }
  }

  async function handleScan() {
    if (!scanId.trim()) return
    setScanLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/loyalty/lookup?publicId=${scanId.trim()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setScannedMember(data.member)
      if (cameraActive) {
        stopCamera()
      }
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setScanLoading(false)
    }
  }

  const startCamera = async () => {
    setCameraError(null)
    try {
      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode('reader')
      }

      await html5QrCodeRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        async (decodedText) => {
          // QR escaneado exitosamente
          setScanId(decodedText)
          await handleScanById(decodedText)
        },
        (errorMessage) => {
          // Ignorar errores de escaneo intermitente
        }
      )

      setCameraActive(true)
    } catch (err: any) {
      console.error('Error starting camera:', err)
      setCameraError('No se pudo acceder a la cámara. Verifica los permisos.')
      toast.error('Error al iniciar la cámara')
    }
  }

  const stopCamera = async () => {
    if (html5QrCodeRef.current && cameraActive) {
      try {
        await html5QrCodeRef.current.stop()
        setCameraActive(false)
      } catch (err) {
        console.error('Error stopping camera:', err)
      }
    }
  }

  const handleScanById = async (publicId: string) => {
    setScanLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/loyalty/lookup?publicId=${publicId.trim()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setScannedMember(data.member)
      await stopCamera()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setScanLoading(false)
    }
  }

  async function handleRedeem() {
    if (!scannedMember || redeemPoints <= 0) {
      toast.error('Ingresá una cantidad de puntos válida')
      return
    }
    if (redeemPoints > scannedMember.points) {
      toast.error('El miembro no tiene suficientes puntos')
      return
    }
    setRedeemLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/loyalty/members/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberPublicId: scannedMember.publicId,
          points: redeemPoints,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Se canjearon ${redeemPoints} puntos correctamente`)
      setScannedMember((prev: any) => ({
        ...prev,
        points: data.newTotal,
      }))
      setRedeemDialog(false)
      setRedeemPoints(0)
      fetchMembers()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setRedeemLoading(false)
    }
  }

  // Limpiar cámara cuando se cierra el diálogo
  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current) {
        html5QrCodeRef.current.stop().catch(console.error)
      }
    }
  }, [])

  function openEdit(member: Member) {
    setEditingMember(member)
    setEditForm({
      name: member.name,
      phone: member.phone,
      email: member.email,
      birthDate: member.birthDate ? new Date(member.birthDate).toISOString().split('T')[0] : '',
      notes: member.notes ?? ''
    })
  }

  function formatDate(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('es-AR')
  }

  function formatCurrency(v: number) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(v)
  }

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="px-4 py-1.5 border-2 border-amber-500/20 bg-amber-500/5 text-amber-600 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">
            {stats?.overview?.total ?? '—'} miembros
          </Badge>
          {stats && (
            <span className="text-muted-foreground text-sm font-medium">
              {stats.overview.active} activos
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canExport && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.href = `/api/${tenantSlug}/loyalty/export?format=csv`}
              className="rounded-xl h-10 px-4 font-bold text-sm"
            >
              <Download size={16} className="mr-2 stroke-[2.5px]" /> Exportar
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setScanDialog(true)}
            className="rounded-xl h-10 px-4 font-bold text-sm bg-zinc-900 text-white hover:bg-zinc-800"
          >
            <QrCode size={16} className="mr-2 stroke-[2.5px]" /> Escanear QR
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportDialog(true)}
            className="rounded-xl h-10 px-4 font-bold text-sm"
          >
            <Upload size={16} className="mr-2 stroke-[2.5px]" /> Importar
          </Button>
          <Button
            onClick={() => setShowAddForm(true)}
            className="bg-primary hover:bg-primary/90 text-white font-bold rounded-xl px-5 shadow-lg shadow-primary/20 transition-all active:scale-95"
          >
            <Plus size={16} className="mr-2 stroke-[3px]" /> Agregar
          </Button>
        </div>
      </div>

      {stats && !statsLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={<Users size={20} className="text-primary" />}
            label="Total miembros"
            value={stats.overview.total}
            sub={`${stats.overview.active} activos`}
          />
          <StatCard
            icon={<TrendingUp size={20} className="text-emerald-500" />}
            label="Tasa recompra"
            value={`${stats.overview.returningRate}%`}
            sub="últimos 30 días"
          />
          <StatCard
            icon={<Star size={20} className="text-amber-500" />}
            label="Ingresos miembros"
            value={formatCurrency(stats.revenue.fromMembers)}
            sub={`${stats.revenue.memberShare}% del total`}
          />
          <StatCard
            icon={<QrCode size={20} className="text-blue-500" />}
            label="Nuevos (30d)"
            value={stats.recentMembers.length}
            sub="por QR"
          />
        </div>
      )}

      <Card className="border-2 border-border/60 rounded-[2.5rem] overflow-hidden">
        <CardHeader className="p-6 border-b border-border/40 bg-muted/5">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
              <Input
                placeholder="Buscar por nombre, teléfono o email..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                className="pl-10 bg-muted/40 border-2 border-border/60 focus:border-primary/40 h-10 rounded-xl text-sm font-medium"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="animate-spin h-8 w-8 text-primary" />
            </div>
          ) : members.length === 0 ? (
            <div className="py-20 text-center">
              <Users size={48} className="mx-auto text-muted-foreground/20 mb-4" />
              <p className="text-muted-foreground font-bold">No hay miembros registrados.</p>
              <p className="text-muted-foreground/60 text-sm mt-1">Activá el club y compartí el QR para captar clientes.</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-6">Cliente</TableHead>
                    <TableHead>Contacto</TableHead>
                    <TableHead>Puntos</TableHead>
                    <TableHead>Cumpleaños</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Fuente</TableHead>
                    <TableHead>Pedidos</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Miembro desde</TableHead>
                    <TableHead className="pr-6"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m: Member) => (
                    <TableRow key={m._id} className="hover:bg-muted/10">
                      <TableCell className="pl-6">
                        <div>
                          <p className="font-bold text-sm">{m.name}</p>
                          {m.notes && <p className="text-[10px] text-muted-foreground/60 truncate max-w-[150px]">{m.notes}</p>}
                        </div>
                      </TableCell>
                       <TableCell>
                         <p className="text-sm font-medium">{m.phone}</p>
                         <p className="text-xs text-muted-foreground">{m.email || '—'}</p>
                       </TableCell>
                       <TableCell>
                        <span className="font-bold text-sm text-amber-600">{m.loyalty?.points ?? 0}</span>
                      </TableCell>
                      <TableCell>
                         <span className="text-sm text-muted-foreground">
                           {m.birthDate ? formatDate(m.birthDate) : '—'}
                         </span>
                       </TableCell>
                       <TableCell>
                         <Badge className={cn('text-[9px] font-black uppercase tracking-widest border-2', STATUS_COLORS[m.status])}>
                           {m.status}
                         </Badge>
                       </TableCell>
                      <TableCell>
                        <Badge className={cn('text-[9px] font-bold border-2', SOURCE_ICONS[m.source])}>
                          {SOURCE_LABELS[m.source]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-bold text-sm">{m.cache?.totalOrders ?? 0}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-bold text-sm">{formatCurrency(m.cache?.totalSpent ?? 0)}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{formatDate(m.joinedAt)}</span>
                      </TableCell>
                      <TableCell className="pr-6">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                              <MoreVertical size={16} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60">Acciones</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => openEdit(m)}>
                              <Eye size={14} className="mr-2" /> Ver / Editar
                            </DropdownMenuItem>
                            {m.status === 'active' && (
                              <DropdownMenuItem onClick={() => handleUpdateStatus(m._id, 'inactive')}>
                                <UserX size={14} className="mr-2" /> Desactivar
                              </DropdownMenuItem>
                            )}
                            {m.status !== 'active' && (
                              <DropdownMenuItem onClick={() => handleUpdateStatus(m._id, 'active')}>
                                <UserCheck size={14} className="mr-2" /> Activar
                              </DropdownMenuItem>
                            )}
                            {m.status !== 'blocked' && (
                              <DropdownMenuItem onClick={() => handleUpdateStatus(m._id, 'blocked')}>
                                <UserX size={14} className="mr-2 text-destructive" /> Bloquear
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDelete(m._id)}
                              className="text-destructive focus:text-destructive"
                              disabled={deletingId === m._id}
                            >
                              <Trash2 size={14} className="mr-2" /> Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
                    Anterior
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
                    Siguiente
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {showAddForm && (
        <MemberFormDialog
          title="Agregar miembro"
          form={addForm}
          setForm={setAddForm}
          loading={addLoading}
          onSubmit={handleAddMember}
          onClose={() => setShowAddForm(false)}
        />
      )}

      {editingMember && (
        <MemberFormDialog
          title="Editar miembro"
          form={editForm}
          setForm={setEditForm}
          loading={editLoading}
          onSubmit={handleSaveEdit}
          onClose={() => setEditingMember(null)}
        />
      )}

      <Dialog open={importDialog} onOpenChange={setImportDialog}>
        <DialogContent className="max-w-lg rounded-[2rem]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                <FileSpreadsheet size={20} />
              </div>
              <DialogTitle>Importar desde CSV</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Pegá el contenido de tu archivo CSV. Debe incluir columnas: <strong>nombre</strong> y <strong>teléfono</strong>.
            </p>
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder="nombre,teléfono,email&#10;Juan Pérez,+5491112345678,juan@mail.com&#10;María García,+5491187654321,"
              rows={8}
              className="w-full bg-muted/40 border-2 border-border/60 focus:border-primary/40 rounded-xl px-4 py-3 text-sm font-mono outline-none transition-all resize-none"
            />
            {importResult && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <p className="text-sm font-bold text-emerald-600">
                  ✓ {importResult.imported} importados • {importResult.skipped} saltados
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setImportDialog(false)} className="rounded-xl">
              Cerrar
            </Button>
            <Button
              onClick={handleImport}
              disabled={importLoading || !importText.trim()}
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl"
            >
              {importLoading ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : <Upload size={16} className="mr-2" />}
              Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scanDialog} onOpenChange={(open) => {
        setScanDialog(open)
        if (!open) {
          setScanId('')
          setScannedMember(null)
          stopCamera()
        } else {
          // Iniciar cámara automáticamente al abrir el diálogo
          setTimeout(() => startCamera(), 100)
        }
      }}>
        <DialogContent className="max-w-md rounded-[2.5rem] overflow-hidden p-0 border-none">
          <div className="bg-zinc-950 text-white p-8">
            <DialogHeader className="mb-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-left">
                  <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
                    <QrCode size={20} className="text-amber-400" />
                  </div>
                  <div>
                    <DialogTitle className="text-lg font-bold text-white">Lector de Miembros</DialogTitle>
                    <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Escaneo o ingreso manual</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setScanDialog(false)} className="text-white hover:bg-white/10 rounded-xl flex-shrink-0">
                  <X size={20} />
                </Button>
              </div>
            </DialogHeader>

            {!scannedMember ? (
              <div className="space-y-6">
                {/* Scanner de QR — #reader siempre en DOM para que Html5Qrcode lo encuentre */}
                <div className="relative aspect-square rounded-3xl overflow-hidden bg-zinc-900">
                  <div id="reader" className={`w-full h-full ${cameraActive ? '' : 'invisible'}`} />
                  {!cameraActive && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900">
                      <div className="w-20 h-20 mb-4 text-zinc-700">
                        <QrCode size={80} strokeWidth={1} />
                      </div>
                      <p className="text-sm text-zinc-500 font-medium px-8 text-center">
                        {cameraError || 'Cámara inactiva'}
                      </p>
                    </div>
                  )}
                  
                  {/* Botón de control de cámara */}
                  <Button
                    onClick={cameraActive ? stopCamera : startCamera}
                    className="absolute bottom-4 right-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full p-3 shadow-xl z-10"
                    size="icon"
                  >
                    {cameraActive ? <CameraOff size={20} /> : <Camera size={20} />}
                  </Button>
                </div>

                {/* Input manual */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-black tracking-widest text-zinc-500">ID de Miembro (TGO-XXXX...)</label>
                  <div className="flex gap-2">
                    <Input
                      value={scanId}
                      onChange={e => setScanId(e.target.value.toUpperCase())}
                      placeholder="TGO-..."
                      className="bg-zinc-900 border-zinc-800 focus:border-amber-500/50 h-12 rounded-xl font-mono text-center tracking-widest"
                    />
                    <Button
                      onClick={handleScan}
                      disabled={scanLoading || !scanId.trim()}
                      className="bg-amber-400 hover:bg-amber-500 text-zinc-950 font-black rounded-xl px-6 h-12 transition-all active:scale-95"
                    >
                      {scanLoading ? <Loader2 className="animate-spin h-5 w-5" /> : 'BUSCAR'}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6 animate-in zoom-in-95 duration-200">
                <div className="p-6 rounded-[2rem] bg-gradient-to-br from-zinc-800 to-zinc-900 border border-white/5 shadow-2xl relative overflow-hidden">
                  <div className="absolute -top-10 -right-10 w-40 h-40 bg-amber-400/10 blur-[80px]" />
                  
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-16 h-16 rounded-full bg-amber-400 flex items-center justify-center text-zinc-950 text-2xl font-black">
                      {scannedMember.name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="text-xl font-black tracking-tight">{scannedMember.name}</h4>
                      <Badge className="bg-amber-400 text-zinc-950 border-none font-bold text-[9px] uppercase tracking-tighter">
                        Nivel {scannedMember.tier || 'Bronce'}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-black/20 border border-white/5">
                      <p className="text-[10px] uppercase font-bold text-zinc-500 mb-1">Puntos</p>
                      <p className="text-2xl font-black text-amber-400 tabular-nums">{scannedMember.points}</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-black/20 border border-white/5">
                      <p className="text-[10px] uppercase font-bold text-zinc-500 mb-1">Total pedidos</p>
                      <p className="text-2xl font-black tabular-nums">{scannedMember.totalOrders}</p>
                    </div>
                  </div>

                  <div className="mt-6 space-y-3">
                    <Button
                      onClick={() => {
                        setRedeemPoints(0)
                        setRedeemDialog(true)
                      }}
                      className="w-full h-14 bg-white text-zinc-950 hover:bg-zinc-100 font-black uppercase tracking-widest rounded-2xl shadow-xl transition-all active:scale-95"
                    >
                      Canjear Beneficio
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setScannedMember(null)
                        setScanId('')
                        setTimeout(() => startCamera(), 100)
                      }}
                      className="w-full text-zinc-500 hover:text-white hover:bg-white/5 font-bold"
                    >
                      Escanear otro
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo de canje de puntos */}
      <Dialog open={redeemDialog} onOpenChange={(open) => {
        setRedeemDialog(open)
        if (!open) setRedeemPoints(0)
      }}>
        <DialogContent className="max-w-sm rounded-[2rem]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                <Star size={20} />
              </div>
              <DialogTitle>Canjear puntos</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-5 py-4">
            {scannedMember && (
              <div className="p-4 rounded-2xl bg-muted/30 border border-border/60">
                <p className="text-sm font-bold">{scannedMember.name}</p>
                <p className="text-2xl font-black text-amber-500 tabular-nums mt-1">
                  {scannedMember.points} puntos disponibles
                </p>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">
                Puntos a canjear
              </label>
              <Input
                type="number"
                min={1}
                max={scannedMember?.points ?? 0}
                value={redeemPoints || ''}
                onChange={e => setRedeemPoints(Math.max(0, parseInt(e.target.value) || 0))}
                placeholder="Ingresá la cantidad..."
                className="h-12 rounded-xl text-lg font-bold text-center"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => { setRedeemDialog(false); setRedeemPoints(0) }}
              className="flex-1 rounded-xl h-11 font-bold"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleRedeem}
              disabled={redeemLoading || redeemPoints <= 0 || redeemPoints > (scannedMember?.points ?? 0)}
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-black uppercase tracking-widest rounded-xl h-11"
            >
              {redeemLoading ? <Loader2 className="animate-spin h-5 w-5" /> : 'Canjear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub: string }) {
  return (
    <Card className="bg-card border-2 border-border/60 rounded-[2rem] overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 rounded-2xl bg-muted flex items-center justify-center">
            {icon}
          </div>
        </div>
        <p className="text-2xl font-black tracking-tight">{value}</p>
        <p className="text-[10px] text-muted-foreground/60 uppercase font-bold tracking-widest mt-1">{label}</p>
        <p className="text-[10px] text-muted-foreground/40 mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  )
}

function MemberFormDialog({
  title,
  form,
  setForm,
  loading,
  onSubmit,
  onClose,
}: {
  title: string
  form: { name: string; phone?: string; email: string; birthDate: string; notes: string }
  setForm: (f: any) => void
  loading: boolean
  onSubmit: (e: React.FormEvent) => void
  onClose: () => void
}) {
  const inputCls = "w-full bg-muted/40 border-2 border-border/60 focus:border-primary/40 h-11 rounded-xl px-4 text-sm font-medium outline-none transition-all"
  const labelCls = "text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50 mb-2 block"

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md rounded-[2rem]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{title}</DialogTitle>
            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl h-8 w-8">
              <X size={16} />
            </Button>
          </div>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-5 py-4">
          <div className="space-y-2">
            <label className={labelCls}>Nombre *</label>
            <input
              required
              value={form.name}
              onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Juan Pérez"
              className={inputCls}
            />
          </div>
          <div className="space-y-2">
            <label className={labelCls}>Teléfono</label>
            <input
              value={form.phone}
              onChange={e => setForm((f: any) => ({ ...f, phone: e.target.value }))}
              placeholder="Ej: +541160019734"
              className={inputCls}
            />
            <p className="text-[9px] text-muted-foreground/60 italic font-medium">
              Argentina: Usar +54 seguido de área y número (Sin el 9 ni el 0). Ej: +541160019734
            </p>
          </div>
          <div className="space-y-2">
            <label className={labelCls}>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm((f: any) => ({ ...f, email: e.target.value }))}
              placeholder="Ej: juan@mail.com"
              className={inputCls}
            />
          </div>
          <div className="space-y-2">
            <label className={labelCls}>Fecha de nacimiento</label>
            <input
              type="date"
              value={form.birthDate}
              onChange={e => setForm((f: any) => ({ ...f, birthDate: e.target.value }))}
              max={new Date(Date.now() - 13 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
              min={new Date(Date.now() - 120 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
              className={inputCls}
            />
          </div>
          <div className="space-y-2">
            <label className={labelCls}>Nota interna</label>
            <textarea
              value={form.notes}
              onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))}
              placeholder="Nota opcional para uso interno..."
              rows={2}
              className="w-full bg-muted/40 border-2 border-border/60 focus:border-primary/40 rounded-xl px-4 py-3 text-sm font-medium outline-none transition-all resize-none"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1 rounded-xl h-11 font-bold">
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="flex-1 bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest rounded-xl h-11">
              {loading ? <Loader2 className="animate-spin h-5 w-5" /> : 'Guardar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
