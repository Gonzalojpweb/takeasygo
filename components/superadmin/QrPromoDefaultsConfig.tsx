'use client'

import { useState, useEffect } from 'react'
import { Save, Percent, ShoppingBag, AlertCircle, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface QrPromoDefaultsData {
  title: string
  subtitle: string
  buttonText: string
  termsText: string
  defaultDiscountPercentage: number
}

export default function QrPromoDefaultsConfig() {
  const [config, setConfig] = useState<QrPromoDefaultsData>({
    title: '¡Primera vez por QR!',
    subtitle: 'Obtené {discount}% OFF en tu primer pedido takeaway',
    buttonText: 'Ver menú',
    termsText: 'Válido solo para pedidos takeaway. No acumulable con otras promociones.',
    defaultDiscountPercentage: 15,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/superadmin/qr-promo-defaults')
      const data = await res.json()
      if (data.qrPromoDefaults) {
        setConfig(data.qrPromoDefaults)
      }
    } catch (e) {
      console.error('Error fetching config:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    setError('')

    try {
      const res = await fetch('/api/superadmin/qr-promo-defaults', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al guardar')
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const updateConfig = (key: keyof QrPromoDefaultsData, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  if (loading) {
    return (
      <div className="bg-card border-2 border-border/60 rounded-2xl p-8">
        <div className="text-center text-muted-foreground">Cargando configuración...</div>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-[#FFF5F0] to-white border-2 border-[#F74211]/20 rounded-2xl p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <ShoppingBag size={24} className="text-[#F74211]" />
          Configuración Global de Promo QR
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Textos y valores por defecto para la promoción de takeaway (aplica a todos los tenants nuevos)
        </p>
      </div>

      {/* Descuento por defecto */}
      <div className="bg-white rounded-xl p-4 border border-[#F74211]/10">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
          <Percent size={16} className="text-[#F74211]" />
          Descuento por defecto para nuevos tenants
        </label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="5"
            max="50"
            value={config.defaultDiscountPercentage}
            onChange={(e) => updateConfig('defaultDiscountPercentage', parseInt(e.target.value))}
            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#F74211]"
          />
          <div 
            className="w-20 h-12 flex items-center justify-center rounded-xl font-bold text-lg"
            style={{ backgroundColor: '#F74211', color: 'white' }}
          >
            {config.defaultDiscountPercentage}%
          </div>
        </div>
      </div>

      {/* Textos editables */}
      <div className="space-y-4">
        <div className="bg-white rounded-xl p-4 border border-[#F74211]/10">
          <label className="text-sm font-medium text-foreground mb-2 block">Título</label>
          <input
            type="text"
            value={config.title}
            onChange={(e) => updateConfig('title', e.target.value)}
            className="w-full h-10 px-3 border border-border/60 rounded-lg text-sm"
            placeholder="Título de la promoción"
          />
        </div>

        <div className="bg-white rounded-xl p-4 border border-[#F74211]/10">
          <label className="text-sm font-medium text-foreground mb-2 block">
            Subtítulo (usa <code className="bg-gray-100 px-1 rounded">{'{discount}'}</code> para el porcentaje)
          </label>
          <input
            type="text"
            value={config.subtitle}
            onChange={(e) => updateConfig('subtitle', e.target.value)}
            className="w-full h-10 px-3 border border-border/60 rounded-lg text-sm"
            placeholder="Descripción de la promoción"
          />
        </div>

        <div className="bg-white rounded-xl p-4 border border-[#F74211]/10">
          <label className="text-sm font-medium text-foreground mb-2 block">Texto del botón</label>
          <input
            type="text"
            value={config.buttonText}
            onChange={(e) => updateConfig('buttonText', e.target.value)}
            className="w-full h-10 px-3 border border-border/60 rounded-lg text-sm"
            placeholder="Botón de acción"
          />
        </div>

        <div className="bg-white rounded-xl p-4 border border-[#F74211]/10">
          <label className="text-sm font-medium text-foreground mb-2 block">Términos y condiciones</label>
          <textarea
            value={config.termsText}
            onChange={(e) => updateConfig('termsText', e.target.value)}
            className="w-full h-20 px-3 border border-border/60 rounded-lg text-sm resize-none"
            placeholder="Términos de la promoción"
          />
        </div>
      </div>

      {/* Preview */}
      <div className="bg-white rounded-xl p-4 border border-[#F74211]/10">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
          <Info size={16} className="text-[#F74211]" />
          Vista previa
        </label>
        <div 
          className="rounded-xl p-6 text-center space-y-2"
          style={{ 
            background: 'linear-gradient(135deg, #FFF5F0 0%, #FFFFFF 100%)',
            border: '1px solid #F74211/20'
          }}
        >
          <div 
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold mb-2"
            style={{ backgroundColor: '#F74211', color: 'white' }}
          >
            <Percent size={12} />
            {config.defaultDiscountPercentage}% OFF
          </div>
          <p className="font-bold text-foreground" style={{ color: '#1A1A1A' }}>
            {config.title}
          </p>
          <p className="text-sm text-gray-600">
            {config.subtitle.replace('{discount}', String(config.defaultDiscountPercentage))}
          </p>
          <button 
            className="mt-3 px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: '#F74211' }}
          >
            {config.buttonText}
          </button>
          <p className="text-xs text-gray-400 mt-2">
            {config.termsText}
          </p>
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <AlertCircle size={18} className="text-blue-500 mt-0.5" />
          <div className="text-sm text-blue-800 space-y-1">
            <p className="font-medium">Información:</p>
            <ul className="list-disc list-inside space-y-1 text-blue-700">
              <li>Estos textos se usan como valores por defecto para nuevos tenants</li>
              <li>Los tenants existentes pueden sobrescribir estos valores</li>
              <li>El estilo visual (color naranja #F74211) es fijo y no se puede cambiar</li>
              <li>Los cambios afectan solo a tenants que aún no han configurado su promo</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Save button */}
      <div className="flex justify-end pt-4 border-t border-border/40">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="gap-2"
          style={{ 
            backgroundColor: saved ? '#22c55e' : '#F74211',
            color: 'white'
          }}
        >
          {saving ? (
            <span className="animate-spin">⏳</span>
          ) : saved ? (
            <><span>✓</span> Guardado</>
          ) : (
            <><Save size={16} /> Guardar cambios</>
          )}
        </Button>
      </div>
    </div>
  )
}
