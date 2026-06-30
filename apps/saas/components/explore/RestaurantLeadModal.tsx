'use client'

import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const FIELDS = [
  { key: 'nombre', label: 'Nombre del restaurante', placeholder: 'Ej: La Parrilla de Juan', type: 'text', required: true },
  { key: 'instagram', label: 'Instagram', placeholder: '@turestaurante', type: 'text', required: false },
  { key: 'email', label: 'Mail de contacto', placeholder: 'hola@turestaurante.com', type: 'email', required: true },
  { key: 'telefono', label: 'Teléfono de contacto', placeholder: '+54 11 1234-5678', type: 'tel', required: true },
  { key: 'tipoRestaurante', label: 'Tipo de restaurante', placeholder: 'Ej: Parrilla, Cafetería, Dark Kitchen…', type: 'text', required: true },
]

const EMPTY = { nombre: '', instagram: '', email: '', telefono: '', tipoRestaurante: '' }

export default function RestaurantLeadModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(EMPTY)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/network', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error desconocido')
      toast.success('¡Restaurante registrado! Te contactamos pronto.')
      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Algo salió mal. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !loading && onClose()} />
      <div className="relative z-10 w-full max-w-md bg-[var(--c-bg)] rounded-3xl max-h-[90vh] overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="sticky top-0 z-10 glass-card border-b border-[var(--c-border)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-[#f7f4f2]">Registrá tu restaurante</h2>
              <p className="text-xs text-[#5a524d]">Formá parte de la red TakeasyGO</p>
            </div>
            <button
              onClick={() => !loading && onClose()}
              className="w-8 h-8 rounded-xl bg-[var(--c-surface)] flex items-center justify-center text-[#5a524d] hover:bg-[var(--c-border)] transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {FIELDS.map(({ key, label, placeholder, type, required }) => (
            <div key={key}>
              <label className="text-[10px] font-black uppercase tracking-widest text-[#5a524d] block mb-1.5">
                {label}
                {!required && <span className="font-normal tracking-normal uppercase-none text-[#5a524d]/60 ml-1">(opcional)</span>}
              </label>
              <input
                type={type}
                required={required}
                placeholder={placeholder}
                value={(form as any)[key]}
                onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                className="w-full h-11 px-4 rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)] text-[#f7f4f2] text-sm placeholder:text-[#5a524d] outline-none focus:border-[#f14722] transition-colors"
              />
            </div>
          ))}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-2xl bg-[#f14722] text-white font-black text-xs uppercase tracking-widest hover:bg-[#d63d1a] disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Registrando…
              </>
            ) : (
              'Registrar restaurante'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
