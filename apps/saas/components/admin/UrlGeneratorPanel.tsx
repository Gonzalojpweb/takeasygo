'use client'

import { useState, useEffect } from 'react'
import { Copy, Check, Link2, Instagram, QrCode, MessageCircle, Facebook, Download, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface UrlGeneratorPanelProps {
  tenantSlug: string
  tenantName: string
}

const SOURCES = [
  { id: 'instagram', name: 'Instagram / Linktree', icon: Instagram, color: 'text-pink-500', bgColor: 'bg-pink-500/10' },
  { id: 'facebook', name: 'Facebook', icon: Facebook, color: 'text-blue-600', bgColor: 'bg-blue-600/10' },
  { id: 'qr', name: 'QR General', icon: QrCode, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
  { id: 'whatsapp', name: 'WhatsApp', icon: MessageCircle, color: 'text-green-500', bgColor: 'bg-green-500/10' },
]

const QR_LOCATIONS = [
  { id: 'qr-mesa1', name: 'Mesa 1' },
  { id: 'qr-mesa2', name: 'Mesa 2' },
  { id: 'qr-mesa3', name: 'Mesa 3' },
  { id: 'qr-mesa4', name: 'Mesa 4' },
  { id: 'qr-mesa5', name: 'Mesa 5' },
  { id: 'qr-mesa6', name: 'Mesa 6' },
  { id: 'qr-puerta', name: 'Puerta entrada' },
  { id: 'qr-takeaway', name: 'Zona Takeaway', promo: 'takeaway' },
]

export default function UrlGeneratorPanel({ tenantSlug, tenantName }: UrlGeneratorPanelProps) {
  const [copied, setCopied] = useState<string | null>(null)
  const [showAllQr, setShowAllQr] = useState(false)

  const [baseUrl, setBaseUrl] = useState(`https://takeasygo.com/${tenantSlug}/menu`)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBaseUrl(`${window.location.origin}/${tenantSlug}/menu`)
    }
  }, [tenantSlug])

  const generateUrl = (source: string, label?: string, promo?: string) => {
    let url = `${baseUrl}?source=${source}`
    if (label) url += `-${label}`
    if (promo) url += `&promo=${promo}`
    return url
  }

  const copyToClipboard = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const generateQRCode = (url: string) => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(url)}`
    window.open(qrUrl, '_blank')
  }

  return (
    <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-2xl p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Link2 size={20} className="text-primary" />
          Links para compartir
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Usa estos links para saber de dónde vienen tus clientes. Copia el link según dónde lo vayas a compartir.
        </p>
      </div>

      {/* Links principales */}
      <div className="grid grid-cols-1 gap-3">
        {SOURCES.map((source) => {
          const url = generateUrl(source.id)
          const Icon = source.icon
          return (
            <div key={source.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-card rounded-xl border border-border/60">
              <div className="flex items-center gap-3">
                <span className={cn('p-3 rounded-xl', source.bgColor, source.color)}>
                  <Icon size={22} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">{source.name}</p>
                  <p className="text-xs text-muted-foreground truncate font-mono">{url}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(url, source.id)}
                className="shrink-0 w-full sm:w-auto"
              >
                {copied === source.id ? (
                  <Check size={16} className="text-green-500" />
                ) : (
                  <Copy size={16} />
                )}
                <span className="ml-2 hidden sm:inline">
                  {copied === source.id ? 'Copiado' : 'Copiar'}
                </span>
              </Button>
            </div>
          )
        })}
      </div>

      {/* QR por ubicación */}
      <div className="space-y-4 pt-4 border-t border-border/40">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            QR por ubicación (mesas, puerta, etc.)
          </h3>
          <Button variant="ghost" size="sm" onClick={() => setShowAllQr(!showAllQr)}>
            {showAllQr ? 'Ver menos' : 'Ver todos'}
          </Button>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {(showAllQr ? QR_LOCATIONS : QR_LOCATIONS.slice(0, 4)).map((loc: any) => {
            const url = loc.promo ? generateUrl('qr', undefined, loc.promo) : generateUrl('qr', loc.id.replace('qr-', ''))
            return (
              <div key={loc.id} className="flex flex-col gap-2 p-3 bg-card rounded-xl border border-border/60">
                <div className="flex items-center gap-2">
                  <QrCode size={16} className="text-emerald-500" />
                  <span className="text-sm font-medium text-foreground">{loc.name}</span>
                </div>
                <p className="text-[10px] text-muted-foreground break-all font-mono">{url}</p>
                <div className="flex gap-1 mt-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={() => copyToClipboard(url, loc.id)}
                  >
                    {copied === loc.id ? <Check size={12} /> : <Copy size={12} />}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2"
                    onClick={() => generateQRCode(url)}
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

      {/* Instrucciones */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
        <p className="text-sm font-medium text-blue-900">💡 Cómo usar:</p>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>Copia el link de <strong>Instagram</strong> y pégalo en tu Linktree</li>
          <li>Copia el link de <strong>QR General</strong> para mesas sin número específico</li>
          <li>Usa los <strong>QR por mesa</strong> para saber desde qué mesa ordenan</li>
          <li>Los links funcionan igual, solo registran de dónde vino el cliente</li>
        </ul>
      </div>
    </div>
  )
}
