'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'

export default function OnboardingWizard() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [ticket, setTicket] = useState<string | null>(null)
  
  // Step 1: form
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 3: password
  const [password, setPassword] = useState('')

  // Step 2: email verification polling
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (step === 2 && ticket) {
      interval = setInterval(async () => {
        try {
          const res = await fetch('/api/onboarding/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticket })
          })
          if (res.ok) {
            const data = await res.json()
            if (data.verified) {
              setStep(3)
              clearInterval(interval)
            }
          }
        } catch {
          // ignore poll errors
        }
      }, 4000)
    }
    return () => clearInterval(interval)
  }, [step, ticket])

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    // Auto-generate slug if empty
    const finalSlug = slug.trim() || name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    
    try {
      const res = await fetch('/api/onboarding/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug: finalSlug, email })
      })
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Ocurrió un error')
      }
      
      setTicket(data.ticket)
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocurrió un error')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (!ticket) return
    setError('')
    try {
      const res = await fetch('/api/onboarding/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo reenviar')
      alert('Email reenviado. Revisá tu bandeja de entrada.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reenviar')
    }
  }

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/onboarding/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket, password })
      })
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Ocurrió un error')
      }
      
      // Auto login
      const signInRes = await signIn('credentials', {
        redirect: false,
        email,
        password
      })
      
      if (signInRes?.error) {
        throw new Error('Error al iniciar sesión automáticamente')
      }
      
      router.push(`/${data.slug}/admin/onboarding?step=3`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocurrió un error')
      setLoading(false)
    }
  }

  if (step === 1) {
    return (
      <form onSubmit={handleRegister} className="space-y-4">
        {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-md">{error}</div>}
        
        <div>
          <label className="block text-sm font-medium text-gray-700">Nombre del negocio</label>
          <input 
            type="text" 
            required 
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"
            placeholder="Ej: McDonald's"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Enlace (opcional)</label>
          <div className="mt-1 flex rounded-md shadow-sm">
            <span className="inline-flex items-center rounded-l-md border border-r-0 border-gray-300 bg-gray-50 px-3 text-gray-500 sm:text-sm">
              takeasygo.com/
            </span>
            <input 
              type="text" 
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="block w-full min-w-0 flex-1 rounded-none rounded-r-md border-gray-300 focus:border-black focus:ring-black sm:text-sm p-2 border"
              placeholder="mcdonalds"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Tu email</label>
          <input 
            type="email" 
            required 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"
            placeholder="tucorreo@ejemplo.com"
          />
        </div>

        <button 
          type="submit" 
          disabled={loading}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-black hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black disabled:opacity-50 mt-6"
        >
          {loading ? 'Creando...' : 'Comenzar'}
        </button>
      </form>
    )
  }

  if (step === 2) {
    return (
      <div className="text-center space-y-4">
        {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-md">{error}</div>}
        
        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-lg leading-6 font-medium text-gray-900">Revisá tu email</h3>
        <p className="text-sm text-gray-500">
          Te enviamos un enlace a <strong>{email}</strong> para verificar tu cuenta.
        </p>
        <div className="mt-5">
          <div className="flex justify-center items-center space-x-2 text-sm text-gray-500">
            <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Esperando verificación...</span>
          </div>
        </div>
        <button 
          onClick={handleResend}
          className="mt-4 text-sm font-medium text-black underline hover:text-gray-700"
        >
          Reenviar email
        </button>
      </div>
    )
  }

  if (step === 3) {
    return (
      <form onSubmit={handlePassword} className="space-y-4">
        {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-md">{error}</div>}
        
        <div className="text-center mb-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">¡Email verificado! 🎉</h3>
          <p className="text-sm text-gray-500 mt-2">Ahora, creá una contraseña para tu cuenta.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Contraseña</label>
          <input 
            type="password" 
            required 
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"
            placeholder="Mínimo 8 caracteres"
          />
        </div>

        <button 
          type="submit" 
          disabled={loading}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-black hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black disabled:opacity-50 mt-6"
        >
          {loading ? 'Guardando...' : 'Continuar'}
        </button>
      </form>
    )
  }

  return null
}
