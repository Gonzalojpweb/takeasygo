'use client'

import { useState, useEffect } from 'react'
import { Zap, CheckCircle2, AlertCircle, ExternalLink, RefreshCw } from 'lucide-react'

interface Props {
  tenantSlug: string
  isConnected: boolean
  authorizedAt?: string | null
}

export default function MpOAuthConnectButton({ tenantSlug, isConnected: initialConnected, authorizedAt }: Props) {
  const [connected, setConnected] = useState(initialConnected)
  const [connecting, setConnecting] = useState(false)

  // Check URL params for OAuth result feedback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const result = params.get('mp_oauth')
    if (result === 'success') {
      setConnected(true)
      // Clean URL
      const url = new URL(window.location.href)
      url.searchParams.delete('mp_oauth')
      window.history.replaceState({}, '', url.toString())
    }
  }, [])

  const handleConnect = () => {
    setConnecting(true)
    // Redirect to our connect endpoint which will redirect to MP OAuth
    window.location.href = `/api/${tenantSlug}/admin/mp-oauth/connect`
  }

  if (connected) {
    return (
      <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-100">
        <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
          <CheckCircle2 size={18} className="text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-emerald-900">Conectado para Split de Pagos</p>
          <p className="text-xs text-emerald-700 font-medium mt-0.5">
            TakeasyGO cobra su comisión automáticamente en cada venta.
          </p>
          {authorizedAt && (
            <p className="text-[10px] text-emerald-500 mt-1">
              Autorizado: {new Date(authorizedAt).toLocaleDateString('es-AR')}
            </p>
          )}
        </div>
        <button
          onClick={handleConnect}
          title="Reconectar"
          className="shrink-0 p-2 rounded-lg hover:bg-emerald-100 transition-colors"
        >
          <RefreshCw size={14} className="text-emerald-500" />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-100">
        <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
          <AlertCircle size={18} className="text-amber-600" />
        </div>
        <div>
          <p className="text-sm font-bold text-amber-900">Split de pagos no activado</p>
          <p className="text-xs text-amber-700 font-medium mt-0.5 leading-relaxed">
            Para que TakeasyGO cobre su comisión automáticamente, necesitás autorizar el acceso a tu cuenta de MercadoPago.
            Es un proceso de un solo clic.
          </p>
        </div>
      </div>

      <button
        onClick={handleConnect}
        disabled={connecting}
        className="w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-[#009ee3] text-white font-bold text-sm shadow-md shadow-[#009ee3]/20 hover:bg-[#008ccc] active:scale-[0.98] transition-all disabled:opacity-60"
      >
        {connecting ? (
          <>
            <RefreshCw size={16} className="animate-spin" />
            Redirigiendo a MercadoPago...
          </>
        ) : (
          <>
            <Zap size={16} />
            Conectar con MercadoPago
            <ExternalLink size={13} className="opacity-60" />
          </>
        )}
      </button>

      <p className="text-[10px] text-slate-400 text-center font-medium px-4 leading-relaxed">
        Solo le pedimos el permiso necesario para enviar tu parte del pago automáticamente.
        Podés desconectar en cualquier momento.
      </p>
    </div>
  )
}
