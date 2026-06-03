'use client'

import { useState, useEffect } from 'react'
import { Save, Percent, ToggleLeft, ToggleRight, Info, QrCode, Gift, AlertCircle, ArrowRight, ImageIcon, Type, MessageSquare, Tag, AlertTriangle, Loader, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import ImageUpload from './ImageUpload'
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
  imageUrl?: string
  badgeLabel: string
  offLabel: string
  takeawayWarningTitle: string
  takeawayWarningText: string
  loadingText: string
  checkoutDiscountLabel: string
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
    imageUrl: '',
    badgeLabel: 'SOLO POR HOY',
    offLabel: 'OFF',
    takeawayWarningTitle: 'DESCUENTO EXCLUSIVO PARA TAKEAWAY',
    takeawayWarningText: 'No aplicable para consumir en el local',
    loadingText: 'Procesando...',
    checkoutDiscountLabel: 'Descuento QR',
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
        setConfig({
          ...config,
          ...data.qrPromo,
          badgeLabel: data.qrPromo.badgeLabel ?? 'SOLO POR HOY',
          offLabel: data.qrPromo.offLabel ?? 'OFF',
          takeawayWarningTitle: data.qrPromo.takeawayWarningTitle ?? 'DESCUENTO EXCLUSIVO PARA TAKEAWAY',
          takeawayWarningText: data.qrPromo.takeawayWarningText ?? 'No aplicable para consumir en el local',
          loadingText: data.qrPromo.loadingText ?? 'Procesando...',
          checkoutDiscountLabel: data.qrPromo.checkoutDiscountLabel ?? 'Descuento QR',
        })
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

          <div className="bg-white rounded-xl p-4 border border-[#F74211]/10">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
              <ImageIcon size={16} className="text-[#F74211]" />
              Imagen del Banner
            </label>
            <div className="max-w-xs">
              <ImageUpload
                value={config.imageUrl || ''}
                tenantSlug={tenantSlug}
                onChange={(url) => updateConfig('imageUrl', url)}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Recomendado: Imagen horizontal (4:3 o 16:9) de alta calidad.
            </p>
          </div>

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

          {/* --- TEXTOS DEL BANNER --- */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <MessageSquare size={16} className="text-[#F74211]" />
              Textos del Banner
            </div>

            <div className="bg-white rounded-xl p-4 border border-[#F74211]/10 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Título</label>
                <input type="text" value={config.title} onChange={(e) => updateConfig('title', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F74211]/30" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Subtítulo <span className="text-gray-400">(usá {'{discount}'} para insertar el %)</span></label>
                <input type="text" value={config.subtitle} onChange={(e) => updateConfig('subtitle', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F74211]/30" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Texto del botón</label>
                <input type="text" value={config.buttonText} onChange={(e) => updateConfig('buttonText', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F74211]/30" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Términos y condiciones</label>
                <textarea value={config.termsText} onChange={(e) => updateConfig('termsText', e.target.value)} rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F74211]/30 resize-none" />
              </div>
            </div>
          </div>

          {/* --- TEXTOS DEL BADGE Y ETIQUETAS --- */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Tag size={16} className="text-[#F74211]" />
              Etiquetas y Mensajes del Banner
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl p-4 border border-[#F74211]/10">
                <label className="flex items-center gap-1 text-xs font-medium text-gray-500 mb-2">
                  <Tag size={12} /> Badge promo
                </label>
                <input type="text" value={config.badgeLabel} onChange={(e) => updateConfig('badgeLabel', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F74211]/30" />
              </div>
              <div className="bg-white rounded-xl p-4 border border-[#F74211]/10">
                <label className="flex items-center gap-1 text-xs font-medium text-gray-500 mb-2">
                  <Percent size={12} /> Label OFF
                </label>
                <input type="text" value={config.offLabel} onChange={(e) => updateConfig('offLabel', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F74211]/30" />
              </div>
              <div className="bg-white rounded-xl p-4 border border-[#F74211]/10">
                <label className="flex items-center gap-1 text-xs font-medium text-gray-500 mb-2">
                  <AlertTriangle size={12} /> Título advertencia takeaway
                </label>
                <input type="text" value={config.takeawayWarningTitle} onChange={(e) => updateConfig('takeawayWarningTitle', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F74211]/30" />
              </div>
              <div className="bg-white rounded-xl p-4 border border-[#F74211]/10">
                <label className="flex items-center gap-1 text-xs font-medium text-gray-500 mb-2">
                  <AlertTriangle size={12} /> Texto advertencia takeaway
                </label>
                <input type="text" value={config.takeawayWarningText} onChange={(e) => updateConfig('takeawayWarningText', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F74211]/30" />
              </div>
              <div className="bg-white rounded-xl p-4 border border-[#F74211]/10">
                <label className="flex items-center gap-1 text-xs font-medium text-gray-500 mb-2">
                  <Loader size={12} /> Texto de carga
                </label>
                <input type="text" value={config.loadingText} onChange={(e) => updateConfig('loadingText', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F74211]/30" />
              </div>
              <div className="bg-white rounded-xl p-4 border border-[#F74211]/10">
                <label className="flex items-center gap-1 text-xs font-medium text-gray-500 mb-2">
                  <ShoppingCart size={12} /> Label descuento en checkout
                </label>
                <input type="text" value={config.checkoutDiscountLabel} onChange={(e) => updateConfig('checkoutDiscountLabel', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F74211]/30" />
              </div>
            </div>
          </div>

          {/* --- VISTA PREVIA --- */}
          <div className="bg-white rounded-xl p-4 border border-[#F74211]/10">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
              <Info size={16} className="text-[#F74211]" />
              Vista previa
            </label>
            
            <div 
              className="rounded-[32px] text-center relative overflow-hidden shadow-2xl border border-gray-100 flex flex-col bg-white mx-auto max-w-[280px]"
            >
              <div 
                className="h-36 flex relative overflow-hidden"
                style={{ backgroundColor: '#F74211' }}
              >
                <div className="w-1/2 p-3 flex items-center justify-center">
                  <div className="w-full h-full rounded-2xl bg-white/10 border-2 border-white/20 overflow-hidden flex items-center justify-center">
                    {config.imageUrl ? (
                      <img src={config.imageUrl} className="w-full h-full object-cover" alt="Preview" />
                    ) : (
                      <Gift size={24} className="text-white opacity-80" />
                    )}
                  </div>
                </div>
                <div className="w-1/2 flex flex-col justify-center text-left text-white pr-4 pl-1">
                   <p className="text-[8px] font-black uppercase opacity-70 mb-1">{config.badgeLabel}</p>
                   <div className="flex flex-col leading-none">
                     <span className="text-3xl font-black tracking-tighter">
                       {config.type === 'discount' ? `${config.discountPercentage}%` : 'PROMO'}
                     </span>
                     <span className="text-sm font-black opacity-90 uppercase">
                       {config.type === 'discount' ? config.offLabel : ''}
                     </span>
                   </div>
                </div>
              </div>

              <div className="p-8">
                <p className="font-black text-slate-900 text-sm leading-tight mb-2">
                  {config.title}
                </p>
                <p className="text-[9px] text-slate-500 font-medium leading-tight mb-6 line-clamp-2">
                  {config.type === 'discount' 
                    ? config.subtitle.replace('{discount}', `${config.discountPercentage}%`)
                    : config.subtitle}
                </p>

                <div className="flex flex-col gap-2">
                  <div 
                    className="w-full py-3 rounded-xl text-white text-[10px] font-black flex items-center justify-center gap-2 uppercase tracking-tight shadow-lg"
                    style={{ backgroundColor: '#F74211' }}
                  >
                    {config.buttonText}
                    <ArrowRight size={12} className="stroke-[3]" />
                  </div>
                  <button className="text-blue-600 font-bold text-[10px]">Entendido</button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-start gap-2">
              <AlertCircle size={18} className="text-blue-500 mt-0.5" />
              <div className="text-sm text-blue-800 space-y-1">
                <p className="font-medium">¿Cómo funciona?</p>
                <ul className="list-disc list-inside space-y-1 text-blue-700">
                  <li>Esta promoción aparece cuando un cliente escanea el QR por primera vez</li>
                  <li>El estilo es premium con soporte de imagen personalizada</li>
                  <li>El cliente ve el beneficio y puede usarlo en su pedido</li>
                  <li>Todos los textos son 100% personalizables por tenant</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

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
