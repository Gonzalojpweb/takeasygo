'use client'

import { useEffect, useState, useCallback } from 'react'
import ConfirmPickupButton from './ConfirmPickupButton'

const STATUS_STEPS = ['pending', 'confirmed', 'preparing', 'ready', 'delivered']

const STATUS_INFO: Record<string, { label: string; description: string; emoji: string; pulse?: boolean }> = {
  pending:   { label: 'Recibido',   description: 'Tu pedido fue recibido y está esperando confirmación', emoji: '📋' },
  confirmed: { label: 'Confirmado', description: 'El restaurante confirmó tu pedido', emoji: '✅', pulse: true },
  preparing: { label: 'Preparando', description: 'Tu pedido está siendo preparado', emoji: '👨‍🍳', pulse: true },
  ready:     { label: '¡Listo!',    description: '¡Pasá a retirar tu pedido!', emoji: '🎉', pulse: true },
  delivered: { label: 'Entregado',  description: 'Pedido retirado. ¡Que lo disfrutes!', emoji: '🍽️' },
  cancelled: { label: 'Cancelado',  description: 'El pedido fue cancelado', emoji: '❌' },
}

interface Props {
  orderId: string
  tenantSlug: string
  locationId: string
  initialStatus: string
  initialEstimatedReadyAt: string | null
  primaryColor: string
  backgroundColor: string
  textColor: string
  orderNumber: string
  ratingToken: string | null
}

function formatCountdown(target: string): string {
  const diff = new Date(target).getTime() - Date.now()
  if (diff <= 0) return 'en cualquier momento'
  const mins = Math.ceil(diff / 60_000)
  return `en ~${mins} min`
}

export default function OrderTracker({
  orderId,
  tenantSlug,
  locationId,
  initialStatus,
  initialEstimatedReadyAt,
  primaryColor,
  backgroundColor,
  textColor,
  orderNumber,
  ratingToken,
}: Props) {
  const [status, setStatus]               = useState(initialStatus)
  const [estimatedReadyAt, setEstimatedReadyAt] = useState(initialEstimatedReadyAt)
  const [countdown, setCountdown]         = useState('')
  const [lastChecked, setLastChecked]     = useState<Date>(new Date())

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/${tenantSlug}/orders/${orderId}/track`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setStatus(data.status)
      setEstimatedReadyAt(data.estimatedReadyAt ?? null)
      setLastChecked(new Date())
    } catch { /* ignora errores de red */ }
  }, [tenantSlug, orderId])

  // Polling cada 10s mientras el pedido no sea terminal
  useEffect(() => {
    const terminal = ['delivered', 'cancelled']
    if (terminal.includes(status)) return
    const interval = setInterval(poll, 10_000)
    return () => clearInterval(interval)
  }, [status, poll])

  // Countdown timer (actualiza cada 30s)
  useEffect(() => {
    if (!estimatedReadyAt) return
    setCountdown(formatCountdown(estimatedReadyAt))
    const interval = setInterval(() => setCountdown(formatCountdown(estimatedReadyAt)), 30_000)
    return () => clearInterval(interval)
  }, [estimatedReadyAt])

  const info = STATUS_INFO[status] ?? STATUS_INFO['pending']
  const currentStep = STATUS_STEPS.indexOf(status)
  const isCancelled = status === 'cancelled'

  return (
    <div>
      {/* Status principal */}
      <div className="text-center mb-10">
        <div className={`text-6xl mb-4 ${info.pulse ? 'animate-bounce' : ''}`}>
          {info.emoji}
        </div>
        <h1 className="text-2xl font-black mb-2">{info.label}</h1>
        <p className="text-sm opacity-60">{info.description}</p>

        {/* Tiempo estimado */}
        {estimatedReadyAt && ['confirmed', 'preparing'].includes(status) && (
          <p className="mt-3 text-sm font-semibold" style={{ color: primaryColor }}>
            ⏱ Listo {countdown}
          </p>
        )}

        {/* Indicador de actualización en vivo */}
        {!['delivered', 'cancelled'].includes(status) && (
          <p className="mt-2 text-xs opacity-30">
            Actualiza automáticamente · última vez {lastChecked.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        )}
      </div>

      {/* Progress bar */}
      {!isCancelled && (
        <div className="mb-10">
          <div className="flex items-center justify-between mb-3">
            {STATUS_STEPS.map((step, index) => (
              <div key={step} className="flex flex-col items-center gap-1.5 flex-1">
                <div
                  className="w-4 h-4 rounded-full transition-all duration-500 flex items-center justify-center"
                  style={{
                    backgroundColor: index <= currentStep ? primaryColor : primaryColor + '25',
                    boxShadow: index === currentStep ? `0 0 0 4px ${primaryColor}30` : 'none',
                  }}
                >
                  {index < currentStep && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-[10px] opacity-50 text-center leading-tight hidden sm:block">
                  {STATUS_INFO[step].label}
                </span>
              </div>
            ))}
          </div>
          {/* Línea de progreso */}
          <div className="h-1 rounded-full w-full mx-auto" style={{ backgroundColor: primaryColor + '20' }}>
            <div
              className="h-1 rounded-full transition-all duration-700"
              style={{
                backgroundColor: primaryColor,
                width: `${(currentStep / (STATUS_STEPS.length - 1)) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* CTA: confirmar retiro */}
      {status === 'ready' && (
        <div className="mb-8 rounded-2xl p-5"
          style={{ backgroundColor: primaryColor + '10', border: `2px solid ${primaryColor}40` }}>
          <p className="text-sm font-semibold mb-4 text-center opacity-70">
            Acercate a retirar tu pedido y confirmá cuando lo tengas
          </p>
          <ConfirmPickupButton
            orderId={orderId}
            tenantSlug={tenantSlug}
            locationId={locationId}
            primaryColor={primaryColor}
            backgroundColor={backgroundColor}
            textColor={textColor}
          />
        </div>
      )}

      {/* CTAs cuando está entregado */}
      {status === 'delivered' && (
        <div className="mb-8 space-y-3">
          {/* Calificación — solo si hay token */}
          {ratingToken && (
            <a
              href={`/${tenantSlug}/rate/${orderNumber}?token=${ratingToken}`}
              className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl font-bold text-base border-2 transition-opacity hover:opacity-80"
              style={{ borderColor: primaryColor, color: primaryColor }}>
              ⭐ Calificá tu experiencia
            </a>
          )}
          <a
            href={`/${tenantSlug}/menu/${locationId}/takeaway`}
            className="block w-full text-center py-4 rounded-2xl font-bold text-base"
            style={{ backgroundColor: primaryColor, color: backgroundColor }}>
            Volver al menú
          </a>
        </div>
      )}
    </div>
  )
}
