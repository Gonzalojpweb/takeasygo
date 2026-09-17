'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Banknote, Key, Eye, EyeOff, Loader2, Plus, Trash2, Radio, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TransferAccount {
  _id: string
  label: string
  alias: string
  cbu: string | null
  cvu: string | null
  bankName: string | null
  holderName: string | null
  isActive: boolean
  createdAt: string
}

interface Props {
  tenantSlug: string
  transferEnabled: boolean
  transferAccounts: TransferAccount[]
}

export default function TransferAccountsSettings({ tenantSlug, transferEnabled, transferAccounts = [] }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null)

  // ── Add new account ──
  const [newLabel, setNewLabel] = useState('')
  const [newAlias, setNewAlias] = useState('')
  const [newCbu, setNewCbu] = useState('')
  const [newCvu, setCvu] = useState('')
  const [newBankName, setNewBankName] = useState('')
  const [newHolderName, setNewHolderName] = useState('')

  // ── Edit existing account ──
  const [editLabel, setEditLabel] = useState('')
  const [editAlias, setEditAlias] = useState('')
  const [editCbu, setEditCbu] = useState('')
  const [editCvu, setEditCvu] = useState('')
  const [editBankName, setEditBankName] = useState('')
  const [editHolderName, setEditHolderName] = useState('')

  const [showNewDetails, setShowNewDetails] = useState(false)
  const [showEditDetails, setShowEditDetails] = useState(false)

  async function handleAddAccount(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/settings/transfer-accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: newLabel,
          alias: newAlias,
          cbu: newCbu || null,
          cvu: newCvu || null,
          bankName: newBankName || null,
          holderName: newHolderName || null,
          isActive: transferAccounts.length === 0,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      toast.success('Cuenta creada correctamente')
      setShowAddForm(false)
      resetNewForm()
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || 'Error al crear cuenta')
    } finally {
      setLoading(false)
    }
  }

  async function handleActivate(accountId: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/settings/transfer-accounts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      })
      if (!res.ok) throw new Error()
      toast.success('Cuenta activada')
      router.refresh()
    } catch {
      toast.error('Error al activar cuenta')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(accountId: string) {
    if (!confirm('¿Eliminar esta cuenta?')) return
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/settings/transfer-accounts/${accountId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      toast.success('Cuenta eliminada')
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || 'Error al eliminar cuenta')
    } finally {
      setLoading(false)
    }
  }

  async function handleEditAccount(e: React.FormEvent) {
    e.preventDefault()
    if (!editingAccountId) return
    setLoading(true)
    try {
      const body: any = {}
      if (editLabel) body.label = editLabel
      if (editAlias) body.alias = editAlias
      if (editCbu !== '') body.cbu = editCbu || null
      if (editCvu !== '') body.cvu = editCvu || null
      if (editBankName !== '') body.bankName = editBankName || null
      if (editHolderName !== '') body.holderName = editHolderName || null

      const res = await fetch(`/api/${tenantSlug}/settings/transfer-accounts/${editingAccountId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      toast.success('Cuenta actualizada')
      setEditingAccountId(null)
      router.refresh()
    } catch {
      toast.error('Error al actualizar cuenta')
    } finally {
      setLoading(false)
    }
  }

  function resetNewForm() {
    setNewLabel('')
    setNewAlias('')
    setNewCbu('')
    setCvu('')
    setNewBankName('')
    setNewHolderName('')
  }

  const labelCls = "text-[10px] uppercase font-bold tracking-[0.2em] text-muted-foreground/60 mb-2 block"
  const inputCls = 'w-full bg-muted/30 border-2 border-border/80 focus:border-primary/40 focus:bg-white text-foreground text-sm font-mono rounded-2xl px-4 py-3 outline-none transition-all shadow-sm'

  return (
    <Card className="bg-card border-border/60 shadow-xl rounded-[2.5rem] overflow-hidden">
      <CardHeader className="p-8 border-b border-border/40 bg-muted/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
              <Banknote size={24} strokeWidth={2.5} />
            </div>
            <div>
              <CardTitle className="text-xl font-bold tracking-tight">Transferencia Bancaria</CardTitle>
              <p className="text-xs text-muted-foreground font-medium">Cuentas bancarias para recibir transferencias</p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border-2",
              transferEnabled && transferAccounts.some(a => a.isActive)
                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                : "bg-amber-500/10 text-amber-500 border-amber-500/20"
            )}
          >
            {transferEnabled && transferAccounts.some(a => a.isActive) ? 'Activo' : 'Inactivo'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-8 space-y-8">
        {/* ── Accounts List ── */}
        {transferAccounts.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">Cuentas configuradas</p>
            {transferAccounts.map(acc => (
              <div key={acc._id} className={cn(
                "flex items-center gap-3 p-4 rounded-2xl border-2 transition-all",
                acc.isActive
                  ? "bg-emerald-500/5 border-emerald-500/20"
                  : "bg-muted/20 border-border/60"
              )}>
                <button
                  onClick={() => !acc.isActive && handleActivate(acc._id)}
                  disabled={loading || acc.isActive}
                  className="shrink-0"
                >
                  <Radio
                    size={18}
                    className={cn(
                      acc.isActive ? "text-emerald-500 fill-emerald-500" : "text-muted-foreground/40",
                      !acc.isActive && "hover:text-primary cursor-pointer"
                    )}
                  />
                </button>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-bold truncate", acc.isActive ? "text-emerald-700" : "text-foreground")}>
                    {acc.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 truncate">
                    {acc.alias}
                    {acc.bankName && ` · ${acc.bankName}`}
                    {acc.isActive && ' · Activa'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setEditingAccountId(acc._id)
                    setEditLabel(acc.label)
                    setEditAlias(acc.alias)
                    setEditCbu(acc.cbu || '')
                    setEditCvu(acc.cvu || '')
                    setEditBankName(acc.bankName || '')
                    setEditHolderName(acc.holderName || '')
                    setShowEditDetails(false)
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-muted"
                >
                  Editar
                </button>
                {!acc.isActive && (
                  <button
                    onClick={() => handleDelete(acc._id)}
                    disabled={loading}
                    className="text-muted-foreground hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-500/10"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Add Account Button / Form ── */}
        {!showAddForm ? (
          <Button
            variant="outline"
            className="w-full border-2 border-dashed border-border/80 rounded-2xl h-14 text-muted-foreground hover:text-foreground hover:border-primary/40"
            onClick={() => setShowAddForm(true)}
          >
            <Plus size={16} className="mr-2" />
            Agregar nueva cuenta
          </Button>
        ) : (
          <form onSubmit={handleAddAccount} className="space-y-4 p-6 rounded-3xl bg-muted/10 border-2 border-border/60">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">Nueva cuenta</p>
            <div className="space-y-2">
              <label className={labelCls}>Nombre de la cuenta</label>
              <input
                required
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="Ej: Cuenta Galicia, Cuenta Naranja X"
                className={inputCls}
              />
            </div>
            <div className="space-y-2">
              <label className={labelCls}><Key size={10} className="inline mr-1" /> Alias *</label>
              <input
                required
                value={newAlias}
                onChange={e => setNewAlias(e.target.value)}
                placeholder="ej: takeasygo.mp"
                className={inputCls}
              />
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowNewDetails(!showNewDetails)}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
              >
                {showNewDetails ? <EyeOff size={14} /> : <Eye size={14} />}
                {showNewDetails ? 'Ocultar datos sensibles' : 'Mostrar datos sensibles (CBU/CVU)'}
              </button>
            </div>
            {showNewDetails && (
              <>
                <div className="space-y-2">
                  <label className={labelCls}>CBU</label>
                  <input
                    value={newCbu}
                    onChange={e => setNewCbu(e.target.value)}
                    placeholder="0000000000000000000000"
                    className={inputCls}
                  />
                </div>
                <div className="space-y-2">
                  <label className={labelCls}>CVU</label>
                  <input
                    value={newCvu}
                    onChange={e => setCvu(e.target.value)}
                    placeholder="0000000000000000000000"
                    className={inputCls}
                  />
                </div>
              </>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className={labelCls}>Banco</label>
                <input
                  value={newBankName}
                  onChange={e => setNewBankName(e.target.value)}
                  placeholder="ej: Banco Galicia"
                  className={inputCls}
                />
              </div>
              <div className="space-y-2">
                <label className={labelCls}>Titular</label>
                <input
                  value={newHolderName}
                  onChange={e => setNewHolderName(e.target.value)}
                  placeholder="Nombre del titular"
                  className={inputCls}
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading} className="bg-primary text-white rounded-xl px-8">
                {loading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Crear cuenta'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setShowAddForm(false); resetNewForm() }} className="rounded-xl">
                Cancelar
              </Button>
            </div>
          </form>
        )}

        {/* ── Edit Account Form ── */}
        {editingAccountId && (
          <form onSubmit={handleEditAccount} className="space-y-4 p-6 rounded-3xl bg-primary/5 border-2 border-primary/20">
            <p className="text-xs font-bold uppercase tracking-widest text-primary/60">Editar cuenta</p>
            <div className="space-y-2">
              <label className={labelCls}>Nombre</label>
              <input
                required
                value={editLabel}
                onChange={e => setEditLabel(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="space-y-2">
              <label className={labelCls}><Key size={10} className="inline mr-1" /> Alias</label>
              <input
                required
                value={editAlias}
                onChange={e => setEditAlias(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowEditDetails(!showEditDetails)}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
              >
                {showEditDetails ? <EyeOff size={14} /> : <Eye size={14} />}
                {showEditDetails ? 'Ocultar datos sensibles' : 'Mostrar datos sensibles (CBU/CVU)'}
              </button>
            </div>
            {showEditDetails && (
              <>
                <div className="space-y-2">
                  <label className={labelCls}>CBU <span className="text-muted-foreground/40 normal-case tracking-normal">(dejar vacío para no cambiar)</span></label>
                  <input
                    value={editCbu}
                    onChange={e => setEditCbu(e.target.value)}
                    placeholder="Dejar vacío si no querés cambiar"
                    className={inputCls}
                  />
                </div>
                <div className="space-y-2">
                  <label className={labelCls}>CVU <span className="text-muted-foreground/40 normal-case tracking-normal">(dejar vacío para no cambiar)</span></label>
                  <input
                    value={editCvu}
                    onChange={e => setEditCvu(e.target.value)}
                    placeholder="Dejar vacío si no querés cambiar"
                    className={inputCls}
                  />
                </div>
              </>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className={labelCls}>Banco</label>
                <input
                  value={editBankName}
                  onChange={e => setEditBankName(e.target.value)}
                  placeholder="Dejar vacío si no querés cambiar"
                  className={inputCls}
                />
              </div>
              <div className="space-y-2">
                <label className={labelCls}>Titular</label>
                <input
                  value={editHolderName}
                  onChange={e => setEditHolderName(e.target.value)}
                  placeholder="Dejar vacío si no querés cambiar"
                  className={inputCls}
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading} className="bg-primary text-white rounded-xl px-8">
                {loading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Guardar cambios'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditingAccountId(null)} className="rounded-xl">
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
