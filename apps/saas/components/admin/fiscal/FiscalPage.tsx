'use client'

import { useState } from 'react'
import FiscalSettings from './FiscalSettings'
import FiscalDocuments from './FiscalDocuments'

/** Factura electrónica: dos pestañas para no apilar todo en una página larga. */
export default function FiscalPage({ tenantSlug }: { tenantSlug: string }) {
  const [tab, setTab] = useState<'documents' | 'settings'>('documents')
  return (
    <div className="space-y-6 pb-16">
      <div className="flex gap-2" role="tablist" aria-label="Factura electrónica">
        {(
          [
            ['documents', 'Comprobantes'],
            ['settings', 'Configuración'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`min-h-11 rounded-2xl border-2 px-5 text-sm font-black ${
              tab === id ? 'border-primary bg-primary/5' : 'border-border/60 hover:bg-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'documents' ? <FiscalDocuments tenantSlug={tenantSlug} /> : <FiscalSettings tenantSlug={tenantSlug} />}
    </div>
  )
}
