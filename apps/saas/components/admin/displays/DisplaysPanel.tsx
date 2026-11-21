'use client'

// Panel «Pantallas»: pestañas Pantallas · Contenido · Métricas (responsive).
import { useState } from 'react'
import DisplaysManager from './DisplaysManager'
import ScreenPiecesManager from './ScreenPiecesManager'
import MarketingMetrics from '@/components/marketing/MarketingMetrics'

const TABS = [
  { id: 'devices', label: 'Pantallas' },
  { id: 'content', label: 'Contenido' },
  { id: 'metrics', label: 'Métricas' },
] as const

export default function DisplaysPanel({ tenantSlug, initialCode }: { tenantSlug: string; initialCode?: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('devices')
  return (
    <div className="space-y-4 min-w-0">
      <div role="tablist" aria-label="Pantallas" className="flex gap-1 overflow-x-auto rounded-2xl bg-muted p-1 [scrollbar-width:none]">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`min-h-[44px] flex-1 shrink-0 rounded-xl px-4 text-sm font-semibold ${tab === t.id ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'devices' && <DisplaysManager tenantSlug={tenantSlug} initialCode={initialCode} />}
      {tab === 'content' && <ScreenPiecesManager tenantSlug={tenantSlug} />}
      {tab === 'metrics' && <MarketingMetrics endpoint={`/api/${tenantSlug}/marketing-metrics`} />}
    </div>
  )
}
