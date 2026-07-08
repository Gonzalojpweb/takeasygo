'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Plus, X, Copy, Check, User, Phone, History, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Person {
  _id: string
  name: string
  phone: string
  tokenPrefix: string
  isActive: boolean
  createdAt: string
}

interface Props {
  tenantSlug: string
  tenantId: string
  initialPersons: Person[]
}

export default function DeliveryFleetManager({ tenantSlug, initialPersons }: Props) {
  const [persons, setPersons] = useState<Person[]>(initialPersons)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [creating, setCreating] = useState(false)
  const [newLink, setNewLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleCreate() {
    if (!name.trim() || !phone.trim()) {
      toast.error('Nombre y teléfono son requeridos')
      return
    }

    setCreating(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/delivery/persons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al crear delivery')
      }

      const data = await res.json()
      setNewLink(data.deliveryLink)
      setPersons(prev => [data.person, ...prev])
      setName('')
      setPhone('')
      setShowForm(false)
      toast.success('Delivery creado')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleDeactivate(id: string) {
    if (!confirm('¿Desactivar este delivery? Ya no podrá acceder con su link.')) return

    try {
      const res = await fetch(`/api/${tenantSlug}/delivery/persons/${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Error al desactivar')

      setPersons(prev => prev.map(p => p._id === id ? { ...p, isActive: false } : p))
      toast.success('Delivery desactivado')
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  function handleCopyLink() {
    if (newLink) {
      navigator.clipboard.writeText(newLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const activePersons = persons.filter(p => p.isActive)
  const inactivePersons = persons.filter(p => !p.isActive)

  return (
    <div className="space-y-6">
      {/* New link banner */}
      {newLink && (
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Check size={16} className="text-emerald-600 shrink-0" />
            <span className="font-bold text-emerald-800 text-sm">Delivery creado exitosamente</span>
          </div>
          <p className="text-xs text-emerald-700">
            Compartí este link con el delivery. Solo se muestra una vez.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white border border-emerald-200 rounded-xl px-4 py-3 text-xs font-mono break-all select-all">
              {newLink}
            </code>
            <button
              onClick={handleCopyLink}
              className="h-10 w-10 rounded-xl bg-white border border-emerald-200 flex items-center justify-center hover:bg-emerald-100 transition-all shrink-0"
            >
              {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
            </button>
          </div>
          <button
            onClick={() => setNewLink(null)}
            className="text-xs text-emerald-600 font-medium hover:underline"
          >
            Descartar
          </button>
        </div>
      )}

      {/* Create form */}
      {showForm ? (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm">Nuevo delivery person</h3>
            <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground transition-colors">
              <X size={16} />
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Nombre</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ej: Carlos Pérez"
                className="w-full border border-border/60 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-foreground/40 transition-all bg-background"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Teléfono</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="Ej: 11 1234 5678"
                className="w-full border border-border/60 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-foreground/40 transition-all bg-background"
              />
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="w-full py-3 rounded-xl bg-foreground text-background text-sm font-bold hover:opacity-90 transition-all disabled:opacity-50"
          >
            {creating ? 'Creando...' : 'Crear delivery'}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all w-fit"
        >
          <Plus size={16} />
          Agregar delivery
        </button>
      )}

      {/* Active persons */}
      <div>
        <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-widest mb-3">
          Activos ({activePersons.length})
        </h3>
        {activePersons.length === 0 ? (
          <div className="text-center py-12 rounded-2xl border border-dashed border-border">
            <User size={24} className="mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No hay delivery persons activos</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Agregá tu primer delivery para comenzar</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {activePersons.map(person => (
              <div key={person._id} className="bg-card border border-border/70 rounded-2xl p-4 space-y-3 hover:shadow-sm transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <User size={14} className="text-primary" />
                    </div>
                    <div>
                      <p className="font-bold text-sm">{person.name}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone size={10} />
                        {person.phone}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 font-bold">
                    Activo
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground font-mono">
                    Prefix: {person.tokenPrefix}...
                  </span>
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/${tenantSlug}/admin/delivery/${person._id}`}
                      className="text-[10px] text-primary hover:text-primary/80 font-medium transition-colors flex items-center gap-1"
                    >
                      <History size={10} />
                      Historial
                    </Link>
                    <button
                      onClick={() => handleDeactivate(person._id)}
                      className="text-[10px] text-red-400 hover:text-red-600 font-medium transition-colors cursor-pointer"
                    >
                      Desactivar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inactive persons */}
      {inactivePersons.length > 0 && (
        <div>
          <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-widest mb-3">
            Inactivos ({inactivePersons.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {inactivePersons.map(person => (
              <div key={person._id} className="bg-card border border-border/50 rounded-2xl p-4 space-y-3 opacity-60">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center">
                    <User size={14} className="text-zinc-400" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-muted-foreground">{person.name}</p>
                    <p className="text-xs text-muted-foreground">{person.phone}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
