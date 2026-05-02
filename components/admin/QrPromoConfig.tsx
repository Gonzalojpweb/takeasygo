'use client'

import { useState, useEffect } from 'react'
import { Save, Percent, ToggleLeft, ToggleRight, Info, QrCode, Gift, AlertCircle, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface QrPromoConfigProps {
  tenantSlug: string
}

interface QrPromoData {
  isEnabled: boolean
  type: 'discount' | 'info' | 'loyalty'
  discountPercentage: number
  frequency: 'once' | 'every_visit' | 'daily'
  title: string
  subtitle: string
  buttonText: string
  termsText: string
}

export default function QrPromoConfig({ tenantSlug }: QrPromoConfigProps) {
  const [config, setConfig] = useState<QrPromoData>({
    isEnabled: false,
    type: 'discount',
    discountPercentage: 15,
    frequency: 'once',
    title: '¡Primera vez por QR!',
    subtitle: 'Obtené {discount}% OFF en tu primer pedido takeaway',
    buttonText: 'Ver menú',
    termsText: 'Válido solo para pedidos takeaway. No acumulable con otras promociones.',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchConfig()
  }, [tenantSlug])

  const fetchConfig = async () => {
    try {
      const res = await fetch(`/api/${tenantSlug}/admin/qr-promo`)
      const data = await res.json()
      if (data.qrPromo) {
        setConfig(data.qrPromo)
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
      const res = await fetch(`/api/${tenantSlug}/admin/qr-promo`, {
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

  const updateConfig = (key: keyof QrPromoData, value: any) => {
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
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Gift size={24} className="text-[#F74211]" />
            Marketing QR
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configurá campañas personalizadas para quienes escanean el código QR
          </p>
        </div>
        <button
          onClick={() => updateConfig('isEnabled', !config.isEnabled)}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all',
            config.isEnabled 
              ? 'bg-[#F74211]/10 text-[#F74211]' 
              : 'bg-gray-100 text-gray-500'
          )}
        >
          {config.isEnabled ? (
            <><ToggleRight size={24} /> Activado</>
          ) : (
            <><ToggleLeft size={24} /> Desactivado</>
          )}
        </button>
      </div>

      {config.isEnabled && (
        <div className="space-y-6">
          {/* Tipo de Banner */}
          <div className="bg-white rounded-xl p-4 border border-[#F74211]/10">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
              <QrCode size={16} className="text-[#F74211]" />
              Tipo de Campaña
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {[
                { value: 'discount', label: 'Promocional', desc: 'Ofrece un % de descuento' },
                { value: 'info', label: 'Informativo', desc: 'Solo mensaje (sin descuento)' },
                { value: 'loyalty', label: 'Captación Club', desc: 'Registro Nombre + Teléfono' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => updateConfig('type', option.value as any)}
                  className={cn(
                    'p-3 rounded-lg border-2 text-left transition-all',
                    config.type === option.value
                      ? 'border-[#F74211] bg-[#F74211]/5'
                      : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  <p className="font-bold text-sm">{option.label}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{option.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Descuento (Solo si es Promocional) */}
          {config.type === 'discount' && (
            <div className="bg-white rounded-xl p-4 border border-[#F74211]/10">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-1">
                <Percent size={16} className="text-[#F74211]" />
                Beneficio del escaneo
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="5"
                  max="50"
                  step="5"
                  value={config.discountPercentage}
                  onChange={(e) => updateConfig('discountPercentage', parseInt(e.target.value))}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#F74211]"
                />
                <div className="w-20 h-12 flex items-center justify-center rounded-xl font-bold text-lg bg-[#F74211] text-white">
                  {config.discountPercentage}%
                </div>
              </div>
            </div>
          )}

          {/* Frecuencia */}
          <div className="bg-white rounded-xl p-4 border border-[#F74211]/10">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
              <QrCode size={16} className="text-[#F74211]" />
              ¿Con qué frecuencia se muestra?
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'once', label: 'Una vez', desc: 'Por dispositivo' },
                { value: 'daily', label: 'Diario', desc: 'Una vez por día' },
                { value: 'every_visit', label: 'Siempre', desc: 'Cada visita' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => updateConfig('frequency', option.value as any)}
                  className={cn(
                    'p-3 rounded-lg border-2 text-left transition-all',
                    config.frequency === option.value
                      ? 'border-[#F74211] bg-[#F74211]/5'
                      : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  <p className="font-medium text-sm">{option.label}</p>
                  <p className="text-xs text-muted-foreground">{option.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="bg-white rounded-xl p-4 border border-[#F74211]/10">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
              <Info size={16} className="text-[#F74211]" />
              Vista previa
            </label>
            <div 
              className="rounded-xl p-6 text-center space-y-2 relative overflow-hidden"
              style={{ 
                background: 'linear-gradient(135deg, #FFF5F0 0%, #FFFFFF 100%)',
                border: '1px solid #F74211/20'
              }}
            >
              {config.type === 'discount' && (
                <div 
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold mb-2"
                  style={{ backgroundColor: '#F74211', color: 'white' }}
                >
                  <Percent size={12} />
                  {config.discountPercentage}% OFF
                </div>
              )}
              
              {config.type === 'loyalty' && (
                <div 
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold mb-2 bg-zinc-800 text-white"
                >
                  <Users size={12} />
                  UNITE AL CLUB
                </div>
              )}

              {config.type === 'info' && (
                <div 
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold mb-2 bg-blue-600 text-white"
                >
                  <Info size={12} />
                  INFO
                </div>
              )}

              <p className="font-bold text-foreground" style={{ color: '#1A1A1A' }}>
                {config.title}
              </p>
              <p className="text-xs text-gray-600">
                {config.type === 'discount' 
                  ? config.subtitle.replace('{discount}', `${config.discountPercentage}%`)
                  : config.subtitle}
              </p>

              {config.type === 'loyalty' && (
                <div className="mt-4 space-y-2 pointer-events-none opacity-50">
                  <div className="h-9 bg-white border border-gray-200 rounded-lg" />
                  <div className="h-9 bg-white border border-gray-200 rounded-lg" />
                </div>
              )}

              <button 
                className="mt-3 w-full py-2.5 rounded-lg text-white text-sm font-bold flex items-center justify-center gap-2"
                style={{ backgroundColor: '#F74211' }}
              >
                {config.buttonText}
              </button>
            </div>
          </div>

          {/* Instrucciones */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-start gap-2">
              <AlertCircle size={18} className="text-blue-500 mt-0.5" />
              <div className="text-sm text-blue-800 space-y-1">
                <p className="font-medium">¿Cómo funciona?</p>
                <ul className="list-disc list-inside space-y-1 text-blue-700">
                  <li>Esta promoción aparece cuando un cliente escanea el QR por primera vez</li>
                  <li>El estilo es estándar de TakeasyGO (color naranja #F74211)</li>
                  <li>El cliente ve el descuento y puede usarlo en su pedido takeaway</li>
                  <li>Usa los QR por ubicación para trackear desde qué mesa escanean</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

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
