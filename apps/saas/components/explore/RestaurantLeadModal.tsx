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

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 44,
    padding: '0 16px',
    borderRadius: 'var(--tgo-radius-md)',
    backgroundColor: 'var(--tgo-surface-1)',
    border: '1px solid var(--tgo-border)',
    color: 'var(--tgo-text-primary)',
    fontSize: 'var(--tgo-type-body-sm)',
    outline: 'none',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !loading && onClose()} role="button" tabIndex={0} aria-label="Cerrar" />
      <div
        className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-300"
        style={{
          backgroundColor: 'var(--tgo-surface-0)',
          borderRadius: 'var(--tgo-radius-2xl)',
        }}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 p-4"
          style={{
            backgroundColor: 'var(--tgo-surface-0)',
            borderBottom: '1px solid var(--tgo-border)',
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--tgo-text-primary)' }}>
                Registrá tu restaurante
              </h2>
              <p className="text-xs" style={{ color: 'var(--tgo-text-muted)' }}>
                Formá parte de la red TakeasyGO
              </p>
            </div>
            <button
              onClick={() => !loading && onClose()}
              aria-label="Cerrar"
              className="w-8 h-8 flex items-center justify-center transition-colors"
              style={{
                borderRadius: 'var(--tgo-radius-md)',
                backgroundColor: 'var(--tgo-surface-1)',
                color: 'var(--tgo-text-muted)',
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {FIELDS.map(({ key, label, placeholder, type, required }) => (
            <div key={key}>
              <label
                className="block mb-1.5 uppercase tracking-widest"
                style={{ fontSize: 10, fontWeight: 900, color: 'var(--tgo-text-muted)' }}
              >
                {label}
                {!required && (
                  <span className="font-normal tracking-normal normal-case ml-1" style={{ opacity: 0.6 }}>
                    (opcional)
                  </span>
                )}
              </label>
              <input
                type={type}
                required={required}
                placeholder={placeholder}
                value={(form as any)[key]}
                onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                className="transition-colors focus:border-[var(--tgo-border-focus)]"
                style={inputStyle}
              />
            </div>
          ))}

          <button
            type="submit"
            disabled={loading}
            className="w-full font-black text-xs uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            style={{
              height: 48,
              borderRadius: 'var(--tgo-radius-xl)',
              border: '1.5px solid var(--tgo-state-trust)',
              backgroundColor: 'transparent',
              color: 'var(--tgo-state-trust)',
            }}
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
