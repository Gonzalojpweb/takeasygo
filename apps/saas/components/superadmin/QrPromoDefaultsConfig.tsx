'use client'

import { useState, useEffect } from 'react'
import { Save, Palette, ShoppingBag, AlertCircle, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface QrPromoStylesData {
  primaryColor: string
  backgroundColor: string
  badgeColor: string
  borderRadius: string
  buttonColor: string
}

export default function QrPromoDefaultsConfig() {
  const [config, setConfig] = useState<QrPromoStylesData>({
    primaryColor: '#F74211',
    backgroundColor: '#FFF5F0',
    badgeColor: '#F74211',
    borderRadius: '1.5rem',
    buttonColor: '#F74211',
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
      if (data.qrPromoStyles) {
        setConfig(data.qrPromoStyles)
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

  const updateConfig = (key: keyof QrPromoStylesData, value: any) => {
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
          <Palette size={24} className="text-[#F74211]" />
          Estilos Estándar de Promo QR
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configuración visual de los banners (aplica a todos los tenants)
        </p>
      </div>

      {/* Colores */}
      <div className="space-y-4">
        <div className="bg-white rounded-xl p-4 border border-[#F74211]/10">
          <label className="text-sm font-medium text-foreground mb-2 block">Color principal</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={config.primaryColor}
              onChange={(e) => updateConfig('primaryColor', e.target.value)}
              className="w-12 h-12 rounded-lg cursor-pointer border-0"
            />
            <input
              type="text"
              value={config.primaryColor}
              onChange={(e) => updateConfig('primaryColor', e.target.value)}
              className="flex-1 h-10 px-3 border border-border/60 rounded-lg text-sm font-mono"
            />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-[#F74211]/10">
          <label className="text-sm font-medium text-foreground mb-2 block">Color de fondo</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={config.backgroundColor}
              onChange={(e) => updateConfig('backgroundColor', e.target.value)}
              className="w-12 h-12 rounded-lg cursor-pointer border-0"
            />
            <input
              type="text"
              value={config.backgroundColor}
              onChange={(e) => updateConfig('backgroundColor', e.target.value)}
              className="flex-1 h-10 px-3 border border-border/60 rounded-lg text-sm font-mono"
            />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-[#F74211]/10">
          <label className="text-sm font-medium text-foreground mb-2 block">Color del badge</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={config.badgeColor}
              onChange={(e) => updateConfig('badgeColor', e.target.value)}
              className="w-12 h-12 rounded-lg cursor-pointer border-0"
            />
            <input
              type="text"
              value={config.badgeColor}
              onChange={(e) => updateConfig('badgeColor', e.target.value)}
              className="flex-1 h-10 px-3 border border-border/60 rounded-lg text-sm font-mono"
            />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-[#F74211]/10">
          <label className="text-sm font-medium text-foreground mb-2 block">Color del botón</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={config.buttonColor}
              onChange={(e) => updateConfig('buttonColor', e.target.value)}
              className="w-12 h-12 rounded-lg cursor-pointer border-0"
            />
            <input
              type="text"
              value={config.buttonColor}
              onChange={(e) => updateConfig('buttonColor', e.target.value)}
              className="flex-1 h-10 px-3 border border-border/60 rounded-lg text-sm font-mono"
            />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-[#F74211]/10">
          <label className="text-sm font-medium text-foreground mb-2 block">Border radius</label>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={config.borderRadius}
              onChange={(e) => updateConfig('borderRadius', e.target.value)}
              className="flex-1 h-10 px-3 border border-border/60 rounded-lg text-sm font-mono"
              placeholder="Ej: 1.5rem, 12px, 50%"
            />
            <div className="flex gap-2">
              {['0.5rem', '1rem', '1.5rem', '2rem'].map((val) => (
                <button
                  key={val}
                  onClick={() => updateConfig('borderRadius', val)}
                  className={cn(
                    'px-3 py-2 rounded-lg text-xs font-medium transition-colors',
                    config.borderRadius === val
                      ? 'bg-[#F74211] text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>
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
            background: `linear-gradient(135deg, ${config.backgroundColor} 0%, #FFFFFF 100%)`,
            border: `1px solid ${config.primaryColor}20`,
            borderRadius: config.borderRadius,
          }}
        >
          <div 
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold mb-2"
            style={{ backgroundColor: config.badgeColor, color: 'white' }}
          >
            <span>20% OFF</span>
          </div>
          <p className="font-bold text-foreground" style={{ color: '#1A1A1A' }}>
            ¡Primera vez por QR!
          </p>
          <p className="text-sm text-gray-600">
            Obtené 20% OFF en tu primer pedido takeaway
          </p>
          <button 
            className="mt-3 px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: config.buttonColor }}
          >
            Ver menú
          </button>
          <p className="text-xs text-gray-400 mt-2">
            Válido solo para pedidos takeaway
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
              <li>Estos estilos se aplican a todos los tenants</li>
              <li>Los textos y % de descuento los configura cada admin de tenant</li>
              <li>Los cambios afectan inmediatamente a todos los banners activos</li>
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
