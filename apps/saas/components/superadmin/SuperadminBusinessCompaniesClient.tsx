'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2, Plus, X, Check, Loader2, Search, Trash2, ToggleLeft, ToggleRight, Store, Pencil, Globe,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

const PAYMENT_MODE_LABELS: Record<string, string> = {
  cash_mp: 'Contado MP',
  deferred: 'Diferido',
  mixed: 'Mixto',
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  active: { label: 'Activa', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  suspended: { label: 'Suspendida', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  cancelled: { label: 'Cancelada', className: 'bg-destructive/10 text-destructive border-destructive/20' },
}

interface Company {
  _id: string
  companyName: string
  companyTaxId: string
  status: string
  accessMode: string
  tenantIds: string[]
  tenantSettings: Array<{ tenantId: string; paymentMode: string; paymentTerms: string }>
  tenantNames: string[]
  companyAdminEmail: string
  employeeEmails: string[]
  notes: string
  registeredBy: string
  createdAt: string
}

interface TenantOption {
  _id: string
  name: string
  slug: string
}

interface Props {
  companies: Company[]
  tenants: TenantOption[]
}

export default function SuperadminBusinessCompaniesClient({ companies: initial, tenants }: Props) {
  const router = useRouter()
  const [companies, setCompanies] = useState<Company[]>(initial)
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [addingEmployee, setAddingEmployee] = useState<string | null>(null)
  const [newEmployeeEmail, setNewEmployeeEmail] = useState('')

  const [editForm, setEditForm] = useState<{
    _id: string
    companyName: string
    companyTaxId: string
    companyAdminEmail: string
    notes: string
    accessMode: string
    tenantIds: string[]
    tenantSettings: Record<string, { paymentMode: string; paymentTerms: string }>
  }>({
    _id: '', companyName: '', companyTaxId: '', companyAdminEmail: '', notes: '',
    accessMode: 'specific', tenantIds: [], tenantSettings: {},
  })

  const [form, setForm] = useState({
    companyName: '',
    companyTaxId: '',
    companyAdminEmail: '',
    employeeEmailsCsv: '',
    notes: '',
    accessMode: 'specific' as 'specific' | 'all',
    selectedTenantIds: [] as string[],
    tenantSettings: {} as Record<string, { paymentMode: string; paymentTerms: string }>,
  })

  const filtered = search
    ? companies.filter(c =>
        c.companyName.toLowerCase().includes(search.toLowerCase()) ||
        c.companyAdminEmail.toLowerCase().includes(search.toLowerCase()) ||
        c.tenantNames.some(n => n.toLowerCase().includes(search.toLowerCase()))
      )
    : companies

  function toggleFormTenant(tid: string) {
    setForm(p => {
      const ids = p.selectedTenantIds.includes(tid)
        ? p.selectedTenantIds.filter(id => id !== tid)
        : [...p.selectedTenantIds, tid]
      const settings = { ...p.tenantSettings }
      if (!ids.includes(tid)) {
        delete settings[tid]
      } else if (!settings[tid]) {
        settings[tid] = { paymentMode: 'cash_mp', paymentTerms: '' }
      }
      return { ...p, selectedTenantIds: ids, tenantSettings: settings }
    })
  }

  function updateFormTenantSetting(tid: string, field: 'paymentMode' | 'paymentTerms', value: string) {
    setForm(p => ({
      ...p,
      tenantSettings: {
        ...p.tenantSettings,
        [tid]: { ...p.tenantSettings[tid], [field]: value },
      },
    }))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.companyName.trim() || !form.companyAdminEmail.trim()) {
      toast.error('Completá nombre y email corporativo')
      return
    }
    if (form.accessMode === 'specific' && form.selectedTenantIds.length === 0) {
      toast.error('Seleccioná al menos un tenant')
      return
    }
    setSaving(true)
    try {
      const employeeEmails = form.employeeEmailsCsv
        .split('\n')
        .map(l => l.trim())
        .filter(l => l)

      const res = await fetch('/api/superadmin/business/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: form.companyName,
          companyTaxId: form.companyTaxId,
          companyAdminEmail: form.companyAdminEmail,
          employeeEmails,
          notes: form.notes,
          accessMode: form.accessMode,
          tenantIds: form.accessMode === 'specific' ? form.selectedTenantIds : [],
          tenantSettings: form.tenantSettings,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al crear empresa')
      setCompanies(prev => [data.company, ...prev])
      setShowCreate(false)
      setForm({ companyName: '', companyTaxId: '', companyAdminEmail: '', employeeEmailsCsv: '', notes: '', accessMode: 'specific', selectedTenantIds: [], tenantSettings: {} })
      toast.success('Empresa creada correctamente')
      router.refresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al crear empresa')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleStatus(company: Company) {
    const newStatus = company.status === 'active' ? 'suspended' : 'active'
    try {
      const res = await fetch(`/api/superadmin/business/companies/${company._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error()
      setCompanies(prev => prev.map(c => c._id === company._id ? { ...c, status: newStatus } : c))
      toast.success(newStatus === 'active' ? 'Empresa reactivada' : 'Empresa suspendida')
      router.refresh()
    } catch {
      toast.error('Error al cambiar estado')
    }
  }

  function toggleEditTenant(tid: string) {
    setEditForm(p => {
      const ids = p.tenantIds.includes(tid)
        ? p.tenantIds.filter(id => id !== tid)
        : [...p.tenantIds, tid]
      const settings = { ...p.tenantSettings }
      if (!ids.includes(tid)) {
        delete settings[tid]
      } else if (!settings[tid]) {
        settings[tid] = { paymentMode: 'cash_mp', paymentTerms: '' }
      }
      return { ...p, tenantIds: ids, tenantSettings: settings }
    })
  }

  function updateEditTenantSetting(tid: string, field: 'paymentMode' | 'paymentTerms', value: string) {
    setEditForm(p => ({
      ...p,
      tenantSettings: {
        ...p.tenantSettings,
        [tid]: { ...p.tenantSettings[tid], [field]: value },
      },
    }))
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editForm._id) return
    if (!editForm.companyName.trim() || !editForm.companyAdminEmail.trim()) {
      toast.error('Completá el nombre de la empresa y el email corporativo')
      return
    }
    if (editForm.accessMode === 'specific' && editForm.tenantIds.length === 0) {
      toast.error('Seleccioná al menos un tenant')
      return
    }
    setEditSaving(true)
    try {
      const res = await fetch(`/api/superadmin/business/companies/${editForm._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: editForm.companyName,
          companyTaxId: editForm.companyTaxId,
          notes: editForm.notes,
          accessMode: editForm.accessMode,
          tenantIds: editForm.accessMode === 'specific' ? editForm.tenantIds : [],
          tenantSettings: editForm.tenantSettings,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      setCompanies(prev => prev.map(c => c._id === editForm._id ? data.company : c))
      setEditForm({ _id: '', companyName: '', companyTaxId: '', companyAdminEmail: '', notes: '', accessMode: 'specific', tenantIds: [], tenantSettings: {} })
      setEditingId(null)
      toast.success('Empresa actualizada correctamente')
      router.refresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setEditSaving(false)
    }
  }

  async function handleAddEmployee(companyId: string) {
    if (!newEmployeeEmail.trim()) return
    try {
      const res = await fetch(`/api/superadmin/business/companies/${companyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addEmployeeEmails: [newEmployeeEmail.trim()] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al agregar empleado')
      setCompanies(prev => prev.map(c => c._id === companyId ? data.company : c))
      setNewEmployeeEmail('')
      setAddingEmployee(null)
      toast.success('Empleado agregado')
      router.refresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al agregar empleado')
    }
  }

  async function handleRemoveEmployee(companyId: string, email: string) {
    try {
      const res = await fetch(`/api/superadmin/business/companies/${companyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeEmployeeEmails: [email] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al eliminar empleado')
      setCompanies(prev => prev.map(c => c._id === companyId ? data.company : c))
      toast.success('Empleado eliminado')
      router.refresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar empleado')
    }
  }

  async function handleDelete(company: Company) {
    if (!confirm(`¿Eliminar permanentemente "${company.companyName}"?\nEsta acción no se puede deshacer.`)) return
    try {
      const res = await fetch(`/api/superadmin/business/companies/${company._id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error()
      setCompanies(prev => prev.filter(c => c._id !== company._id))
      toast.success('Empresa eliminada')
      router.refresh()
    } catch {
      toast.error('Error al eliminar empresa')
    }
  }

  const labelCls = "text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50 mb-2 block"
  const inputCls = "w-full bg-muted/40 border-2 border-border/60 focus:border-primary/40 focus:bg-white text-foreground text-sm font-medium rounded-2xl px-4 py-3 outline-none transition-all shadow-sm"

  function TenantMultiSelect({ selected, onChange }: { selected: string[]; onChange: (tid: string) => void }) {
    return (
      <div className="space-y-2">
        {tenants.map(t => (
          <label key={t._id} className={cn(
            "flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all",
            selected.includes(t._id)
              ? "border-primary/40 bg-primary/5"
              : "border-border/40 bg-muted/20 hover:bg-muted/40"
          )}>
            <input
              type="checkbox"
              checked={selected.includes(t._id)}
              onChange={() => onChange(t._id)}
              className="sr-only"
            />
            <div className={cn(
              "w-5 h-5 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all",
              selected.includes(t._id)
                ? "border-primary bg-primary text-white"
                : "border-border/60"
            )}>
              {selected.includes(t._id) && <Check size={12} />}
            </div>
            <div>
              <p className="text-sm font-bold">{t.name}</p>
              <p className="text-xs text-muted-foreground/60 font-mono">{t.slug}</p>
            </div>
          </label>
        ))}
      </div>
    )
  }

  function TenantSettingsEditor({ tenantIds, settings, onUpdate }: {
    tenantIds: string[]
    settings: Record<string, { paymentMode: string; paymentTerms: string }>
    onUpdate: (tid: string, field: 'paymentMode' | 'paymentTerms', value: string) => void
  }) {
    if (tenantIds.length === 0) return null
    return (
      <div className="space-y-3 mt-3">
        {tenantIds.map(tid => {
          const tenant = tenants.find(t => t._id === tid)
          const s = settings[tid] || { paymentMode: 'cash_mp', paymentTerms: '' }
          return (
            <div key={tid} className="p-4 rounded-xl bg-muted/20 border border-border/40 space-y-3">
              <p className="text-xs font-bold text-muted-foreground">{tenant?.name || tid}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Esquema de Pago</label>
                  <select value={s.paymentMode} onChange={e => onUpdate(tid, 'paymentMode', e.target.value)} className={inputCls}>
                    <option value="cash_mp">Contado MP</option>
                    <option value="deferred">Diferido</option>
                    <option value="mixed">Mixto</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Términos de Pago</label>
                  <input value={s.paymentTerms} onChange={e => onUpdate(tid, 'paymentTerms', e.target.value)} className={inputCls} placeholder="Ej: Pago a 30 días" />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Search + Create */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
          <input
            type="text"
            placeholder="Buscar por empresa, email o tenant..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={cn(inputCls, "pl-10")}
          />
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          className="bg-primary hover:bg-primary/90 text-white font-bold rounded-xl h-12 px-6 gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-all"
        >
          <Plus size={18} /> Nueva Empresa
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="p-8 bg-card border-2 border-border/60 rounded-[2.5rem] shadow-xl space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold tracking-tight">Nueva Empresa Corporativa</h3>
            <button type="button" onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className={labelCls}>Nombre de la Empresa</label>
              <input required value={form.companyName} onChange={e => setForm(p => ({ ...p, companyName: e.target.value }))} className={inputCls} placeholder="Ej: Acme Corp S.A." />
            </div>
            <div>
              <label className={labelCls}>CUIT</label>
              <input value={form.companyTaxId} onChange={e => setForm(p => ({ ...p, companyTaxId: e.target.value }))} className={inputCls} placeholder="30-12345678-9" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className={labelCls}>Email Corporativo (RRHH / Admin Corp)</label>
              <input required type="email" value={form.companyAdminEmail} onChange={e => setForm(p => ({ ...p, companyAdminEmail: e.target.value }))} className={inputCls} placeholder="rrhh@acmecorp.com" />
            </div>
            <div>
              <label className={labelCls}>Empleados (un email por línea)</label>
              <textarea
                value={form.employeeEmailsCsv}
                onChange={e => setForm(p => ({ ...p, employeeEmailsCsv: e.target.value }))}
                className={cn(inputCls, "min-h-[80px] resize-y font-mono text-xs")}
                placeholder="empleado1@acmecorp.com&#10;empleado2@acmecorp.com"
              />
            </div>
          </div>

          {/* Access Mode */}
          <div>
            <label className={labelCls}>Modo de Acceso</label>
            <div className="flex gap-3">
              <label className={cn(
                "flex-1 flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all",
                form.accessMode === 'specific' ? "border-primary/40 bg-primary/5" : "border-border/40 hover:bg-muted/40"
              )}>
                <input type="radio" name="accessMode" value="specific" checked={form.accessMode === 'specific'} onChange={() => setForm(p => ({ ...p, accessMode: 'specific' }))} className="sr-only" />
                <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center", form.accessMode === 'specific' ? "border-primary" : "border-border/60")}>
                  {form.accessMode === 'specific' && <div className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                <div>
                  <p className="text-sm font-bold">Tenants específicos</p>
                  <p className="text-xs text-muted-foreground/60">Seleccionar tenants manualmente</p>
                </div>
              </label>
              <label className={cn(
                "flex-1 flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all",
                form.accessMode === 'all' ? "border-primary/40 bg-primary/5" : "border-border/40 hover:bg-muted/40"
              )}>
                <input type="radio" name="accessMode" value="all" checked={form.accessMode === 'all'} onChange={() => setForm(p => ({ ...p, accessMode: 'all', selectedTenantIds: [] }))} className="sr-only" />
                <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center", form.accessMode === 'all' ? "border-primary" : "border-border/60")}>
                  {form.accessMode === 'all' && <div className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                <div>
                  <p className="text-sm font-bold flex items-center gap-1"><Globe size={14} /> Todos los tenants</p>
                  <p className="text-xs text-muted-foreground/60">Incluye tenants futuros</p>
                </div>
              </label>
            </div>
          </div>

          {form.accessMode === 'specific' && (
            <div>
              <label className={labelCls}>Tenants asignados</label>
              <TenantMultiSelect selected={form.selectedTenantIds} onChange={toggleFormTenant} />
              <TenantSettingsEditor tenantIds={form.selectedTenantIds} settings={form.tenantSettings} onUpdate={updateFormTenantSetting} />
            </div>
          )}

          <div>
            <label className={labelCls}>Notas</label>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className={cn(inputCls, "min-h-[80px] resize-y")} />
          </div>

          <div className="flex gap-3 pt-4 border-t border-border/40">
            <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-white font-bold rounded-xl h-12 px-8 gap-2 shadow-lg active:scale-95 transition-all">
              {saving ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
              {saving ? 'Guardando...' : 'Crear Empresa'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShowCreate(false)} className="font-bold rounded-xl h-12 px-8">
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {/* Edit form */}
      {editingId && (
        <form onSubmit={handleSaveEdit} className="p-8 bg-card border-2 border-border/60 rounded-[2.5rem] shadow-xl space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold tracking-tight">Editar {editForm.companyName}</h3>
            <button type="button" onClick={() => { setEditingId(null); setEditForm({ _id: '', companyName: '', companyTaxId: '', companyAdminEmail: '', notes: '', accessMode: 'specific', tenantIds: [], tenantSettings: {} }) }} className="text-muted-foreground hover:text-foreground transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className={labelCls}>Nombre de la Empresa</label>
              <input required value={editForm.companyName} onChange={e => setEditForm(p => ({ ...p, companyName: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>CUIT</label>
              <input value={editForm.companyTaxId} onChange={e => setEditForm(p => ({ ...p, companyTaxId: e.target.value }))} className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Email Corporativo</label>
            <input required type="email" value={editForm.companyAdminEmail} className={cn(inputCls, "opacity-60")} disabled />
            <p className="text-[10px] text-muted-foreground/50 font-medium mt-1">El email corporativo no se puede cambiar.</p>
          </div>

          {/* Access Mode */}
          <div>
            <label className={labelCls}>Modo de Acceso</label>
            <div className="flex gap-3">
              <label className={cn(
                "flex-1 flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all",
                editForm.accessMode === 'specific' ? "border-primary/40 bg-primary/5" : "border-border/40 hover:bg-muted/40"
              )}>
                <input type="radio" name="editAccessMode" value="specific" checked={editForm.accessMode === 'specific'} onChange={() => setEditForm(p => ({ ...p, accessMode: 'specific' }))} className="sr-only" />
                <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center", editForm.accessMode === 'specific' ? "border-primary" : "border-border/60")}>
                  {editForm.accessMode === 'specific' && <div className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                <div>
                  <p className="text-sm font-bold">Tenants específicos</p>
                  <p className="text-xs text-muted-foreground/60">Seleccionar tenants manualmente</p>
                </div>
              </label>
              <label className={cn(
                "flex-1 flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all",
                editForm.accessMode === 'all' ? "border-primary/40 bg-primary/5" : "border-border/40 hover:bg-muted/40"
              )}>
                <input type="radio" name="editAccessMode" value="all" checked={editForm.accessMode === 'all'} onChange={() => setEditForm(p => ({ ...p, accessMode: 'all', tenantIds: [] }))} className="sr-only" />
                <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center", editForm.accessMode === 'all' ? "border-primary" : "border-border/60")}>
                  {editForm.accessMode === 'all' && <div className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                <div>
                  <p className="text-sm font-bold flex items-center gap-1"><Globe size={14} /> Todos los tenants</p>
                  <p className="text-xs text-muted-foreground/60">Incluye tenants futuros</p>
                </div>
              </label>
            </div>
          </div>

          {editForm.accessMode === 'specific' && (
            <div>
              <label className={labelCls}>Tenants asignados</label>
              <TenantMultiSelect selected={editForm.tenantIds} onChange={toggleEditTenant} />
              <TenantSettingsEditor tenantIds={editForm.tenantIds} settings={editForm.tenantSettings} onUpdate={updateEditTenantSetting} />
            </div>
          )}

          <div>
            <label className={labelCls}>Notas</label>
            <textarea value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} className={cn(inputCls, "min-h-[80px] resize-y")} />
          </div>

          <div className="flex gap-3 pt-4 border-t border-border/40">
            <Button type="submit" disabled={editSaving} className="bg-primary hover:bg-primary/90 text-white font-bold rounded-xl h-12 px-8 gap-2 shadow-lg active:scale-95 transition-all">
              {editSaving ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
              {editSaving ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => { setEditingId(null); setEditForm({ _id: '', companyName: '', companyTaxId: '', companyAdminEmail: '', notes: '', accessMode: 'specific', tenantIds: [], tenantSettings: {} }) }} className="font-bold rounded-xl h-12 px-8">
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {/* Companies list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-3xl bg-muted flex items-center justify-center mb-4">
            <Building2 size={28} className="text-muted-foreground/50" />
          </div>
          <p className="text-muted-foreground font-medium">No hay empresas registradas</p>
          <p className="text-sm text-muted-foreground/50 mt-1">Registrá una empresa corporativa y asignale tenants</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(company => (
            <div key={company._id} className="p-6 bg-card border-2 border-border/60 rounded-[2rem] shadow-lg space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <Building2 size={22} strokeWidth={2.5} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold tracking-tight">{company.companyName}</h3>
                      <Badge className={cn('text-[10px] font-bold px-2 py-0.5 border', STATUS_LABELS[company.status]?.className)}>
                        {STATUS_LABELS[company.status]?.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {company.accessMode === 'all' ? (
                        <Badge className="text-[10px] font-bold px-2 py-0.5 border bg-primary/10 text-primary border-primary/20 flex items-center gap-1">
                          <Globe size={10} /> Todos los tenants
                        </Badge>
                      ) : (
                        company.tenantNames.map((name, i) => (
                          <Badge key={i} className="text-[10px] font-bold px-2 py-0.5 border bg-muted/30 text-muted-foreground border-border/40 flex items-center gap-1">
                            <Store size={10} /> {name}
                          </Badge>
                        ))
                      )}
                      {company.companyTaxId && (
                        <span className="text-xs text-muted-foreground/50 font-mono">· CUIT: {company.companyTaxId}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="text-[10px] font-bold px-2 py-0.5 border bg-muted/30 text-muted-foreground border-border/40">
                    {company.registeredBy === 'superadmin' ? 'Superadmin' : 'Tenant'}
                  </Badge>
                  <button
                    onClick={() => {
                      const settingsMap: Record<string, { paymentMode: string; paymentTerms: string }> = {}
                      for (const ts of company.tenantSettings) {
                        settingsMap[ts.tenantId] = { paymentMode: ts.paymentMode, paymentTerms: ts.paymentTerms }
                      }
                      setEditForm({
                        _id: company._id,
                        companyName: company.companyName,
                        companyTaxId: company.companyTaxId,
                        companyAdminEmail: company.companyAdminEmail,
                        notes: company.notes,
                        accessMode: company.accessMode,
                        tenantIds: company.tenantIds,
                        tenantSettings: settingsMap,
                      })
                      setEditingId(company._id)
                    }}
                    className="p-2 rounded-xl text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-all"
                    title="Editar"
                  >
                    <Pencil size={18} />
                  </button>
                  <button
                    onClick={() => handleToggleStatus(company)}
                    className={cn(
                      'p-2 rounded-xl transition-all',
                      company.status === 'active' ? 'text-emerald-600 hover:bg-emerald-500/10' : 'text-amber-600 hover:bg-amber-500/10'
                    )}
                    title={company.status === 'active' ? 'Suspender' : 'Reactivar'}
                  >
                    {company.status === 'active' ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                  </button>
                  <button
                    onClick={() => handleDelete(company)}
                    className="p-2 rounded-xl text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-all"
                    title="Eliminar"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-3 rounded-xl bg-muted/30 border border-border/40">
                  <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/50 mb-1">Email Corporativo</p>
                  <p className="text-sm font-mono font-medium">{company.companyAdminEmail}</p>
                </div>
                <div className="p-3 rounded-xl bg-muted/30 border border-border/40">
                  <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/50 mb-1">Acceso</p>
                  <p className="text-sm font-bold">{company.accessMode === 'all' ? 'Todos los tenants' : `${company.tenantIds.length} tenant(s)`}</p>
                </div>
                <div className="p-3 rounded-xl bg-muted/30 border border-border/40">
                  <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/50 mb-1">Empleados</p>
                  <p className="text-sm font-bold">{company.employeeEmails.length} emails</p>
                </div>
                <div className="p-3 rounded-xl bg-muted/30 border border-border/40">
                  <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/50 mb-1">Registrada por</p>
                  <p className="text-sm font-bold capitalize">{company.registeredBy}</p>
                </div>
              </div>

              {/* Employee list */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/50">Empleados Habilitados</p>
                  <button
                    onClick={() => setAddingEmployee(company._id)}
                    className="text-[10px] font-bold text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
                  >
                    <Plus size={12} /> Agregar
                  </button>
                </div>
                {company.employeeEmails.length === 0 ? (
                  <p className="text-xs text-muted-foreground/50 italic">Sin empleados registrados</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {company.employeeEmails.map(email => (
                      <div key={email} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/40 border border-border/40 group">
                        <span className="text-xs font-mono">{email}</span>
                        <button
                          onClick={() => handleRemoveEmployee(company._id, email)}
                          className="text-muted-foreground/30 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {addingEmployee === company._id && (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="email"
                      value={newEmployeeEmail}
                      onChange={e => setNewEmployeeEmail(e.target.value)}
                      placeholder="email@empresa.com"
                      className="flex-1 bg-muted/40 border-2 border-border/60 focus:border-primary/40 text-foreground text-sm rounded-xl px-3 py-2 outline-none transition-all"
                      autoFocus
                    />
                    <button
                      onClick={() => handleAddEmployee(company._id)}
                      className="bg-primary text-white p-2 rounded-xl hover:bg-primary/90 transition-all active:scale-95"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={() => { setAddingEmployee(null); setNewEmployeeEmail('') }}
                      className="text-muted-foreground p-2 rounded-xl hover:bg-muted transition-all"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>

              {/* Payment settings per tenant */}
              {company.tenantSettings.length > 0 && (
                <div className="p-3 rounded-xl bg-muted/30 border border-border/40">
                  <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/50 mb-2">Configuración de Pago por Tenant</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {company.tenantSettings.map(ts => {
                      const tenant = tenants.find(t => t._id === ts.tenantId)
                      return (
                        <div key={ts.tenantId} className="flex items-center gap-2 text-xs">
                          <span className="font-medium">{tenant?.name || ts.tenantId}:</span>
                          <span className="text-muted-foreground">{PAYMENT_MODE_LABELS[ts.paymentMode] || ts.paymentMode}</span>
                          {ts.paymentTerms && <span className="text-muted-foreground/50">· {ts.paymentTerms}</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
