'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { slugify, slugifyOrFallback } from '@/lib/slugify'
import { sanitizePassword, passwordRules, passwordError, PASSWORD_MIN } from '@/lib/password'
import { Eye, EyeOff, Check, X } from 'lucide-react'
import { useCelebrate } from '@/hooks/useCelebrate'
import { phaseAIndex, progressFor, remaining, etaMinutes, copyFor, serverToGlobal } from '@/lib/onboarding-journey'
import JourneyProgress from '@/components/onboarding/JourneyProgress'

export default function OnboardingWizard() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [ticket, setTicket] = useState<string | null>(null)
  const [persisted, setPersisted] = useState(false)

  // Cargar estado persistente de localStorage al montar (solo fase A)
  useEffect(() => {
    try {
      const stored = localStorage.getItem('tgo_onboarding_step')
      if (stored !== null) {
        const p = Number(stored)
        // validar que esté en el rango de fase A (1‑3)
        if (p >= 1 && p <= 3) setStep(p)
        setPersisted(true)
      }
    } catch {}
  }, [])

[
    { key: 'datos', phase: 'A', label: 'Datos del negocio' },
    { key: 'email', phase: 'A', label: 'Verificá tu email' },
    { key: 'clave', phase: 'A', label: 'Creá tu clave' },
  ]
  const globalIdx = phaseAIndex(step)
  const prog = progressFor(globalIdx)
  const resto = remaining(globalIdx)
  const eta = etaMinutes(globalIdx)
  const label = `Paso ${globalIdx} de 7`
  const saved = persisted || step >= 3
  useEffect(() => {
    if (step >= 1 && step <= 3) {
      localStorage.setItem('tgo_onboarding_step', String(step))
      setPersisted(true)
    }
  }, [step])

  // Step 1: form
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 3: password
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

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

  if (step === 1) {
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
    
    // El usuario escribe lo que quiera: lo normalizamos en el cliente para que
    // vea el enlace real, y de nuevo en el server como red de seguridad.
    const finalSlug = slugifyOrFallback(name, slug)
    
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
      alert('Email reenviado. Revisá tu bandeja de entrada y, si no aparece, la carpeta de spam.')
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
              maxLength={80}
              onChange={(e) => setSlug(slugify(e.target.value))}
              className="block w-full min-w-0 flex-1 rounded-none rounded-r-md border-gray-300 focus:border-black focus:ring-black sm:text-sm p-2 border"
              placeholder="mcdonalds"
            />
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Lo que escribas se adapta solo (tildes, mayúsculas y símbolos se convierten en guiones).
            Si lo dejás vacío usamos el nombre del negocio.
          </p>
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

        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100">
          <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>

        <h3 className="text-lg leading-6 font-medium text-gray-900">Revisá tu email</h3>
        <p className="text-sm text-gray-500">
          Te enviamos un <strong>link de verificación</strong> a<br />
          <strong className="text-gray-900 break-all">{email}</strong>
          <br />
          Hacé clic en ese link para poder continuar con tu alta.
        </p>

        {/* Aviso anti-spam: los mails de verificación caen ahí y frenan el alta. */}
        <div className="text-left bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-900 mb-2">
            ¿No lo ves en tu bandeja de entrada?
          </p>
          <ul className="text-xs text-amber-900/90 space-y-1.5 leading-relaxed">
            <li className="flex gap-2">
              <span aria-hidden>→</span>
              <span>Revisá las carpetas <strong>Spam</strong>, <strong>No deseados</strong> o <strong>Promociones</strong>.</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden>→</span>
              <span>Buscá un correo con asunto <strong>&ldquo;Verificá tu email para comenzar&nbsp;— Takeasygo&rdquo;</strong>, firmado por <strong>Takeasygo</strong>.</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden>→</span>
              <span>El link es válido por <strong>15 minutos</strong>. Si venció, pedí el reenvío y volvé a entrar desde ese mail.</span>
            </li>
          </ul>
        </div>

        <div className="mt-5">
          <div className="flex justify-center items-center space-x-2 text-sm text-gray-500">
            <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Esperando verificación… esta pantalla se avanza sola.</span>
          </div>
        </div>

        <button
          onClick={handleResend}
          className="mt-2 text-sm font-medium text-black underline hover:text-gray-700"
        >
          Reenviar email
        </button>
        <p className="text-[11px] text-gray-400 -mt-2">
          Si ya lo reenviaste, revisá el spam antes de pedirlo otra vez.
        </p>
      </div>
    )
  }

  if (step === 3) {
    const rules = passwordRules(password)
    const valid = passwordError(password) === null
    const ruleList = [
      { ok: rules.length, label: `Al menos ${PASSWORD_MIN} caracteres` },
      { ok: rules.letter, label: 'Al menos una letra' },
      { ok: rules.number, label: 'Al menos un número' },
, [
    { key: 'datos', phase: 'A', label: 'Datos del negocio' },
    { key: 'email', phase: 'A', label: 'Verificá tu email' },
    { key: 'clave', phase: 'A', label: 'Creá tu clave' },
  ]
  const globalIdx = phaseAIndex(step)
  const prog = progressFor(globalIdx)
  const resto = remaining(globalIdx)
  const eta = etaMinutes(globalIdx)
  const saved = persisted || step >= 3

    return (
      <form onSubmit={handlePassword} className="space-y-4">
        {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-md">{error}</div>}

        <div className="text-center mb-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">¡Email verificado! 🎉</h3>
          <p className="text-sm text-gray-500 mt-2">Por último, creá una contraseña para tu cuenta.</p>
        </div>

        <div>
          <label htmlFor="onb-password" className="block text-sm font-medium text-gray-700">
            Contraseña
          </label>
          <div className="mt-1 relative">
            <input
              id="onb-password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(sanitizePassword(e.target.value))}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 pr-11 border"
              placeholder="Escribí tu contraseña"
              aria-describedby="onb-password-rules"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-700 focus:outline-none"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <ul id="onb-password-rules" className="mt-3 space-y-1.5">
            {ruleList.map((r) => (
              <li
                key={r.label}
                className={`flex items-center gap-2 text-xs ${r.ok ? 'text-emerald-700' : 'text-gray-500'}`}
              >
                <span
                  className={`h-4 w-4 shrink-0 rounded-full flex items-center justify-center ${
                    r.ok ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-400'
                  }`}
                >
                  {r.ok ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
                </span>
                {r.label}
              </li>
            ))}
          </ul>
        </div>

        <button
          type="submit"
          disabled={loading || !valid}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-black hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black disabled:opacity-50 mt-6"
        >
          {loading ? 'Guardando...' : 'Continuar'}
        </button>
      </form>
    )
  }

  return null
}
