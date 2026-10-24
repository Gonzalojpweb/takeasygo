'use client'

import { Printer } from 'lucide-react'

/** Imprimir / guardar como PDF (diálogo del navegador). */
export function PrintButton({ label = 'Imprimir o guardar PDF' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-11 items-center gap-2 rounded-2xl border-2 border-border/60 bg-card px-4 text-sm font-bold hover:bg-muted"
    >
      <Printer size={16} aria-hidden />
      {label}
    </button>
  )
}
