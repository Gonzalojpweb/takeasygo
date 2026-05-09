'use client'

import { useState } from 'react'
import { Copy, Check, Link2, Instagram, QrCode, MessageCircle, Facebook, Search, MousePointer, Globe, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Tenant {
  _id: string
  name: string
  slug: string
}

interface UrlGeneratorProps {
  tenants: Tenant[]
}

const SOURCES = [
  { id: 'tgo-invite', name: 'Invitación TGO', icon: Globe, color: 'text-[#F74211]' },
  { id: 'instagram', name: 'Instagram', icon: Instagram, color: 'text-pink-500' },
  { id: 'facebook', name: 'Facebook', icon: Facebook, color: 'text-blue-600' },
  { id: 'qr', name: 'QR Code', icon: QrCode, color: 'text-emerald-500' },
  { id: 'whatsapp', name: 'WhatsApp', icon: MessageCircle, color: 'text-green-500' },
  { id: 'google', name: 'Google', icon: Search, color: 'text-red-500' },
  { id: 'direct', name: 'Directo', icon: MousePointer, color: 'text-gray-500' },
]

const QR_LOCATIONS = [
  { id: 'qr-mesa1', name: 'Mesa 1' },
  { id: 'qr-mesa2', name: 'Mesa 2' },
  { id: 'qr-mesa3', name: 'Mesa 3' },
  { id: 'qr-mesa4', name: 'Mesa 4' },
  { id: 'qr-mesa5', name: 'Mesa 5' },
  { id: 'qr-puerta', name: 'Puerta entrada' },
  { id: 'qr-ventana', name: 'Ventana' },
  { id: 'qr-takeaway', name: 'Zona takeaway' },
]

export default function UrlGenerator({ tenants }: UrlGeneratorProps) {
  const [selectedTenant, setSelectedTenant] = useState<string>('')
  const [selectedSource, setSelectedSource] = useState<string>('instagram')
  const [customLabel, setCustomLabel] = useState<string>('')
  const [copied, setCopied] = useState<string | null>(null)

  const selectedTenantData = tenants.find(t => t._id === selectedTenant)
  
  const baseUrl = selectedTenantData 
    ? `https://takeasygo.com/${selectedTenantData.slug}/menu`
    : 'https://takeasygo.com/[tenant]/menu'

  const generateUrl = (source: string, label?: string) => {
    const sourceParam = label ? `${source}-${label}` : source
    return `${baseUrl}?source=${sourceParam}`
  }

  const copyToClipboard = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const generateQRCode = (url: string, name: string) => {
    // Abrir generador de QR externo con la URL precargada
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`
    window.open(qrUrl, '_blank')
  }

  return (
    <div className="bg-card border-2 border-border/60 rounded-2xl p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Link2 size={20} className="text-primary" />
          Generador de URLs con Tracking
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Genera URLs personalizadas para rastrear de dónde vienen tus clientes
        </p>
      </div>

      {/* Selección de Tenant */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Seleccionar Tenant</label>
        <select
          value={selectedTenant}
          onChange={(e) => setSelectedTenant(e.target.value)}
          className="w-full h-10 text-sm bg-background border border-border/60 rounded-lg px-3"
        >
          <option value="">Selecciona un tenant...</option>
          {tenants.map(t => (
            <option key={t._id} value={t._id}>{t.name} ({t.slug})</option>
          ))}
        </select>
      </div>

      {selectedTenantData && (
        <>
          {/* URLs por canal */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              URLs por Canal
            </h3>
            <div className="grid gap-3">
              {SOURCES.map((source) => {
                const url = generateUrl(source.id)
                const Icon = source.icon
                return (
                  <div key={source.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl">
                    <span className={cn('p-2 rounded-lg bg-background', source.color)}>
                      <Icon size={18} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{source.name}</p>
                      <p className="text-xs text-muted-foreground truncate font-mono">{url}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(url, source.id)}
                    >
                      {copied === source.id ? (
                        <Check size={14} className="text-green-500" />
                      ) : (
                        <Copy size={14} />
                      )}
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* URLs para QR por ubicación */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              QR por Ubicación
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {QR_LOCATIONS.map((loc) => {
                const url = generateUrl('qr', loc.id.replace('qr-', ''))
                return (
                  <div key={loc.id} className="flex flex-col gap-2 p-3 bg-muted/30 rounded-xl">
                    <div className="flex items-center gap-2">
                      <QrCode size={16} className="text-emerald-500" />
                      <span className="text-sm font-medium text-foreground">{loc.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate font-mono">{url}</p>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-8"
                        onClick={() => copyToClipboard(url, loc.id)}
                      >
                        {copied === loc.id ? <Check size={12} /> : <Copy size={12} />}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => generateQRCode(url, loc.name)}
                        title="Generar QR"
                      >
                        <Download size={12} />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* URL personalizada */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              URL Personalizada
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="Ej: flyer, evento, promo-julio"
                className="flex-1 h-10 text-sm bg-background border border-border/60 rounded-lg px-3"
              />
              {customLabel && (
                <Button
                  variant="outline"
                  onClick={() => copyToClipboard(generateUrl('custom', customLabel), 'custom')}
                >
                  {copied === 'custom' ? <Check size={14} /> : <Copy size={14} />}
                </Button>
              )}
            </div>
            {customLabel && (
              <p className="text-xs text-muted-foreground font-mono">
                {generateUrl('custom', customLabel)}
              </p>
            )}
          </div>
        </>
      )}

      {!selectedTenantData && (
        <div className="text-center py-8 text-muted-foreground bg-muted/30 rounded-xl">
          Selecciona un tenant para generar las URLs
        </div>
      )}
    </div>
  )
}
