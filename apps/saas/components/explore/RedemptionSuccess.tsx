'use client'

import { useState, useEffect } from 'react'
import { CheckCircle, QrCode, Share2, ArrowLeft, Clock, Copy, ThumbsUp, ThumbsDown } from 'lucide-react'
import { toast } from 'sonner'
import confetti from 'canvas-confetti'
import { useNotificationSound } from '@/hooks/useNotificationSound'
import { useHaptic } from '@/components/tgo/useHaptic'

interface Props {
  tenantSlug: string
  redemption: any
  item: any
  member: any
  onBack: () => void
}

export default function RedemptionSuccess({ tenantSlug, redemption, item, member, onBack }: Props) {
  const haptic = useHaptic()
  const [copied, setCopied] = useState(false)
  const { play: playPop } = useNotificationSound('/pop.mp3')

  useEffect(() => {
    playPop()
    confetti({ particleCount: 50, spread: 80, origin: { y: 0.4 }, colors: ['#22c55e', '#fbbf24', '#3b82f6', '#a855f7'] })
    setTimeout(() => {
      confetti({ particleCount: 25, spread: 100, origin: { y: 0.6 } })
    }, 300)
  }, [playPop])

  function handleCopyCode() {
    navigator.clipboard.writeText(redemption.redemptionCode)
    setCopied(true)
    toast.success('Código copiado')
    setTimeout(() => setCopied(false), 2000)
  }

  function handleShare() {
    const platformUrl = 'https://www.takeasygo.com/app'
    const shareText = `¡Acabo de canjear mis puntos por ${item.name} en ${tenantSlug}! 🎁✨\n\nSumate vos también a la red de beneficios de TGO y empezá a ganar premios en tus locales favoritos. @takeasygo`

    if (navigator.share) {
      navigator.share({
        title: `¡Beneficio exclusivo en TGO!`,
        text: shareText,
        url: platformUrl,
      }).catch(err => {
        console.error('Error al compartir:', err)
      })
    } else {
      const fullText = `${shareText}\n\n${platformUrl}`
      navigator.clipboard.writeText(fullText)
      toast.success('Mensaje copiado para compartir')
    }
  }

  const expiresAt = new Date(redemption.expiresAt)
  const hoursRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60)))
  const [feedbackSent, setFeedbackSent] = useState<'yes' | 'no' | null>(null)

  async function sendRedeemFeedback(val: boolean) {
    setFeedbackSent(val ? 'yes' : 'no')
    await fetch(`/api/${tenantSlug}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'redeem_completed', wasEasy: val }),
    }).catch(() => {})
  }

  return (
    <div
      className="min-h-screen p-4"
      style={{ background: 'linear-gradient(180deg, var(--tgo-state-success-soft), var(--tgo-surface-0))' }}
    >
      <div className="max-w-md mx-auto">
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => { haptic.impact('light'); onBack() }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors"
            style={{ color: 'var(--tgo-text-primary)' }}
          >
            <ArrowLeft size={18} />
            Volver
          </button>
          <a
            href={`/${tenantSlug}`}
            onClick={() => haptic.impact('light')}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors"
            style={{ color: 'var(--tgo-text-link)' }}
          >
            Ir al menú
          </a>
        </div>

        <div
          className="overflow-hidden"
          style={{
            borderRadius: 'var(--tgo-radius-xl)',
            backgroundColor: 'var(--tgo-card)',
            border: '2px solid var(--tgo-state-success)',
          }}
        >
          <div className="p-8 text-center">
            {/* Success Icon */}
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ backgroundColor: 'var(--tgo-state-success-soft)' }}
            >
              <CheckCircle size={40} style={{ color: 'var(--tgo-state-success)' }} />
            </div>

            <h1 className="text-2xl font-black mb-2" style={{ color: 'var(--tgo-text-primary)' }}>
              ¡Canje Exitoso!
            </h1>
            <p className="mb-6" style={{ color: 'var(--tgo-text-muted)' }}>
              Canjeaste <span className="font-bold" style={{ color: 'var(--tgo-state-success)' }}>{item.name}</span> por{' '}
              <span className="font-bold" style={{ color: 'var(--tgo-state-success)' }}>{redemption.pointsUsed} puntos</span>
            </p>

            {/* QR Code */}
            <div
              className="p-6 mb-6 inline-block"
              style={{
                borderRadius: 'var(--tgo-radius-xl)',
                backgroundColor: 'var(--tgo-surface-0)',
                border: '2px solid var(--tgo-border)',
              }}
            >
              <div
                className="w-48 h-48 flex items-center justify-center"
                style={{
                  borderRadius: 'var(--tgo-radius-md)',
                  backgroundColor: 'var(--tgo-surface-1)',
                }}
              >
                <QrCode size={64} style={{ color: 'var(--tgo-text-muted)' }} />
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--tgo-text-muted)' }}>
                Escanea en el local
              </p>
            </div>

            {/* Redemption Code */}
            <div
              className="p-4 mb-6"
              style={{
                borderRadius: 'var(--tgo-radius-md)',
                backgroundColor: 'var(--tgo-surface-1)',
              }}
            >
              <p className="text-xs mb-2" style={{ color: 'var(--tgo-text-muted)' }}>
                Código de redención
              </p>
              <div className="flex items-center justify-center gap-2">
                <code
                  className="text-2xl font-mono font-bold tracking-wider"
                  style={{ color: 'var(--tgo-text-primary)' }}
                >
                  {redemption.redemptionCode}
                </code>
                <button
                  onClick={() => { haptic.success(); handleCopyCode() }}
                  aria-label={copied ? 'Código copiado' : 'Copiar código de redención'}
                  className="p-2 transition-colors"
                  style={{ color: 'var(--tgo-text-muted)' }}
                >
                  {copied ? <CheckCircle size={16} style={{ color: 'var(--tgo-state-success)' }} /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            {/* Expiry */}
            <div
              className="flex items-center justify-center gap-2 mb-6"
              style={{ color: 'var(--tgo-state-discovery)' }}
            >
              <Clock size={16} />
              <span className="text-sm font-medium">
                Expira en {hoursRemaining} hora{hoursRemaining !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Instructions */}
            <div
              className="text-left p-4 mb-6"
              style={{
                borderRadius: 'var(--tgo-radius-md)',
                backgroundColor: 'var(--tgo-state-info-soft)',
              }}
            >
              <h3 className="font-bold text-sm mb-2" style={{ color: 'var(--tgo-text-primary)' }}>
                Instrucciones:
              </h3>
              <ol className="text-sm space-y-1 list-decimal list-inside" style={{ color: 'var(--tgo-text-muted)' }}>
                <li>Ve al local antes de que expire el código</li>
                <li>Muestra este código QR o el código de redención</li>
                <li>El staff validará tu canje</li>
              </ol>
            </div>

            {/* Share Button */}
            <button
              onClick={() => { haptic.impact('light'); handleShare() }}
              className="w-full mb-3 flex items-center justify-center gap-2 py-3 text-sm font-bold transition-all"
              style={{
                borderRadius: 'var(--tgo-radius-md)',
                border: '1px solid var(--tgo-border)',
                color: 'var(--tgo-text-primary)',
              }}
            >
              <Share2 size={16} />
              Compartir
            </button>

            <p className="text-xs mb-4" style={{ color: 'var(--tgo-text-muted)' }}>
              Compartí tu canje y ganá puntos extra invitando amigos a la red <b>TGO</b>
            </p>

            {/* Feedback */}
            {feedbackSent === null && (
              <div className="pt-5 mt-2 space-y-3" style={{ borderTop: '1px solid var(--tgo-border)' }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--tgo-text-primary)' }}>
                  ¿El canje fue fácil?
                </p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => { haptic.success(); sendRedeemFeedback(true) }}
                    aria-label="El canje fue fácil, sí"
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all"
                    style={{
                      border: '2px solid var(--tgo-state-success)',
                      color: 'var(--tgo-state-success)',
                    }}
                  >
                    <ThumbsUp size={16} /> Sí
                  </button>
                  <button
                    onClick={() => { haptic.error(); sendRedeemFeedback(false) }}
                    aria-label="El canje no fue fácil, no"
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all"
                    style={{
                      border: '2px solid var(--tgo-state-danger)',
                      color: 'var(--tgo-state-danger)',
                    }}
                  >
                    <ThumbsDown size={16} /> No
                  </button>
                </div>
              </div>
            )}
            {feedbackSent !== null && (
              <div className="pt-5 mt-2 text-center" style={{ borderTop: '1px solid var(--tgo-border)' }}>
                <p className="text-sm font-medium" style={{ color: 'var(--tgo-state-success)' }}>
                  {feedbackSent === 'yes' ? '¡Genial! Disfrutá tu premio.' : 'Gracias, trabajamos para mejorar.'}
                </p>
              </div>
            )}

            <div className="pt-6 flex flex-col items-center gap-2" style={{ borderTop: '1px solid var(--tgo-border)' }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '0.2em',
                  color: 'var(--tgo-text-muted)',
                }}
              >
                Powered by
              </span>
              <img
                src="https://res.cloudinary.com/dypcq8lsa/image/upload/v1773077771/ChatGPT_Image_9_mar_2026__02_28_19_p.m.-removebg-preview-removebg-preview_1_yrwjdm.png"
                alt="TakeasyGO"
                className="h-6 opacity-40 grayscale hover:grayscale-0 hover:opacity-100 transition-all cursor-pointer"
                onClick={() => window.open('https://www.takeasygo.com', '_blank')}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
