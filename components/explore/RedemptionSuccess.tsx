'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, QrCode, Share2, ArrowLeft, Clock, Copy, ThumbsUp, ThumbsDown, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import confetti from 'canvas-confetti'
import { useNotificationSound } from '@/hooks/useNotificationSound'

interface Props {
  tenantSlug: string
  redemption: any
  item: any
  member: any
  onBack: () => void
}

export default function RedemptionSuccess({ tenantSlug, redemption, item, member, onBack }: Props) {
  const [copied, setCopied] = useState(false)
  const { play: playPop } = useNotificationSound('/pop.mp3')

  // Momento 05: celebrar canje exitoso
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
    const platformUrl = 'https://www.takeasygo.com/explore'
    const shareText = `¡Acabo de canjear mis puntos por ${item.name} en ${tenantSlug}! 🎁✨\n\nSumate vos también a la red de beneficios de TakeasyGO y empezá a ganar premios en tus locales favoritos. @takeasygo`
    
    if (navigator.share) {
      navigator.share({
        title: `¡Beneficio exclusivo en TakeasyGO!`,
        text: shareText,
        url: platformUrl,
      }).catch(err => {
        console.error('Error al compartir:', err)
      })
    } else {
      // Fallback: Copy to clipboard if navigator.share is not available
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
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-background p-4">
      <div className="max-w-md mx-auto">
        <Button
          onClick={onBack}
          variant="ghost"
          className="mb-4"
        >
          <ArrowLeft size={18} className="mr-2" />
          Volver
        </Button>

        <Card className="border-2 border-emerald-200 overflow-hidden">
          <CardContent className="p-8 text-center">
            {/* Success Icon */}
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle size={40} className="text-emerald-600" />
            </div>

            <h1 className="text-2xl font-black mb-2">¡Canje Exitoso!</h1>
            <p className="text-muted-foreground mb-6">
              Canjeaste <span className="font-bold text-emerald-600">{item.name}</span> por{' '}
              <span className="font-bold text-emerald-600">{redemption.pointsUsed} puntos</span>
            </p>

            {/* QR Code */}
            <div className="bg-white p-6 rounded-2xl border-2 border-border mb-6 inline-block">
              <div className="w-48 h-48 bg-muted flex items-center justify-center">
                <QrCode size={64} className="text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">Escanea en el local</p>
            </div>

            {/* Redemption Code */}
            <div className="bg-muted p-4 rounded-xl mb-6">
              <p className="text-xs text-muted-foreground mb-2">Código de redención</p>
              <div className="flex items-center justify-center gap-2">
                <code className="text-2xl font-mono font-bold tracking-wider">
                  {redemption.redemptionCode}
                </code>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleCopyCode}
                >
                  {copied ? <CheckCircle size={16} className="text-emerald-600" /> : <Copy size={16} />}
                </Button>
              </div>
            </div>

            {/* Expiry */}
            <div className="flex items-center justify-center gap-2 text-amber-600 mb-6">
              <Clock size={16} />
              <span className="text-sm font-medium">
                Expira en {hoursRemaining} hora{hoursRemaining !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Instructions */}
            <div className="text-left bg-blue-50 p-4 rounded-xl mb-6">
              <h3 className="font-bold text-sm mb-2">Instrucciones:</h3>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Ve al local antes de que expire el código</li>
                <li>Muestra este código QR o el código de redención</li>
                <li>El staff validará tu canje</li>
              </ol>
            </div>

            {/* Share Button */}
            <Button
              onClick={handleShare}
              variant="outline"
              className="w-full mb-3"
            >
              <Share2 size={16} className="mr-2" />
              Compartir
            </Button>

            <p className="text-xs text-muted-foreground mb-4">
              Compartí tu canje y ganá puntos extra invitando amigos a la red <b>TakeasyGO</b>
            </p>

            {/* Feedback: ¿El canje fue fácil? */}
            {feedbackSent === null && (
              <div className="border-t border-border/50 pt-5 mt-2 space-y-3">
                <p className="text-sm font-semibold text-zinc-700">¿El canje fue fácil?</p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => sendRedeemFeedback(true)}
                    className={cn(
                      'flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm border-2 transition-all',
                      'border-emerald-200 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-50'
                    )}
                  >
                    <ThumbsUp size={16} /> Sí
                  </button>
                  <button
                    onClick={() => sendRedeemFeedback(false)}
                    className={cn(
                      'flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm border-2 transition-all',
                      'border-red-200 text-red-600 hover:border-red-400 hover:bg-red-50'
                    )}
                  >
                    <ThumbsDown size={16} /> No
                  </button>
                </div>
              </div>
            )}
            {feedbackSent !== null && (
              <div className="border-t border-border/50 pt-5 mt-2 text-center">
                <p className="text-sm font-medium text-emerald-600">
                  {feedbackSent === 'yes' ? '¡Genial! Disfrutá tu premio.' : 'Gracias, trabajamos para mejorar.'}
                </p>
              </div>
            )}

            <div className="pt-6 border-t border-border/50 flex flex-col items-center gap-2">
               <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Powered by</span>
               <img 
                 src="https://res.cloudinary.com/dypcq8lsa/image/upload/v1773077771/ChatGPT_Image_9_mar_2026__02_28_19_p.m.-removebg-preview-removebg-preview_1_yrwjdm.png" 
                 alt="TakeasyGO" 
                 className="h-6 opacity-40 grayscale hover:grayscale-0 hover:opacity-100 transition-all cursor-pointer"
                 onClick={() => window.open('https://www.takeasygo.com', '_blank')}
               />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
