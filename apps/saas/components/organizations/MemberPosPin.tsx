'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { KeyRound, Copy, X } from 'lucide-react'

// PIN del POS de un miembro en una marca de su grupo (multi-marca D6).
// El PIN lo genera el servidor y se muestra UNA sola vez.

export default function MemberPosPin({ slug, brandName, hasPin }: { slug: string; brandName: string; hasPin: boolean }) {
  const [pin, setPin] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [has, setHas] = useState(hasPin)

  async function generate() {
    setBusy(true)
    try {
      const r = await fetch('/api/grupo/pos-pin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenantSlug: slug }) })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error ?? 'No se pudo generar el PIN')
      setPin(data.pin)
      setHas(true)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!pin) return
    try {
      await navigator.clipboard.writeText(pin)
      toast.success('PIN copiado')
    } catch {
      toast.message(`Tu PIN: ${pin}`)
    }
  }

  if (pin) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5">
        <span className="text-xs text-muted-foreground">PIN en {brandName}:</span>
        <span className="font-mono text-base font-bold tracking-[0.3em] tabular-nums">{pin}</span>
        <button onClick={() => void copy()} className="text-muted-foreground hover:text-foreground" aria-label="Copiar PIN"><Copy size={14} /></button>
        <button onClick={() => setPin(null)} className="text-muted-foreground hover:text-foreground" aria-label="Ocultar PIN"><X size={14} /></button>
      </div>
    )
  }

  return (
    <button
      onClick={() => void generate()}
      disabled={busy}
      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
      title={has ? 'Generar un PIN nuevo (el anterior deja de servir)' : 'Generar tu PIN para el POS de esta marca'}
    >
      <KeyRound size={13} /> {has ? 'Nuevo PIN del POS' : 'PIN del POS'}
    </button>
  )
}
