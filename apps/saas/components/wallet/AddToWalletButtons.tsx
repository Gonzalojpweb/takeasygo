'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { QRCodeSVG } from 'qrcode.react'
import { Smartphone, QrCode, Loader2, CheckCircle2, CreditCard, Apple } from 'lucide-react'

interface AddToWalletButtonsProps {
  tenantSlug: string
  memberId: string
  publicId: string
  points: number
  tier: string
  appleAvailable?: boolean
}

type WalletStatus = 'idle' | 'loading' | 'success' | 'error'

export default function AddToWalletButtons({
  tenantSlug,
  memberId,
  publicId,
  points,
  tier,
  appleAvailable = false
}: AddToWalletButtonsProps) {
  const [googleStatus, setGoogleStatus] = useState<WalletStatus>('idle')
  const [appleStatus, setAppleStatus] = useState<WalletStatus>('idle')
  const [showQR, setShowQR] = useState(false)

  // Agregar a Google Wallet
  const addToGoogleWallet = async () => {
    setGoogleStatus('loading')
    
    try {
      const res = await fetch(`/api/${tenantSlug}/loyalty/wallet/generate?memberId=${memberId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'google' })
      })

      const data = await res.json()

      if (!res.ok || !data.wallets?.google?.jwt) {
        throw new Error(data.error || 'Error generando tarjeta')
      }

      // Redirigir a Google Wallet con el JWT
      // En producción, esto abre el botón nativo de Google Wallet
      const jwt = data.wallets.google.jwt
      
      // Para web, podemos usar el Save to Wallet button de Google
      // o redirigir a una URL especial
      const googleWalletUrl = `https://pay.google.com/gp/v/save/${jwt}`
      window.open(googleWalletUrl, '_blank')
      
      setGoogleStatus('success')
      
      // Resetear después de 3 segundos
      setTimeout(() => setGoogleStatus('idle'), 3000)
      
    } catch (error) {
      console.error('Error Google Wallet:', error)
      setGoogleStatus('error')
      setTimeout(() => setGoogleStatus('idle'), 3000)
    }
  }

  // Descargar para Apple Wallet
  const addToAppleWallet = async () => {
    setAppleStatus('loading')
    
    try {
      // Descargar directamente el archivo .pkpass
      const res = await fetch(
        `/api/${tenantSlug}/loyalty/wallet/generate?memberId=${memberId}&format=apple`
      )

      if (!res.ok) {
        throw new Error('Error generando pase')
      }

      // Descargar archivo
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${publicId}.pkpass`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      setAppleStatus('success')
      setTimeout(() => setAppleStatus('idle'), 3000)
      
    } catch (error) {
      console.error('Error Apple Wallet:', error)
      setAppleStatus('error')
      setTimeout(() => setAppleStatus('idle'), 3000)
    }
  }

  return (
    <div className="space-y-4">
      {/* Tarjeta Digital Preview */}
      <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 rounded-2xl p-6 text-white shadow-xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">Club de Fidelización</p>
            <h3 className="text-lg font-bold">{publicId}</h3>
          </div>
          <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
            <QrCode size={24} className="text-white" />
          </div>
        </div>
        
        <div className="flex items-end justify-between">
          <div>
            <p className="text-3xl font-black">{points}</p>
            <p className="text-xs text-zinc-400 uppercase tracking-wider">Puntos</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium capitalize">{tier === 'none' ? 'Miembro' : tier}</p>
            <p className="text-xs text-zinc-400 uppercase tracking-wider">Nivel</p>
          </div>
        </div>
      </div>

      {/* Botones de Wallet */}
      <div className={`grid gap-3 ${appleAvailable ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
        {/* Google Wallet Button */}
        <Button
          onClick={addToGoogleWallet}
          disabled={googleStatus === 'loading' || googleStatus === 'success'}
          variant="outline"
          className="h-14 text-violet-700 rounded-xl border-2 border-zinc-200 hover:border-zinc-900 hover:bg-zinc-50 transition-all"
        >
          {googleStatus === 'loading' ? (
            <Loader2 size={20} className="animate-spin mr-2" />
          ) : googleStatus === 'success' ? (
            <CheckCircle2 size={20} className="text-emerald-500 mr-2" />
          ) : (
            <CreditCard size={20} className="mr-2" />
          )}
          <span className="text-sm font-medium">
            {googleStatus === 'success' ? '¡Agregado!' : 'Google Wallet'}
          </span>
        </Button>

        {/* Apple Wallet Button */}
        {appleAvailable && (
          <Button
            onClick={addToAppleWallet}
            disabled={appleStatus === 'loading' || appleStatus === 'success'}
            variant="outline"
            className="text-violet-700 h-14 rounded-xl border-2 border-zinc-200 hover:border-zinc-900 hover:bg-zinc-50 transition-all"
          >
            {appleStatus === 'loading' ? (
              <Loader2 size={20} className="animate-spin mr-2" />
            ) : appleStatus === 'success' ? (
              <CheckCircle2 size={20} className="text-emerald-500 mr-2" />
            ) : (
              <Apple size={20} className="mr-2" />
            )}
            <span className="text-sm font-medium">
              {appleStatus === 'success' ? '¡Descargado!' : 'Apple Wallet'}
            </span>
          </Button>
        )}
      </div>

      {/* Botón Mostrar QR */}
      <Button
        onClick={() => setShowQR(!showQR)}
        variant="ghost"
        className="w-full h-12 text-zinc-500 hover:text-zinc-900"
      >
        <QrCode size={18} className="mr-2" />
        {showQR ? 'Ocultar código QR' : 'Mostrar código QR'}
      </Button>

      {/* QR Code Display */}
      {showQR && (
        <div className="bg-white rounded-2xl p-6 border-2 border-zinc-100">
          <div className="flex justify-center">
            <QRCodeSVG value={publicId} size={180} />
          </div>
          <p className="text-center text-xs text-zinc-400 mt-4">
            Muestra este código en el local para acumular puntos
          </p>
        </div>
      )}

      {/* Info */}
      <div className="flex items-start gap-3 p-4 bg-violet-50 rounded-xl border border-violet-100">
        <Smartphone size={16} className="text-violet-600 mt-0.5 shrink-0" />
        <p className="text-xs text-violet-700 leading-relaxed">
          Agrega tu tarjeta a Google Wallet o Apple Wallet para tenerla siempre disponible.
          Los puntos se actualizan automáticamente.
        </p>
      </div>
    </div>
  )
}
