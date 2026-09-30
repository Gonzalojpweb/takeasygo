'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import MenuPreview from './MenuPreview'
import MenuPhotosUploader from './MenuPhotosUploader'

export default function OnboardingInternalPage() {
  const router = useRouter()
  const { tenant } = useParams<{ tenant: string }>()

  const [step, setStep] = useState(3)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')

  // Sede
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [cuisine, setCuisine] = useState('Cafetería de especialidad')

  // Branding
  const [primaryColor, setPrimaryColor] = useState('#000000')

  useEffect(() => {
    // Optionally fetch current step from API
  }, [])

  const advanceStep = async (newStep: number, payload = {}) => {
    setLoading(true)
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

      await advanceStep(4, { cuisineTypes: [cuisine] })
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
      await advanceStep(5)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar identidad visual')
      setLoading(false)
    }
  }

  const handleSubmitReview = async () => {
    setLoading(true)
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

  return (
    <div className="max-w-3xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Completá tu perfil</h1>
      
      {error && <div className="p-4 bg-red-50 text-red-600 rounded-md mb-6">{error}</div>}
      {warning && <div className="p-4 bg-amber-50 text-amber-800 rounded-md mb-6">{warning}</div>}

      {step === 3 && (
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

          <button type="submit" disabled={loading} className="bg-black text-white px-4 py-2 rounded-md">Continuar</button>
        </form>
      )}

      {step === 4 && (
        <form onSubmit={handleBranding} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
          <h2 className="text-lg font-medium">Identidad visual</h2>
          
          <div>
            <label className="block text-sm font-medium">Color principal</label>
            <div className="flex items-center space-x-2 mt-1">
              <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="h-10 w-10 border rounded-md" />
              <input type="text" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="p-2 border rounded-md flex-1" />
            </div>
          </div>

          <button type="submit" disabled={loading} className="bg-black text-white px-4 py-2 rounded-md">Ver preview</button>
        </form>
      )}

      {step === 5 && (
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
            <button onClick={() => setStep(4)} className="px-4 py-2 border rounded-md">Atrás</button>
            <button onClick={handleSubmitReview} disabled={loading} className="bg-black text-white px-4 py-2 rounded-md">
              {loading ? 'Enviando...' : 'Enviar a revisión'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
