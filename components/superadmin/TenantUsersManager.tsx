'use client'

import { useState } from 'react'
import { UserPlus, KeyRound, Mail, Eye, EyeOff, Check, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

type UserRole = 'admin' | 'manager' | 'staff' | 'cashier'

interface TenantUser {
    _id: string
    name: string
    email: string
    role: UserRole
    isActive: boolean
    createdAt: string
}

interface TenantUsersManagerProps {
    tenantId: string
    initialUsers: TenantUser[]
}

const ROLE_CONFIG: Record<UserRole, { label: string; className: string }> = {
    admin:   { label: 'Admin',    className: 'bg-primary/10 text-primary border-primary/20' },
    manager: { label: 'Manager',  className: 'bg-violet-500/10 text-violet-500 border-violet-500/20' },
    staff:   { label: 'Staff',    className: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
    cashier: { label: 'Cajero',   className: 'bg-sky-500/10 text-sky-500 border-sky-500/20' },
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
                <KeyRound size={11} /> Reset password
            </button>
        )
    }

    if (state === 'success') {
        return (
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-500">
                <Check size={11} /> Contraseña actualizada
            </span>
        )
    }

    return (
        <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex items-center">
                <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Nueva contraseña"
                    disabled={state === 'loading'}
                    className="h-7 text-xs bg-muted/40 border border-border/60 rounded-lg px-2.5 pr-7 outline-none focus:border-primary/40 transition-colors font-mono w-44"
                />
                <button
                    type="button"
                    onClick={() => setShowPw(s => !s)}
                    className="absolute right-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                    {showPw ? <EyeOff size={11} /> : <Eye size={11} />}
                </button>
            </div>
            <button
                onClick={handleReset}
                disabled={state === 'loading' || password.length < 8}
                className="h-7 px-3 rounded-lg bg-primary text-white text-[10px] font-bold uppercase tracking-widest disabled:opacity-40 hover:bg-primary/90 transition-colors"
            >
                {state === 'loading' ? '…' : 'Guardar'}
            </button>
            <button
                onClick={() => { setState('idle'); setPassword('') }}
                disabled={state === 'loading'}
                className="h-7 px-3 rounded-lg border border-border/60 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
            >
                Cancelar
            </button>
            {state === 'error' && (
                <span className="flex items-center gap-1 text-[10px] text-destructive font-medium">
                    <AlertCircle size={10} /> {errorMsg}
                </span>
            )}
        </div>
    )
}

export default function TenantUsersManager({ tenantId, initialUsers }: TenantUsersManagerProps) {
    const [users, setUsers] = useState<TenantUser[]>(initialUsers)
    const [showAddForm, setShowAddForm] = useState(false)
    const [form, setForm] = useState({ name: '', email: '', password: '', role: 'admin' as UserRole })
    const [addState, setAddState] = useState<'idle' | 'loading' | 'error'>('idle')
    const [addError, setAddError] = useState('')
    const [showNewPw, setShowNewPw] = useState(false)

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        setAddState('loading')
        setAddError('')
        try {
            const res = await fetch(`/api/superadmin/tenants/${tenantId}/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            })
            const data = await res.json()
            if (!res.ok) {
                setAddError(data.error || 'Error al crear usuario.')
                setAddState('error')
                return
            }
            setUsers(prev => [...prev, data.user])
            setForm({ name: '', email: '', password: '', role: 'admin' })
            setShowAddForm(false)
            setAddState('idle')
        } catch {
            setAddError('Error de conexión.')
            setAddState('error')
        }
    }

    return (
        <div className="space-y-6">
            {/* Users list */}
            {users.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground font-medium text-sm">
                    No hay usuarios para este tenant.
                </div>
            ) : (
                <div className="space-y-3">
                    {users.map(user => (
                        <div
                            key={user._id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-card border-2 border-border/60 rounded-2xl hover:shadow-md transition-all duration-200"
                        >
                            {/* User info */}
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center font-bold text-primary text-sm shrink-0">
                                    {user.name.slice(0, 1).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                    <p className="font-bold text-foreground text-sm truncate">{user.name}</p>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <Mail size={10} className="text-muted-foreground shrink-0" />
                                        <p className="text-muted-foreground text-xs truncate font-medium">{user.email}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Right side: role badge + status + reset */}
                            <div className="flex flex-col gap-2 sm:items-end shrink-0">
                                <div className="flex items-center gap-2">
                                    <Badge className={cn(
                                        'text-[10px] font-bold uppercase tracking-widest border px-2.5 py-0.5 rounded-full',
                                        ROLE_CONFIG[user.role]?.className ?? 'bg-muted text-muted-foreground border-border'
                                    )}>
                                        {ROLE_CONFIG[user.role]?.label ?? user.role}
                                    </Badge>
                                    <div className={cn(
                                        'w-2 h-2 rounded-full',
                                        user.isActive ? 'bg-emerald-500' : 'bg-destructive'
                                    )} title={user.isActive ? 'Activo' : 'Inactivo'} />
                                </div>
                                <PasswordResetRow userId={user._id} />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add user section */}
            {!showAddForm ? (
                <button
                    onClick={() => setShowAddForm(true)}
                    className="w-full h-12 rounded-2xl border-2 border-dashed border-border/60 flex items-center justify-center gap-2 text-muted-foreground text-xs font-bold uppercase tracking-widest hover:border-primary/40 hover:text-primary transition-all"
                >
                    <UserPlus size={14} /> Agregar usuario
                </button>
            ) : (
                <form
                    onSubmit={handleAdd}
                    className="p-5 bg-muted/30 border-2 border-border/60 rounded-2xl space-y-4"
                >
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Nuevo usuario</p>

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
                                placeholder="admin@restaurante.com"
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
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Rol</label>
                            <select
                                value={form.role}
                                onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}
                                disabled={addState === 'loading'}
                                className="w-full h-9 text-sm bg-background border border-border/60 rounded-xl px-3 outline-none focus:border-primary/40 transition-colors cursor-pointer"
                            >
                                <option value="admin">Admin</option>
                                <option value="manager">Manager</option>
                                <option value="staff">Staff</option>
                                <option value="cashier">Cajero</option>
                            </select>
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
                            {addState === 'loading' ? 'Creando…' : 'Crear usuario'}
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
