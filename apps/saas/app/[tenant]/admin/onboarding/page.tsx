'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import MenuPreview from './MenuPreview'
import MenuPhotosUploader from './MenuPhotosUploader'
import {
  PLAN_LABELS,
  PLAN_TAGLINES,
  PLAN_FEATURES_LANDING,
  SELECTABLE_PLANS,
  type SelectablePlan,
} from '@/lib/plans'

export default function OnboardingInternalPage() {
  const router = useRouter()
  const { tenant } = useParams<{ tenant: string }>()

  const [step, setStep] = useState(3)
  const [hydrated, setHydrated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')

  // Plan (paso 3) — Trial preseleccionado, sin precios.
  const [selectedPlan, setSelectedPlan] = useState<SelectablePlan>('trial')

  // Sede (paso 4)
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [cuisine, setCuisine] = useState('Cafetería de especialidad')

  // Branding (paso 5)
  const [primaryColor, setPrimaryColor] = useState('#000000')

  // Hidratación del progreso real. Sin esto el wizard volvía siempre al paso 3
  // al refrescar, y perdía todo lo que el prospecto ya había completado.
  const hydratedRef = useRef(false)
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`/api/${tenant}/onboarding`)
        if (res.ok) {
          const data = await res.json()
          if (!alive) return
          // Clamp al rango real del wizard (3..6). step 7 = ya enviado.
          if (typeof data.step === 'number') {
            setStep(Math.min(Math.max(data.step, 3), 6))
          }
          if (data.selectedPlan) setSelectedPlan(data.selectedPlan)
          // 'rejected' queda fuera: estado/page.tsx tiene el link de reintentar
          // y volveríamos en loop.
          if (['pending_review', 'approved'].includes(data.status)) {
            router.replace(`/${tenant}/admin/onboarding/estado`)
            return
          }
        }
      } catch {
        // Sin red o sin sesión: seguimos en el paso por defecto.
      } finally {
        if (alive && !hydratedRef.current) {
          hydratedRef.current = true
          setHydrated(true)
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [tenant, router])

  const advanceStep = async (newStep: number, payload = {}) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/${tenant}/onboarding`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: newStep, ...payload })
      })
      if (!res.ok) throw new Error('Error al guardar progreso')
      setStep(newStep)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar progreso')
    } finally {
      setLoading(false)
    }
  }

  const handlePlan = async (e: React.FormEvent) => {
    e.preventDefault()
    await advanceStep(4, { selectedPlan })
  }

  const handleSede = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      // Create location
      const resLoc = await fetch(`/api/${tenant}/locations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-onboarding': '1'
        },
        body: JSON.stringify({ name: 'Sede Principal', address, phone, isActive: true })
      })
      const dataLoc = await resLoc.json().catch(() => ({}))
      if (!resLoc.ok) {
        throw new Error(dataLoc.error || 'Error al crear sede')
      }
      if (dataLoc.geoWarning) setWarning(dataLoc.geoWarning)

      await advanceStep(5, { cuisineTypes: [cuisine] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear sede')
      setLoading(false)
    }
  }

  const handleBranding = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      // Save branding settings
      await fetch(`/api/${tenant}/settings/branding`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryColor })
      })
      await advanceStep(6)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar identidad visual')
      setLoading(false)
    }
  }

  const handleSubmitReview = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/${tenant}/onboarding/submit`, {
        method: 'PATCH'
      })
      if (!res.ok) throw new Error('Error al enviar a revisión')

      router.push(`/${tenant}/admin/onboarding/estado`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al enviar a revisión')
      setLoading(false)
    }
  }

  if (!hydrated) {
    return (
      <div className="max-w-3xl mx-auto py-16 flex flex-col items-center text-gray-500">
        <svg className="animate-spin h-6 w-6 text-black mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span className="text-sm">Cargando tu progreso…</span>
      </div>
    )
  }

  const planFeatures = PLAN_FEATURES_LANDING[selectedPlan]

  return (
    <div className="max-w-3xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Completá tu perfil</h1>

      {error && <div className="p-4 bg-red-50 text-red-600 rounded-md mb-6">{error}</div>}
      {warning && <div className="p-4 bg-amber-50 text-amber-800 rounded-md mb-6">{warning}</div>}

      {step === 3 && (
        <form onSubmit={handlePlan} className="space-y-5">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
            <div>
              <h2 className="text-lg font-medium">¿Con qué plan arrancás?</h2>
              <p className="text-sm text-gray-500 mt-1">
                Empezás con Trial y podés cambiar cuando quieras. La elección se aplica
                cuando aprobemos tu cuenta.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SELECTABLE_PLANS.map((p) => {
                const active = selectedPlan === p
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSelectedPlan(p)}
                    aria-pressed={active}
                    className={`text-left p-4 rounded-xl border-2 transition-colors ${
                      active
                        ? 'border-black bg-black/[0.03]'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-sm">{PLAN_LABELS[p]}</span>
                      <span
                        className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                          active ? 'border-black bg-black' : 'border-gray-300'
                        }`}
                      >
                        {active && (
                          <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6.5L4.5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">{PLAN_TAGLINES[p]}</p>
                    {p === 'trial' && (
                      <span className="mt-2 inline-block text-[10px] font-black uppercase tracking-wider text-violet-600 bg-violet-500/10 px-2 py-0.5 rounded-full">
                        Preseleccionado
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-5">
            <h3 className="text-sm font-bold text-gray-900">
              Qué incluye {PLAN_LABELS[selectedPlan]}
            </h3>
            <ul className="mt-3 space-y-2">
              {[...planFeatures.featured, ...planFeatures.extra].map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs text-gray-700">
                  <svg className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 011.4-1.4l2.8 2.8 6.8-6.8a1 1 0 011.4 0z" clipRule="evenodd" />
                  </svg>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[11px] text-gray-500">
              Sin costos ahora. Cuando tu cuenta esté aprobada vas a poder contratar o
              cambiar de plan desde el panel.
            </p>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={loading} className="bg-black text-white px-4 py-2 rounded-md disabled:opacity-50">
              {loading ? 'Guardando…' : 'Continuar'}
            </button>
          </div>
        </form>
      )}

      {step === 4 && (
        <form onSubmit={handleSede} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
          <h2 className="text-lg font-medium">Información de la sede</h2>

          <div>
            <label className="block text-sm font-medium">Dirección exacta</label>
            <input type="text" required value={address} onChange={e => setAddress(e.target.value)} className="mt-1 w-full p-2 border rounded-md" placeholder="Av. Corrientes 1234, CABA" />
          </div>
          <div>
            <label className="block text-sm font-medium">Teléfono (WhatsApp)</label>
            <input type="text" required value={phone} onChange={e => setPhone(e.target.value)} className="mt-1 w-full p-2 border rounded-md" placeholder="1122334455" />
          </div>
          <div>
            <label className="block text-sm font-medium" htmlFor="cuisine">Tipo de comida principal</label>
            <input
              id="cuisine"
              type="text"
              list="cuisine-options"
              required
              value={cuisine}
              onChange={e => setCuisine(e.target.value)}
              className="mt-1 w-full p-2 border rounded-md"
              placeholder="Ej: Parrilla, Sushi, Cafetería de especialidad…"
            />
            <datalist id="cuisine-options">
              <option value="Cafetería de especialidad" />
              <option value="Hamburguesas" />
              <option value="Parrilla" />
              <option value="Pizza" />
              <option value="Sandwich" />
              <option value="Ensaladas" />
              <option value="Sushi" />
              <option value="Mexicano" />
              <option value="Pastas" />
              <option value="Vegetariano / Vegano" />
              <option value="Panadería" />
              <option value="Heladería" />
              <option value="Cocina Árabe" />
              <option value="Comida casera" />
            </datalist>
            <p className="text-xs text-gray-500 mt-1">
              Escribí el que quieras: si no está en la lista, lo tomamos igual.
            </p>
          </div>

          <div className="flex justify-between">
            <button type="button" onClick={() => setStep(3)} className="px-4 py-2 border rounded-md">Atrás</button>
            <button type="submit" disabled={loading} className="bg-black text-white px-4 py-2 rounded-md disabled:opacity-50">Continuar</button>
          </div>
        </form>
      )}

      {step === 5 && (
        <form onSubmit={handleBranding} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
          <h2 className="text-lg font-medium">Identidad visual</h2>

          <div>
            <label className="block text-sm font-medium">Color principal</label>
            <div className="flex items-center space-x-2 mt-1">
              <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="h-10 w-10 border rounded-md" />
              <input type="text" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="p-2 border rounded-md flex-1" />
            </div>
          </div>

          <div className="flex justify-between">
            <button type="button" onClick={() => setStep(4)} className="px-4 py-2 border rounded-md">Atrás</button>
            <button type="submit" disabled={loading} className="bg-black text-white px-4 py-2 rounded-md disabled:opacity-50">Ver preview</button>
          </div>
        </form>
      )}

      {step === 6 && (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-md">
            <h2 className="text-blue-800 font-medium">Vista previa</h2>
            <p className="text-blue-600 text-sm">Así se verá tu menú (ejemplo de {cuisine}). Los colores se aplicarán a tu menú real.</p>
          </div>

          <div className="border rounded-lg overflow-hidden bg-gray-50 h-[600px] relative">
            {/* Componente seguro de preview */}
            <MenuPreview cuisine={cuisine} primaryColor={primaryColor} />
          </div>

          <MenuPhotosUploader tenant={tenant} />

          <div className="flex justify-end space-x-4">
            <button onClick={() => setStep(5)} className="px-4 py-2 border rounded-md">Atrás</button>
            <button onClick={handleSubmitReview} disabled={loading} className="bg-black text-white px-4 py-2 rounded-md disabled:opacity-50">
              {loading ? 'Enviando...' : 'Enviar a revisión'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
