'use client'

import { useState } from 'react'
import { Link2, Printer, Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { PrintButton } from './PrintButton'

/**
 * Acciones del reporte Z en el panel: imprimir en la térmica de la sede,
 * imprimir/guardar PDF desde el navegador y copiar el link compartible.
 */
export function ZShareActions({
  tenantSlug,
  registerId,
  sharePath,
  shareExpired,
}: {
  tenantSlug: string
  registerId: string
  sharePath: string | null
  shareExpired: boolean
}) {
  const [printing, setPrinting] = useState(false)
  const [copied, setCopied] = useState(false)

  const printThermal = async () => {
    setPrinting(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/admin/cash-registers/${registerId}/print`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'No se pudo imprimir')
      toast.success(`Enviado a ${body.printerName}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo imprimir')
    } finally {
      setPrinting(false)
    }
  }

  const copyLink = async () => {
    if (!sharePath) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${sharePath}`)
      setCopied(true)
      toast.success('Link copiado. Vence a los 30 días del cierre.')
      setTimeout(() => setCopied(false), 2500)
    } catch {
      toast.error('No se pudo copiar el link')
    }
  }

  const btn = 'inline-flex min-h-11 items-center gap-2 rounded-2xl border-2 border-border/60 bg-card px-4 text-sm font-bold hover:bg-muted disabled:opacity-50'

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <button type="button" className={btn} onClick={printThermal} disabled={printing}>
        {printing ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Printer size={16} aria-hidden />}
        Imprimir en la caja
      </button>
      <PrintButton label="PDF / imprimir" />
      {sharePath && (
        <button
          type="button"
          className={btn}
          onClick={copyLink}
          disabled={shareExpired}
          title={shareExpired ? 'El link venció (30 días)' : undefined}
        >
          {copied ? <Check size={16} aria-hidden /> : <Link2 size={16} aria-hidden />}
          {shareExpired ? 'Link vencido' : 'Copiar link para compartir'}
        </button>
      )}
    </div>
  )
}
