'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { MessageCircle, Mail, BellOff, Loader2 } from 'lucide-react'

// ============================================================================
// Acciones de contacto de un cliente de reservas (14/11/2026)
// ============================================================================
// WhatsApp con mensaje armado (menú/delivery, invitación, club). Los mensajes
// PROMOCIONALES solo aparecen si el cliente dio permiso al reservar; sin
// permiso queda solo «Sobre su reserva» (uso operativo). «Dar de baja» quita
// el permiso cuando el cliente lo pide.
// ============================================================================

export interface CustomerTemplateLink {
  id: string
  label: string
  promotional: boolean
  href: string | null
}

interface Props {
  tenantSlug: string
  customerKey: string
  optIn: boolean
  whatsapp: CustomerTemplateLink[]
  mailto: string | null
}

export function ReservationCustomerActions({ tenantSlug, customerKey, optIn, whatsapp, mailto }: Props) {
  const [allowed, setAllowed] = useState(optIn)
  const [busy, setBusy] = useState(false)
  const links = whatsapp.filter((l) => l.href && (!l.promotional || allowed))

  const optOut = async () => {
    if (!window.confirm('¿Dar de baja a este cliente de novedades y promos?')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/reservas/contacts/opt-out`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: customerKey }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'No se pudo dar de baja')
      setAllowed(false)
      toast.success('Cliente dado de baja de novedades y promos')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {links.length > 0 && (
        <details className="relative">
          <summary className="flex cursor-pointer list-none items-center gap-1 rounded-xl border-2 border-border/60 px-2.5 py-1 text-xs font-bold hover:bg-muted/40">
            <MessageCircle size={13} /> WhatsApp
          </summary>
          <div className="absolute right-0 z-10 mt-1 w-56 rounded-2xl border-2 border-border/60 bg-card p-1.5 shadow-lg">
            {links.map((l) => (
              <a key={l.id} href={l.href!} target="_blank" rel="noopener noreferrer" className="block rounded-xl px-3 py-2 text-xs font-bold hover:bg-muted/50">
                {l.label}
              </a>
            ))}
            {!allowed && <p className="px-3 py-2 text-[11px] text-muted-foreground">Sin permiso para promos: solo contacto por su reserva.</p>}
          </div>
        </details>
      )}
      {mailto && (
        <a href={mailto} className="flex items-center gap-1 rounded-xl border-2 border-border/60 px-2.5 py-1 text-xs font-bold hover:bg-muted/40">
          <Mail size={13} /> Email
        </a>
      )}
      {allowed && (
        <button type="button" onClick={optOut} disabled={busy} className="flex items-center gap-1 rounded-xl px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50" title="El cliente pidió no recibir más novedades">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <BellOff size={13} />} Dar de baja
        </button>
      )}
    </div>
  )
}
