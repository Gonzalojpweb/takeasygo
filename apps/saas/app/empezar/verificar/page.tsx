'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function VerifyContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(token ? 'loading' : 'error')
  const [message, setMessage] = useState(
    token ? 'Verificando tu email...' : 'El enlace es inválido o no tiene el formato correcto.'
  )

  useEffect(() => {
    if (!token) return

    fetch('/api/onboarding/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    })
      .then(res => res.json().then(data => ({ status: res.status, ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok) {
          setStatus('success')
          setMessage('¡Email verificado! Ya podés cerrar esta pestaña y volver a la pantalla anterior para continuar.')
        } else {
          setStatus('error')
          setMessage(data.error || 'Ocurrió un error al verificar tu email.')
        }
      })
      .catch(() => {
        setStatus('error')
        setMessage('Error de conexión. Intentá de nuevo.')
      })
  }, [token])

  return (
    <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-gray-100 text-center">
      {status === 'loading' && (
        <div className="flex flex-col items-center justify-center space-y-4">
          <svg className="animate-spin h-8 w-8 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-gray-500">{message}</p>
        </div>
      )}

      {status === 'success' && (
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900">Email verificado</h3>
          <p className="text-gray-500 text-sm">{message}</p>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900">Enlace inválido o expirado</h3>
          <p className="text-gray-500 text-sm">{message}</p>
        </div>
      )}
    </div>
  )
}

export default function VerificarPage() {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center mb-6">
          <div className="w-12 h-12 bg-black rounded-xl flex items-center justify-center">
            <span className="text-white text-2xl font-serif italic">T</span>
          </div>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <Suspense fallback={<div className="text-center p-8">Cargando...</div>}>
          <VerifyContent />
        </Suspense>
      </div>
    </main>
  )
}
