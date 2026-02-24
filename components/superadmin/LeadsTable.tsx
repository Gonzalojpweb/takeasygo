'use client'

import { useState } from 'react'
import { Mail, Phone, Store, Calendar, StickyNote } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

type LeadStatus = 'new' | 'contacted' | 'closed' | 'lost'

interface Lead {
    _id: string
    name: string
    business: string
    email: string
    phone: string
    plan: string
    planId: string
    status: LeadStatus
    notes: string
    createdAt: string
}

interface LeadsTableProps {
    leads: Lead[]
}

const STATUS_CONFIG: Record<LeadStatus, { label: string; className: string }> = {
    new:       { label: 'Nuevo',     className: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
    contacted: { label: 'Contactado', className: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
    closed:    { label: 'Cerrado',   className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
    lost:      { label: 'Perdido',   className: 'bg-zinc-400/10 text-zinc-400 border-zinc-400/20' },
}

const FILTERS: Array<{ key: LeadStatus | 'all'; label: string }> = [
    { key: 'all',       label: 'Todos' },
    { key: 'new',       label: 'Nuevos' },
    { key: 'contacted', label: 'Contactados' },
    { key: 'closed',    label: 'Cerrados' },
    { key: 'lost',      label: 'Perdidos' },
]

export default function LeadsTable({ leads: initialLeads }: LeadsTableProps) {
    const [leads, setLeads] = useState<Lead[]>(initialLeads)
    const [filter, setFilter] = useState<LeadStatus | 'all'>('all')
    const [savingId, setSavingId] = useState<string | null>(null)

    const visible = filter === 'all' ? leads : leads.filter(l => l.status === filter)

    const counts = {
        all:       leads.length,
        new:       leads.filter(l => l.status === 'new').length,
        contacted: leads.filter(l => l.status === 'contacted').length,
        closed:    leads.filter(l => l.status === 'closed').length,
        lost:      leads.filter(l => l.status === 'lost').length,
    }

    const updateLead = async (id: string, patch: Partial<Pick<Lead, 'status' | 'notes'>>) => {
        setSavingId(id)
        try {
            const res = await fetch(`/api/superadmin/leads/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patch),
            })
            if (res.ok) {
                const { lead } = await res.json()
                setLeads(prev => prev.map(l => l._id === id ? { ...l, ...lead } : l))
            }
        } finally {
            setSavingId(null)
        }
    }

    return (
        <div className="space-y-6">
            {/* Filter bar */}
            <div className="flex flex-wrap gap-2">
                {FILTERS.map(f => (
                    <button
                        key={f.key}
                        onClick={() => setFilter(f.key)}
                        className={cn(
                            'px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest border-2 transition-all',
                            filter === f.key
                                ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20'
                                : 'bg-transparent text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
                        )}
                    >
                        {f.label}
                        <span className={cn(
                            'ml-2 px-1.5 py-0.5 rounded-full text-[9px]',
                            filter === f.key ? 'bg-white/20' : 'bg-muted'
                        )}>
                            {counts[f.key]}
                        </span>
                    </button>
                ))}
            </div>

            {/* Cards grid */}
            {visible.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground font-medium">
                    No hay leads en esta categoría.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {visible.map(lead => (
                        <div
                            key={lead._id}
                            className="bg-card border-2 border-border/60 rounded-2xl p-6 flex flex-col gap-4 hover:shadow-lg transition-all duration-300"
                        >
                            {/* Top row: name + status */}
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-foreground text-base truncate">{lead.name}</p>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <Store size={11} className="text-muted-foreground shrink-0" />
                                        <p className="text-muted-foreground text-xs truncate font-medium">{lead.business}</p>
                                    </div>
                                </div>

                                {/* Status select */}
                                <select
                                    value={lead.status}
                                    disabled={savingId === lead._id}
                                    onChange={e => updateLead(lead._id, { status: e.target.value as LeadStatus })}
                                    className={cn(
                                        'text-[10px] font-bold uppercase tracking-widest rounded-full px-3 py-1.5 border-2 cursor-pointer outline-none transition-all',
                                        STATUS_CONFIG[lead.status].className,
                                        'bg-transparent'
                                    )}
                                >
                                    {(Object.keys(STATUS_CONFIG) as LeadStatus[]).map(s => (
                                        <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Plan badge — sky for demo leads, primary (orange) for subscriptions */}
                            <Badge className={cn(
                                'w-fit text-[10px] font-bold uppercase tracking-wider border-2 px-3 py-1 rounded-full',
                                lead.planId === 'demo'
                                    ? 'bg-sky-500/10 text-sky-500 border-sky-500/20'
                                    : 'bg-primary/10 text-primary border-primary/20'
                            )}>
                                {lead.planId === 'demo' ? 'Demo' : lead.plan}
                            </Badge>

                            {/* Contact info */}
                            <div className="space-y-1.5">
                                <a
                                    href={`mailto:${lead.email}`}
                                    className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors group"
                                >
                                    <Mail size={12} className="shrink-0 group-hover:text-primary transition-colors" />
                                    <span className="truncate">{lead.email}</span>
                                </a>
                                <a
                                    href={`tel:${lead.phone}`}
                                    className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors group"
                                >
                                    <Phone size={12} className="shrink-0 group-hover:text-primary transition-colors" />
                                    <span>{lead.phone}</span>
                                </a>
                            </div>

                            {/* Notes */}
                            <div className="flex-1">
                                <div className="flex items-center gap-1.5 mb-1.5">
                                    <StickyNote size={11} className="text-muted-foreground" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Notas</span>
                                </div>
                                <textarea
                                    defaultValue={lead.notes}
                                    placeholder="Agregar notas internas…"
                                    rows={2}
                                    disabled={savingId === lead._id}
                                    onBlur={e => {
                                        if (e.target.value !== lead.notes) {
                                            updateLead(lead._id, { notes: e.target.value })
                                        }
                                    }}
                                    className="w-full text-xs bg-muted/40 border border-border/40 rounded-xl p-2.5 resize-none outline-none focus:border-primary/40 transition-colors text-foreground placeholder:text-muted-foreground/50 font-medium"
                                />
                            </div>

                            {/* Date */}
                            <div className="flex items-center gap-1.5 pt-2 border-t border-border/40">
                                <Calendar size={11} className="text-muted-foreground" />
                                <span className="text-[10px] text-muted-foreground font-bold" suppressHydrationWarning>
                                    {new Date(lead.createdAt).toLocaleDateString('es-AR', {
                                        day: '2-digit', month: 'short', year: 'numeric',
                                    })}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
