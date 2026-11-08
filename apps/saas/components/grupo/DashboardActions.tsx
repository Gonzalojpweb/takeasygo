'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { FileSpreadsheet, FileText, Mail, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

/** Descargar lo que se está viendo (mismos filtros) y prender/apagar el resumen de los lunes. */
export default function DashboardActions({ slug, summaryEnabled }: { slug: string; summaryEnabled: boolean }) {
  const params = useSearchParams()
  const [enabled, setEnabled] = useState(summaryEnabled)
  const [saving, setSaving] = useState(false)
  const query = new URLSearchParams(params.toString())
  const href = (formato: 'xlsx' | 'pdf') => { const q = new URLSearchParams(query); q.set('formato', formato); return `/api/grupo/${slug}/export?${q.toString()}` }

  async function toggle() {
    const next = !enabled
    setSaving(true)
    try {
      const res = await fetch(`/api/grupo/${slug}/weekly-summary`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: next }) })
      if (!res.ok) throw new Error()
      setEnabled(next)
      toast.success(next ? 'Te vamos a mandar el resumen todos los lunes.' : 'Listo, no te mandamos más el resumen semanal.')
    } catch {
      toast.error('No se pudo guardar. Probá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={href('xlsx')} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm hover:bg-muted"><FileSpreadsheet size={14} /> Excel</a>
      <a href={href('pdf')} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm hover:bg-muted"><FileText size={14} /> PDF</a>
      <button type="button" onClick={toggle} disabled={saving} role="switch" aria-checked={enabled}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${enabled ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'border-border text-muted-foreground hover:bg-muted'}`}>
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
        Resumen semanal por email: {enabled ? 'prendido' : 'apagado'}
      </button>
    </div>
  )
}
