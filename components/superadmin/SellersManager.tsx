'use client'

import { useState, useEffect } from 'react'
import { UserPlus, KeyRound, Mail, Eye, EyeOff, Check, AlertCircle, Trash2, Store, X, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface Tenant {
    _id: string
    name: string
    slug: string
}

interface Seller {
    _id: string
    name: string
    email: string
    isActive: boolean
    assignedTenants: string[]
    createdAt: string
}

interface SellersManagerProps {
    initialSellers: Seller[]
}

type ResetState = 'idle' | 'open' | 'loading' | 'success' | 'error'

function PasswordResetRow({ userId }: { userId: string }) {
    const [state, setState] = useState<ResetState>('idle')
    const [password, setPassword] = useState('')
    const [showPw, setShowPw] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')

    const handleReset = async () => {
        setState('loading')
        setErrorMsg('')
        try {
            const res = await fetch(`/api/superadmin/users/${userId}/reset-password`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            })
            const data = await res.json()
            if (!res.ok) {
                setErrorMsg(data.error || 'Error al cambiar contraseña.')
                setState('error')
                return
            }
            setState('success')
            setTimeout(() => { setState('idle'); setPassword('') }, 2500)
        } catch {
            setErrorMsg('Error de conexión.')
            setState('error')
        }
    }

    if (state === 'idle') {
        return (
            <button
                onClick={() => setState('open')}
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
            >
                <KeyRound size={11} /> Reset
            </button>
        )
    }

    if (state === 'success') {
        return (
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-500">
                <Check size={11} /> OK
            </span>
        )
    }

    return (
        <div className="flex items-center gap-2">
            <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Nueva pass"
                disabled={state === 'loading'}
                className="h-6 text-xs bg-muted/40 border border-border/60 rounded-lg px-2 w-28"
            />
            <button
                onClick={() => setShowPw(s => !s)}
                className="text-muted-foreground"
            >
                {showPw ? <EyeOff size={11} /> : <Eye size={11} />}
            </button>
            <button
                onClick={handleReset}
                disabled={state === 'loading' || password.length < 8}
                className="h-6 px-2 rounded bg-primary text-white text-[10px] font-bold"
            >
                {state === 'loading' ? '…' : '✓'}
            </button>
        </div>
    )
}

