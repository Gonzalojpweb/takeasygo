'use client'

import { useState, useRef, useCallback } from 'react'
import Image from 'next/image'
import { QRCodeSVG } from 'qrcode.react'
import { Share2, Download, Check, Smartphone } from 'lucide-react'

const LOGO_URL = '/tgoicon-512.png'
const EXPLORE_URL = 'https://takeasygo.com/app?source=invitacion'

export default function InviteCard() {
  const [copied, setCopied] = useState<'share' | 'download' | null>(null)
  const qrRef = useRef<HTMLDivElement>(null)

  const handleShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'TGO',
          text: 'Descubrí restaurantes takeaway cerca de vos',
          url: EXPLORE_URL,
        })
      } catch {
        // user cancelled
      }
    } else {
      await navigator.clipboard.writeText(EXPLORE_URL)
      setCopied('share')
      setTimeout(() => setCopied(null), 2000)
    }
  }, [])

  const handleDownload = useCallback(() => {
    const svg = qrRef.current?.querySelector('svg')
    if (!svg) return

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const rect = svg.getBoundingClientRect()
    canvas.width = rect.width * 3
    canvas.height = rect.height * 3

    const img = new window.Image()
    const xml = new XMLSerializer().serializeToString(svg)
    const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)

    img.onload = () => {
      ctx!.scale(3, 3)
      ctx!.fillStyle = '#ffffff'
      ctx!.fillRect(0, 0, rect.width, rect.height)
      ctx!.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)

      const link = document.createElement('a')
      link.download = 'takeasygo-invitacion.png'
      link.href = canvas.toDataURL('image/png')
      link.click()

      setCopied('download')
      setTimeout(() => setCopied(null), 2000)
    }

    img.src = url
  }, [])

  const cardStyle: React.CSSProperties = {
    borderRadius: 'var(--tgo-radius-2xl)',
    backgroundColor: 'var(--tgo-surface-card)',
    border: '1px solid var(--tgo-border)',
  }

  return (
    <div className="animate-fade-in-up">
      {/* Card */}
      <div className="p-8 flex flex-col items-center text-center" style={cardStyle}>
        {/* Logo */}
        <div className="mb-6">
          <Image
            src={LOGO_URL}
            alt="TGO"
            width={48}
            height={48}
            className="h-12 w-auto"
            unoptimized
            priority
          />
        </div>

        {/* Headline */}
        <h1 className="text-lg font-bold mb-1" style={{ color: 'var(--tgo-text-primary)' }}>
          Escaneá y descubrí
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--tgo-text-secondary)' }}>
          restaurantes takeaway cerca tuyo
        </p>

        {/* QR */}
        <div
          ref={qrRef}
          className="rounded-2xl p-4 mb-4"
          style={{ backgroundColor: 'white' }}
        >
          <QRCodeSVG
            value={EXPLORE_URL}
            size={200}
            level="M"
            fgColor="#0d0b0a"
          />
        </div>

        {/* URL label */}
        <p
          className="text-xs font-mono mb-8"
          style={{ color: 'var(--tgo-text-muted)' }}
        >
          takeasygo.com/app
        </p>

        {/* Actions */}
        <div className="flex gap-3 w-full">
          <button
            onClick={handleShare}
            className="flex-1 h-12 text-sm font-bold transition-all duration-200 flex items-center justify-center gap-2"
            style={{
              borderRadius: 'var(--tgo-radius-xl)',
              backgroundColor: copied === 'share' ? 'var(--tgo-state-success-soft)' : 'var(--tgo-surface-1)',
              color: copied === 'share' ? 'var(--tgo-state-success)' : 'var(--tgo-text-primary)',
              border: '1px solid var(--tgo-border)',
            }}
          >
            {copied === 'share' ? (
              <>
                <Check size={16} style={{ color: 'var(--tgo-state-success)' }} />
                ¡Copiado!
              </>
            ) : (
              <>
                <Share2 size={16} />
                Compartir
              </>
            )}
          </button>

          <button
            onClick={handleDownload}
            className="flex-1 h-12 text-sm font-bold transition-all duration-200 flex items-center justify-center gap-2"
            style={{
              borderRadius: 'var(--tgo-radius-xl)',
              backgroundColor: copied === 'download' ? 'var(--tgo-state-success-soft)' : 'var(--tgo-surface-1)',
              color: copied === 'download' ? 'var(--tgo-state-success)' : 'var(--tgo-text-primary)',
              border: '1px solid var(--tgo-border)',
            }}
          >
            {copied === 'download' ? (
              <>
                <Check size={16} style={{ color: 'var(--tgo-state-success)' }} />
                Descargado
              </>
            ) : (
              <>
                <Download size={16} />
                QR
              </>
            )}
          </button>
        </div>
      </div>

      {/* Footer hint */}
      <div className="flex items-center justify-center gap-2 mt-6" style={{ color: 'var(--tgo-text-muted)' }}>
        <Smartphone size={14} />
        <span className="text-xs">Mostrá este QR desde tu celular</span>
      </div>
    </div>
  )
}
