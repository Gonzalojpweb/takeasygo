'use client'

import { Copy, Check, Sparkles } from 'lucide-react'
import { useState } from 'react'
import InfoTooltip from './InfoTooltip'

interface Props {
  plan: string
  whatsapp: string
}

export default function DailyInsightPro({ plan, whatsapp }: Props) {
  const [copied, setCopied] = useState(false)

  const isPremium = plan === 'full'

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(whatsapp)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const ta = document.createElement('textarea')
      ta.value = whatsapp
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (!isPremium) {
    return (
      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={18} className="text-indigo-600" />
          <h2 className="text-sm font-semibold text-indigo-900">Resumen diario</h2>
        </div>
        <div className="text-center py-8">
          <p className="text-sm font-semibold text-zinc-500">Actualizá a Premium para el resumen diario</p>
          <p className="text-xs text-zinc-400 mt-1">Formato listo para WhatsApp, email o push</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-indigo-600" />
          <h2 className="text-sm font-semibold text-indigo-900">Resumen diario</h2>
          <InfoTooltip text="Formato listo para copiar y enviar por WhatsApp, email o notificación push." />
        </div>
      </div>

      <div className="bg-white/80 rounded-xl border border-indigo-100 p-4">
        <pre className="text-xs text-zinc-700 whitespace-pre-wrap font-sans leading-relaxed">
          {whatsapp}
        </pre>
      </div>

      <button
        onClick={handleCopy}
        className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
      >
        {copied ? (
          <>
            <Check size={14} />
            Copiado
          </>
        ) : (
          <>
            <Copy size={14} />
            Copiar resumen
          </>
        )}
      </button>
    </div>
  )
}