function TenantSelector({ sellerId, assignedTenants, onUpdate }: {
    sellerId: string
    assignedTenants: string[]
    onUpdate: (tenants: string[]) => void
}) {
    const [isOpen, setIsOpen] = useState(false)
    const [tenants, setTenants] = useState<Tenant[]>([])
    const [loading, setLoading] = useState(false)
    const [selected, setSelected] = useState<string[]>(assignedTenants)

    useEffect(() => {
        if (isOpen && tenants.length === 0) {
            setLoading(true)
            fetch('/api/superadmin/tenants')
                .then(r => r.json())
                .then(data => setTenants(data.tenants || []))
                .finally(() => setLoading(false))
        }
    }, [isOpen])

    const handleToggle = (tenantId: string) => {
        const newSelected = selected.includes(tenantId)
            ? selected.filter(id => id !== tenantId)
            : [...selected, tenantId]
        setSelected(newSelected)
    }

    const handleSave = async () => {
        await fetch(`/api/superadmin/sellers/${sellerId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assignedTenants: selected }),
        })
        onUpdate(selected)
        setIsOpen(false)
    }

    if (!isOpen) {
        const count = assignedTenants.length
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
            >
                <Store size={11} /> {count === 0 ? 'Asignar' : `${count} tenant${count > 1 ? 's' : ''}`}
            </button>
        )
    }

    return (
        <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 flex-wrap max-w-[200px]">
                {tenants.map(t => (
                    <button
                        key={t._id}
                        onClick={() => handleToggle(t._id)}
                        className={cn(
                            'text-[10px] px-2 py-0.5 rounded-full border transition-colors',
                            selected.includes(t._id)
                                ? 'bg-primary text-white border-primary'
                                : 'bg-muted/30 text-muted-foreground border-border hover:border-primary/40'
                        )}
                    >
                        {t.slug}
                    </button>
                ))}
            </div>
            <button
                onClick={handleSave}
                className="h-6 px-2 rounded bg-emerald-500 text-white text-[10px] font-bold"
            >
                ✓
            </button>
            <button
                onClick={() => { setIsOpen(false); setSelected(assignedTenants) }}
                className="h-6 px-2 rounded border border-border text-[10px]"
            >
                ✕
            </button>
        </div>
    )
}

export default function SellersManager({ initialSellers }: SellersManagerProps) {
    const [sellers, setSellers] = useState<Seller[]>(initialSellers)
    const [showAddForm, setShowAddForm] = useState(false)
    const [form, setForm] = useState({ name: '', email: '', password: '' })
    const [addState, setAddState] = useState<'idle' | 'loading' | 'error'>('idle')
    const [addError, setAddError] = useState('')
    const [showNewPw, setShowNewPw] = useState(false)

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        setAddState('loading')
        setAddError('')
        try {
            const res = await fetch('/api/superadmin/sellers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            })
            const data = await res.json()
            if (!res.ok) {
                setAddError(data.error || 'Error al crear vendedor.')
                setAddState('error')
                return
            }
            setSellers(prev => [data.seller, ...prev])
            setForm({ name: '', email: '', password: '' })
            setShowAddForm(false)
            setAddState('idle')
        } catch {
            setAddError('Error de conexión.')
            setAddState('error')
        }
    }

    const handleDelete = async (sellerId: string) => {
        if (!confirm('¿Eliminar este vendedor?')) return
        try {
            const res = await fetch(`/api/superadmin/sellers/${sellerId}`, { method: 'DELETE' })
            if (res.ok) {
                setSellers(prev => prev.filter(s => s._id !== sellerId))
            }
        } catch (e) {
            console.error(e)
        }
    }

    const handleTenantUpdate = (sellerId: string, tenants: string[]) => {
        setSellers(prev => prev.map(s => s._id === sellerId ? { ...s, assignedTenants: tenants } : s))
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground">Vendedores</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Gestiona usuarios vendedores que pueden previsualizar menús
                </p>
            </div>

            {sellers.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground font-medium text-sm bg-muted/30 rounded-2xl border border-border/60">
                    No hay vendedores creados.
                </div>
            ) : (
                <div className="space-y-3">
                    {sellers.map(seller => (
                        <div
                            key={seller._id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-card border-2 border-border/60 rounded-2xl hover:shadow-md transition-all duration-200"
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center font-bold text-emerald-500 text-sm shrink-0">
                                    {seller.name.slice(0, 1).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                    <p className="font-bold text-foreground text-sm truncate">{seller.name}</p>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <Mail size={10} className="text-muted-foreground shrink-0" />
                                        <p className="text-muted-foreground text-xs truncate font-medium">{seller.email}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2 sm:items-end shrink-0">
                                <div className="flex items-center gap-2">
                                    <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full">
                                        Setter
                                    </Badge>
                                    <div className={cn(
                                        'w-2 h-2 rounded-full',
                                        seller.isActive ? 'bg-emerald-500' : 'bg-destructive'
                                    )} title={seller.isActive ? 'Activo' : 'Inactivo'} />
                                </div>
                                <div className="flex items-center gap-2 flex-wrap justify-end">
                                    <TenantSelector
                                        sellerId={seller._id}
                                        assignedTenants={seller.assignedTenants}
                                        onUpdate={(tenants) => handleTenantUpdate(seller._id, tenants)}
                                    />
                                    <PasswordResetRow userId={seller._id} />
                                    <button
                                        onClick={() => handleDelete(seller._id)}
                                        className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-destructive transition-colors"
                                    >
                                        <Trash2 size={11} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {!showAddForm ? (
                <button
                    onClick={() => setShowAddForm(true)}
                    className="w-full h-12 rounded-2xl border-2 border-dashed border-border/60 flex items-center justify-center gap-2 text-muted-foreground text-xs font-bold uppercase tracking-widest hover:border-primary/40 hover:text-primary transition-all"
                >
                    <UserPlus size={14} /> Agregar vendedor
                </button>
            ) : (
                <form
                    onSubmit={handleAdd}
                    className="p-5 bg-muted/30 border-2 border-border/60 rounded-2xl space-y-4"
                >
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Nuevo vendedor</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Nombre</label>
                            <input
                                type="text"
                                value={form.name}
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                placeholder="Nombre completo"
                                required
                                disabled={addState === 'loading'}
                                className="w-full h-9 text-sm bg-background border border-border/60 rounded-xl px-3 outline-none focus:border-primary/40 transition-colors"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Email</label>
                            <input
                                type="email"
                                value={form.email}
                                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                                placeholder="vendedor@ejemplo.com"
                                required
                                disabled={addState === 'loading'}
                                className="w-full h-9 text-sm bg-background border border-border/60 rounded-xl px-3 outline-none focus:border-primary/40 transition-colors"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Contraseña</label>
                            <div className="relative flex items-center">
                                <input
                                    type={showNewPw ? 'text' : 'password'}
                                    value={form.password}
                                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                                    placeholder="Mínimo 8 caracteres"
                                    required
                                    minLength={8}
                                    disabled={addState === 'loading'}
                                    className="w-full h-9 text-sm bg-background border border-border/60 rounded-xl px-3 pr-9 outline-none focus:border-primary/40 transition-colors font-mono"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNewPw(s => !s)}
                                    className="absolute right-3 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    {showNewPw ? <EyeOff size={13} /> : <Eye size={13} />}
                                </button>
                            </div>
                        </div>
                    </div>

                    {addState === 'error' && (
                        <p className="flex items-center gap-1.5 text-xs text-destructive font-medium">
                            <AlertCircle size={12} /> {addError}
                        </p>
                    )}

                    <div className="flex gap-3 pt-1">
                        <button
                            type="submit"
                            disabled={addState === 'loading'}
                            className="h-9 px-5 rounded-xl bg-primary text-white text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 hover:bg-primary/90 transition-colors"
                        >
                            {addState === 'loading' ? 'Creando…' : 'Crear vendedor'}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setShowAddForm(false); setAddError(''); setAddState('idle') }}
                            disabled={addState === 'loading'}
                            className="h-9 px-5 rounded-xl border border-border/60 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
                        >
                            Cancelar
                        </button>
                    </div>
                </form>
            )}
        </div>
    )
}
