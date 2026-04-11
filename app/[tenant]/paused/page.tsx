'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'

export default function PausedTenantPage() {
  const { tenant: tenantSlug } = useParams<{ tenant: string }>()

  useEffect(() => {
    // Prevenir navegación hacia atrás o forward
    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault()
      window.history.pushState(null, '', window.location.href)
    }

    window.addEventListener('popstate', handlePopState)
    window.history.pushState(null, '', window.location.href)

    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  const supportWhatsApp = '5491160019734'
  const commercialWhatsApp = '5491138795976'

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        {/* Icono */}
        <div className="text-6xl mb-6">⏸️</div>

        {/* Título */}
        <h1 className="text-2xl font-black text-gray-900 mb-4">
          Cuenta Temporalmente Pausada
        </h1>

        {/* Mensaje */}
        <p className="text-gray-600 mb-8 leading-relaxed">
          Tu cuenta está temporalmente pausada. Para más información sobre el acceso,
          comunicate con nuestro equipo de soporte.
        </p>

        {/* Botones WhatsApp */}
        <div className="space-y-3">
          <a
            href={`https://wa.me/${supportWhatsApp}?text=Hola,%20mi%20cuenta%20está%20pausada%20y%20necesito%20ayuda`}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-6 rounded-xl transition-colors duration-200 flex items-center justify-center gap-3"
          >
            <span>💬</span>
            Soporte ({supportWhatsApp.slice(-4)})
          </a>

          <a
            href={`https://wa.me/${commercialWhatsApp}?text=Hola,%20mi%20cuenta%20está%20pausada%20y%20quiero%20reactivarla`}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 px-6 rounded-xl transition-colors duration-200 flex items-center justify-center gap-3"
          >
            <span>💼</span>
            Comercial ({commercialWhatsApp.slice(-4)})
          </a>
        </div>

        {/* Footer */}
        <p className="text-xs text-gray-400 mt-6">
          TakeasyGO - Sistema de pedidos online
        </p>
      </div>
    </div>
  )
}