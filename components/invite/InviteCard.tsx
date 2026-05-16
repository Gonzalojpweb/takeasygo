'use client'

import { useState, useRef, useCallback } from 'react'
import Image from 'next/image'
import { QRCodeSVG } from 'qrcode.react'
import { Share2, Download, Check, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'

const LOGO_URL = 'https://res.cloudinary.com/dypcq8lsa/image/upload/v1773077771/ChatGPT_Image_9_mar_2026__02_28_19_p.m.-removebg-preview-removebg-preview_1_yrwjdm.png'
const EXPLORE_URL = 'https://takeasygo.com/explore?source=invitacion'

export default function InviteCard() {
  const [copied, setCopied] = useState<'share' | 'download' | null>(null)
  const qrRef = useRef<HTMLDivElement>(null)

  const handleShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'TakeasyGO',
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

  return (
    <div className="animate-fade-in-up">
      {/* Glass card */}
      <div className="glass-card rounded-3xl p-8 flex flex-col items-center text-center">
        {/* Logo */}
        <div className="mb-6">
          <Image
            src={LOGO_URL}
            alt="TakeasyGO"
            width={120}
            height={28}
            className="h-6 w-auto"
            unoptimized
            priority
          />
        </div>

        {/* Headline */}
        <h1 className="text-lg font-bold text-[var(--c-text)] mb-1">
          Escaneá y descubrí
        </h1>
        <p className="text-sm text-[var(--c-text-secondary)] mb-8">
          restaurantes takeaway cerca tuyo
        </p>

        {/* QR */}
        <div
          ref={qrRef}
          className="bg-white rounded-2xl p-4 mb-4 glow-brand"
        >
          <QRCodeSVG
            value={EXPLORE_URL}
            size={200}
            level="M"
            fgColor="#0d0b0a"
          />
        </div>

        {/* URL label */}
        <p className="text-xs text-[var(--c-text-muted)] font-mono mb-8">
          takeasygo.com/explore
        </p>

        {/* Actions */}
        <div className="flex gap-3 w-full">
          <button
            onClick={handleShare}
            className={cn(
              'flex-1 h-12 rounded-2xl text-sm font-bold transition-all duration-200 flex items-center justify-center gap-2',
              copied === 'share'
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'glass-card-elevated text-[var(--c-text)] hover:bg-[var(--c-surface-elevated)] active:scale-[0.98]'
            )}
          >
            {copied === 'share' ? (
              <>
                <Check size={16} className="text-emerald-400" />
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
            className={cn(
              'flex-1 h-12 rounded-2xl text-sm font-bold transition-all duration-200 flex items-center justify-center gap-2',
              copied === 'download'
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'glass-card-elevated text-[var(--c-text)] hover:bg-[var(--c-surface-elevated)] active:scale-[0.98]'
            )}
          >
            {copied === 'download' ? (
              <>
                <Check size={16} className="text-emerald-400" />
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
      <div className="flex items-center justify-center gap-2 mt-6 text-[var(--c-text-muted)]">
        <Smartphone size={14} />
        <span className="text-xs">Mostrá este QR desde tu celular</span>
      </div>
    </div>
  )
}
