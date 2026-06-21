'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import ConfirmPickupButton from './ConfirmPickupButton'
import DeliveryCodeDisplay from './DeliveryCodeDisplay'
import { Calendar, Star, Sparkles, Lock } from 'lucide-react'
import AddToWalletButtons from '@/components/wallet/AddToWalletButtons'
import LoyaltySharePrompt from '@/components/menu/LoyaltySharePrompt'
import { useNotificationSound } from '@/hooks/useNotificationSound'
import { toast } from 'sonner'
import { StatusNotificationCard } from './StatusNotificationCard'
import PointsEarnedToast from '@/components/rewards/PointsEarnedToast'
import { Confetti, type ConfettiRef } from '@/registry/magicui/confetti'

const STATUS_STEPS = ['awaiting_payment', 'pending', 'confirmed', 'preparing', 'ready', 'en_ruta', 'arrived', 'delivered']

const STATUS_INFO: Record<string, { label: string; description: string; emoji: string; pulse?: boolean }> = {
  awaiting_payment: { label: 'Esperando pago', description: 'Completá el pago para confirmar tu pedido', emoji: '💳' },
  pending:   { label: 'Recibido',   description: 'Tu pedido fue recibido y está esperando confirmación', emoji: '📋' },
  confirmed: { label: 'Confirmado', description: 'El restaurante confirmó tu pedido', emoji: '✅', pulse: true },
  preparing: { label: 'Preparando', description: 'Tu pedido está siendo preparado', emoji: '👨‍🍳', pulse: true },
  ready:     { label: '¡Listo!',    description: '¡Pasá a retirar tu pedido!', emoji: '🎉', pulse: true },
  en_ruta:   { label: 'En camino',  description: 'El delivery está en camino a tu dirección', emoji: '🚗', pulse: true },
  arrived:   { label: 'Llegó',      description: 'El delivery llegó a tu domicilio', emoji: '📍', pulse: true },
  delivered: { label: 'Entregado',  description: 'Pedido entregado. ¡Que lo disfrutes!', emoji: '🍽️' },
  cancelled: { label: 'Cancelado',  description: 'El pedido fue cancelado', emoji: '❌' },
}

const PREPARING_MESSAGES = [
  'Tu pedido está siendo preparado',
  'Estamos procesando tu pedido',
  'El restaurante está trabajando en tu pedido',
]

interface Props {
  orderId: string
  tenantSlug: string
  locationId: string
  initialStatus: string
  initialEstimatedReadyAt: string | null
  initialCustomerEstimatedReadyAt?: string | null
  primaryColor: string
  backgroundColor: string
  textColor: string
  orderNumber: string
  ratingToken: string | null
  initialOrderTiming?: string
  initialScheduledPickupAt?: string | null
  initialScheduledStatus?: string | null
  pointsEarnedFromOrder?: number
  loyaltyData?: {
    memberId: string
    publicId: string
    points: number
    tier: string
    name: string
  } | null
  loyaltyPointsUsed?: number
  loyaltyDiscountAmount?: number
  hasRewardItems?: boolean
  rewardAdvanceApplied?: boolean
  rewardAdvanceConsolidated?: boolean
  tenantName: string
  clubName: string
  orderMode?: string
  deliveryAddress?: {
    street: string
    number: string
    apt?: string
    city: string
  }
}

function formatCountdown(target: string): string {
  const diff = new Date(target).getTime() - Date.now()
  if (diff <= 0) return 'en cualquier momento'
  const mins = Math.ceil(diff / 60_000)
  return `en ~${mins} min`
}

function formatScheduledDate(dateStr: string): string {
  const date = new Date(dateStr)
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const day = dayNames[date.getDay()]
  const d = date.getDate()
  const month = monthNames[date.getMonth()]
  const hours = date.getHours().toString().padStart(2, '0')
  const mins = date.getMinutes().toString().padStart(2, '0')
  return `${day} ${d} de ${month} a las ${hours}:${mins}`
}

export default function OrderTracker({
  orderId,
  tenantSlug,
  locationId,
  initialStatus,
  initialEstimatedReadyAt,
  initialCustomerEstimatedReadyAt = null,
  primaryColor,
  backgroundColor,
  textColor,
  orderNumber,
  ratingToken,
  initialOrderTiming = 'immediate',
  initialScheduledPickupAt = null,
  initialScheduledStatus = null,
  loyaltyData = null,
  loyaltyPointsUsed = 0,
  loyaltyDiscountAmount = 0,
  hasRewardItems = false,
  rewardAdvanceApplied = false,
  rewardAdvanceConsolidated = false,
  pointsEarnedFromOrder = 0,
  tenantName,
  clubName,
  orderMode,
  deliveryAddress,
}: Props) {
  const [status, setStatus]               = useState(initialStatus)
  const [confirmedAt, setConfirmedAt]     = useState<string | null>(null)
  const [estimatedReadyAt, setEstimatedReadyAt] = useState(initialEstimatedReadyAt)
  const [customerEstimatedReadyAt, setCustomerEstimatedReadyAt] = useState<string | null>(initialCustomerEstimatedReadyAt)
  const [cancellationClosed, setCancellationClosed] = useState(false)
  const [countdown, setCountdown]         = useState('')
  const [lastChecked, setLastChecked]     = useState<Date | null>(null)
  const [orderTiming, setOrderTiming]     = useState(initialOrderTiming)
  const [scheduledPickupAt, setScheduledPickupAt] = useState<string | null>(initialScheduledPickupAt)
  const [scheduledStatus, setScheduledStatus] = useState<string | null>(initialScheduledStatus)
  const [scheduleCountdown, setScheduleCountdown] = useState('')
  const [deliveryCode, setDeliveryCode] = useState<string | null>(null)
  const [deliveryPersonName, setDeliveryPersonName] = useState<string | null>(null)
  const [deliveryConfStatus, setDeliveryConfStatus] = useState<string | null>(null)
  const { play: playNotification } = useNotificationSound('/pop.mp3')
  const confettiRef = useRef<ConfettiRef>(null)

  const [msgIndex, setMsgIndex] = useState(0)

  const isScheduledPending = orderTiming === 'scheduled' && scheduledStatus === 'pending_schedule'

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/${tenantSlug}/orders/${orderId}/track`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setStatus(data.status)
      setConfirmedAt(data.confirmedAt ?? null)
      setEstimatedReadyAt(data.estimatedReadyAt ?? null)
      setCustomerEstimatedReadyAt(data.customerEstimatedReadyAt ?? null)
      setOrderTiming(data.orderTiming ?? 'immediate')
      setScheduledPickupAt(data.scheduledPickupAt ?? null)
      setScheduledStatus(data.scheduledStatus ?? null)
      setDeliveryCode(data.deliveryConfirmation?.customerCode ?? null)
      setDeliveryPersonName(data.deliveryConfirmation?.deliveryPersonName ?? null)
      setDeliveryConfStatus(data.deliveryConfirmation?.status ?? null)
      setLastChecked(new Date())
    } catch { /* ignora errores de red */ }
  }, [tenantSlug, orderId])

  // Verificar inmediatamente si está esperando pago al cargar
  useEffect(() => {
    if (initialStatus === 'awaiting_payment') {
      poll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Ejecutar solo al montar

  // Polling cada 10s mientras el pedido no sea terminal
  useEffect(() => {
    const terminal = ['delivered', 'cancelled']
    if (terminal.includes(status)) return
    const interval = setInterval(poll, 10_000)
    return () => clearInterval(interval)
  }, [status, poll])

  // Countdown timer (actualiza cada 30s)
  // Usa customerEstimatedReadyAt si está disponible (incluye demora informada por el restaurante)
  const effectiveEstimatedReadyAt = customerEstimatedReadyAt ?? estimatedReadyAt
  useEffect(() => {
    if (!effectiveEstimatedReadyAt) return
    setCountdown(formatCountdown(effectiveEstimatedReadyAt))
    const interval = setInterval(() => setCountdown(formatCountdown(effectiveEstimatedReadyAt)), 30_000)
    return () => clearInterval(interval)
  }, [effectiveEstimatedReadyAt])

  // Countdown para pedido programado pendiente
  useEffect(() => {
    if (!isScheduledPending || !scheduledPickupAt) return
    const updateScheduleCountdown = () => {
      const diff = new Date(scheduledPickupAt).getTime() - Date.now()
      if (diff <= 0) {
        setScheduleCountdown('Tu pedido está siendo activado...')
        return
      }
      const hours = Math.floor(diff / 3_600_000)
      const mins = Math.ceil((diff % 3_600_000) / 60_000)
      if (hours > 0) {
        setScheduleCountdown(`Faltan ${hours}h ${mins}min`)
      } else {
        setScheduleCountdown(`Faltan ~${mins} min`)
      }
    }
    updateScheduleCountdown()
    const interval = setInterval(updateScheduleCountdown, 30_000)
    return () => clearInterval(interval)
  }, [isScheduledPending, scheduledPickupAt])

  // Evaluar si la ventana de cancelación está cerrada
  useEffect(() => {
    const check = () => {
      if (!confirmedAt) {
        setCancellationClosed(false)
        return
      }
      if (status === 'preparing') {
        setCancellationClosed(true)
        return
      }
      if (status === 'confirmed') {
        const elapsed = Date.now() - new Date(confirmedAt).getTime()
        setCancellationClosed(elapsed >= 180_000)
        return
      }
      setCancellationClosed(false)
    }
    check()
    const interval = setInterval(check, 5_000)
    return () => clearInterval(interval)
  }, [confirmedAt, status])

  // Momento 06 + 07: Sonido + notificación + haptic en cambios de estado clave
  const prevStatusRef = useRef(status)
  useEffect(() => {
    if (status === 'confirmed' && prevStatusRef.current !== 'confirmed') {
      toast(
        <StatusNotificationCard
          icon="✅"
          iconBg="#10b981"
          title="Tu pedido fue confirmado"
          description="El restaurante está procesando tu pedido"
        />,
        { duration: 6000, position: 'top-center' }
      )
      playNotification()
      if (navigator.vibrate) navigator.vibrate([100, 50, 100])
    }
    if (status === 'ready' && prevStatusRef.current !== 'ready') {
      toast(
        <StatusNotificationCard
          icon="🎉"
          iconBg="#3b82f6"
          title="¡Tu pedido está listo!"
          description="Pasá a retirar tu pedido"
        />,
        { duration: 10000, position: 'top-center' }
      )
      confettiRef.current?.fire({ particleCount: 120, spread: 140 })
      playNotification()
      if (navigator.vibrate) navigator.vibrate([200, 100, 200])
    }
    if (status === 'en_ruta' && prevStatusRef.current !== 'en_ruta') {
      const name = deliveryPersonName ? ` (${deliveryPersonName})` : ''
      toast(
        <StatusNotificationCard
          icon="🚗"
          iconBg="#f59e0b"
          title={`Delivery en camino${name}`}
          description="El delivery está yendo a tu dirección"
        />,
        { duration: 8000, position: 'top-center' }
      )
      playNotification()
      if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 100])
    }
    if (status === 'arrived' && prevStatusRef.current !== 'arrived') {
      toast(
        <StatusNotificationCard
          icon="📍"
          iconBg="#10b981"
          title="El delivery llegó"
          description="Entregale el código de 6 dígitos al delivery"
        />,
        { duration: 10000, position: 'top-center' }
      )
      playNotification()
      if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200])
    }
    prevStatusRef.current = status
  }, [status, playNotification])

  // Momento 04: Notificar Reward Advance (uso o consolidación)
  const advanceShownRef = useRef(false)
  useEffect(() => {
    if (advanceShownRef.current) return
    if (rewardAdvanceConsolidated) {
      advanceShownRef.current = true
      playNotification()
      if (navigator.vibrate) navigator.vibrate([80, 40, 80])
      toast(
        <StatusNotificationCard
          icon="✅"
          iconBg="#10b981"
          title="Reward Advance consolidado"
          description="Tus puntos se actualizaron y tu saldo está al día. ¡Seguí acumulando!"
        />,
        { duration: 6000 }
      )
    } else if (rewardAdvanceApplied) {
      advanceShownRef.current = true
      playNotification()
      if (navigator.vibrate) navigator.vibrate([60, 30, 60])
      toast(
        <StatusNotificationCard
          icon="✨"
          iconBg="#f59e0b"
          title="Reward Advance activado"
          description="Te adelantamos los puntos para que disfrutes tu recompensa. Consolidalos en tu próxima compra."
        />,
        { duration: 6000 }
      )
    }
  }, [rewardAdvanceApplied, rewardAdvanceConsolidated, playNotification])

  // Momento 03: Notificar puntos ganados al cargar la página de tracking
  const pointsShownRef = useRef(false)
  useEffect(() => {
    if (pointsEarnedFromOrder > 0 && loyaltyData && !pointsShownRef.current) {
      pointsShownRef.current = true
      const cheapestItemCost = 0 // se podría calcular desde storeItems, omitido por simplicidad
      const progress = cheapestItemCost > 0
        ? (loyaltyData.points / cheapestItemCost) * 100
        : 50
      playNotification()
      if (navigator.vibrate) navigator.vibrate([50, 30, 50])
      toast(
        <PointsEarnedToast
          pointsEarned={pointsEarnedFromOrder}
          totalPoints={loyaltyData.points}
          progressToNext={progress}
          clubName={clubName}
        />,
        { duration: 5000 }
      )
    }
  }, [pointsEarnedFromOrder, loyaltyData, clubName, playNotification])

  // B9: Countdown 2:30 tras bambalina — cuando llega a cero, toast informativo
  // Solo se ejecuta cuando el pedido está confirmado, sin modificar estados reales
  const [cancellationToastShown, setCancellationToastShown] = useState(false)
  useEffect(() => {
    if (status !== 'confirmed' || cancellationToastShown) return
    const timer = setTimeout(() => {
      toast(
        <StatusNotificationCard
          icon="🔒"
          iconBg="#e11d48"
          title="Tu pedido ya entró en preparación"
          description="A partir de este momento ya no puede cancelarse"
        />,
        { duration: 5000, position: 'top-center' }
      )
      setCancellationToastShown(true)
    }, 2 * 60 * 1000 + 30 * 1000) // 2:30 min
    return () => clearTimeout(timer)
  }, [status, cancellationToastShown])

  // P5: Mensajes rotativos durante "preparing"
  useEffect(() => {
    if (status !== 'preparing') return
    const interval = setInterval(() => {
      setMsgIndex(i => (i + 1) % PREPARING_MESSAGES.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [status])

  const info = STATUS_INFO[status] ?? STATUS_INFO['pending']
  const currentStep = STATUS_STEPS.indexOf(status)
  const isCancelled = status === 'cancelled'

  return (
    <div>
      <Confetti ref={confettiRef} className="fixed top-0 left-0 z-50 pointer-events-none size-full" />

      {/* Badge de pedido programado */}
      {isScheduledPending && scheduledPickupAt && (
        <div className="mb-6 flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-zinc-100 w-fit mx-auto">
          <Calendar size={14} className="text-zinc-600" />
          <span className="text-xs font-semibold text-zinc-700">Pedido programado</span>
        </div>
      )}

      {/* Status principal */}
      <div className="text-center mb-10">
        {isScheduledPending ? (
          <>
            <div className="text-6xl mb-4">📅</div>
            <h1 className="text-2xl font-black mb-2">Pedido programado</h1>
            {scheduledPickupAt && (
              <p className="text-sm opacity-60 mb-3">
                {formatScheduledDate(scheduledPickupAt)}
              </p>
            )}
            {scheduleCountdown && (
              <p className="text-sm font-semibold" style={{ color: primaryColor }}>
                ⏱ {scheduleCountdown}
              </p>
            )}
            <p className="mt-3 text-xs opacity-40">
              Tu pedido comenzará a prepararse cerca de la hora programada
            </p>
          </>
        ) : (
          <>
            <div key={status} className="animate-[scale-in_0.4s_ease-out]">
              <div className={`
                text-6xl mb-4
                ${status === 'ready' ? 'animate-bounce' : ''}
                ${status === 'preparing' ? 'animate-[wiggle_3s_ease-in-out_infinite]' : ''}
                ${status === 'confirmed' ? '' : ''}
              `}>
                {status === 'confirmed' ? (
                  <svg className="w-16 h-16 mx-auto" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="11" stroke="#10b981" strokeWidth={2} />
                    <path
                      d="M7 12l3 3 7-7"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ strokeDasharray: 50, strokeDashoffset: 50 }}
                      className="animate-[draw-check_0.5s_ease-out_forwards]"
                    />
                  </svg>
                ) : (
                  info.emoji
                )}
              </div>
              <h1 className="text-2xl font-black mb-2">{info.label}</h1>
              <p
                key={status === 'preparing' ? msgIndex : 'desc'}
                className="text-sm opacity-60 animate-[message-enter_0.35s_ease-out]"
              >
                {status === 'preparing' ? PREPARING_MESSAGES[msgIndex] : info.description}
              </p>
            </div>
          </>
        )}

        {/* Tiempo estimado */}
        {effectiveEstimatedReadyAt && ['confirmed', 'preparing'].includes(status) && (
          <p className="mt-3 text-sm font-semibold" style={{ color: primaryColor }}>
            ⏱ Listo {countdown}
          </p>
        )}

        {/* Indicador de actualización en vivo */}
        {!['delivered', 'cancelled'].includes(status) && lastChecked && (
          <p className="mt-2 text-xs opacity-30 flex items-center justify-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
            <span>Actualiza automáticamente · última vez {lastChecked.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
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
                  className="w-4 h-4 rounded-full transition-all duration-500 flex items-center justify-center relative"
                  style={{
                    backgroundColor: index <= currentStep ? primaryColor : primaryColor + '25',
                    boxShadow: index === currentStep ? `0 0 0 4px ${primaryColor}30` : 'none',
                  }}
                >
                  {index === currentStep && (
                    <span
                      className="absolute inset-0 rounded-full animate-[halo-expand_2.5s_ease-out_infinite]"
                      style={{ boxShadow: `0 0 0 0 ${primaryColor}60` }}
                    />
                  )}
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

      {/* Mensaje de cancelación cerrada */}
      {cancellationClosed && (
        <div className="mb-8 rounded-2xl p-5 border"
          style={{ backgroundColor: primaryColor + '08', borderColor: primaryColor + '25' }}>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
              style={{ backgroundColor: primaryColor + '15' }}>
              <Lock size={16} style={{ color: primaryColor }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm" style={{ color: textColor }}>
                Ventana de cancelación cerrada
              </p>
              <p className="text-xs mt-1 leading-relaxed" style={{ opacity: 0.6 }}>
                Tu pedido ya está en preparación y no puede ser cancelado.
                Si necesitás asistencia, contactá al restaurante directamente.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* CTA: confirmar retiro (takeaway) o código delivery */}
      {status === 'ready' && orderMode !== 'delivery' && (
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
            onConfirmed={() => setStatus('delivered')}
          />
        </div>
      )}

      {/* Delivery code display */}
      {status === 'ready' && orderMode === 'delivery' && deliveryCode && (
        <DeliveryCodeDisplay
          code={deliveryCode}
          primaryColor={primaryColor}
          backgroundColor={backgroundColor}
          textColor={textColor}
          orderMode={orderMode}
        />
      )}

      {/* Delivery address info */}
      {orderMode === 'delivery' && deliveryAddress && (
        <div className="mb-4 rounded-2xl p-4"
          style={{ backgroundColor: primaryColor + '08', border: `1px solid ${primaryColor}20` }}>
          <p className="text-xs opacity-50 uppercase tracking-widest font-bold mb-1">Dirección de entrega</p>
          <p className="text-sm font-semibold">
            {deliveryAddress.street} {deliveryAddress.number}
            {deliveryAddress.apt ? `, ${deliveryAddress.apt}` : ''}
            {deliveryAddress.city ? `, ${deliveryAddress.city}` : ''}
          </p>
        </div>
      )}

      {/* Delivery en ruta */}
      {status === 'en_ruta' && orderMode === 'delivery' && (
        <div className="mb-8 rounded-2xl p-5"
          style={{ backgroundColor: primaryColor + '10', border: `2px solid ${primaryColor}40` }}>
          <div className="text-center">
            <div className="text-5xl mb-3 animate-bounce">🚗</div>
            <p className="font-bold text-lg mb-1">Delivery en camino</p>
            {deliveryPersonName && (
              <p className="text-sm opacity-70">{deliveryPersonName} está yendo a tu domicilio</p>
            )}
            {deliveryCode && (
              <div className="mt-4">
                <p className="text-xs opacity-50 mb-2">Código de entrega (mostralo al delivery)</p>
                <div className="inline-block px-6 py-3 rounded-2xl bg-white text-3xl font-black tracking-widest shadow-sm"
                  style={{ color: primaryColor }}>
                  {deliveryCode}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delivery arrived */}
      {status === 'arrived' && orderMode === 'delivery' && (
        <div className="mb-8 rounded-2xl p-5"
          style={{ backgroundColor: primaryColor + '10', border: `2px solid ${primaryColor}40` }}>
          <div className="text-center">
            <div className="text-5xl mb-3">📍</div>
            <p className="font-bold text-lg mb-1">Delivery llegó</p>
            <p className="text-sm opacity-70 mb-4">El delivery está en tu domicilio</p>
            {deliveryCode && (
              <div>
                <p className="text-xs opacity-50 mb-2">Entregale este código al delivery</p>
                <div className="inline-block px-6 py-3 rounded-2xl bg-white text-3xl font-black tracking-widest shadow-sm"
                  style={{ color: primaryColor }}>
                  {deliveryCode}
                </div>
              </div>
            )}
          </div>
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
          {orderMode === 'business' ? (
            <a
              href={`/${tenantSlug}/business/corp`}
              className="block w-full text-center py-4 rounded-2xl font-bold text-base"
              style={{ backgroundColor: primaryColor, color: backgroundColor }}>
              Volver al portal corporativo
            </a>
          ) : (
            <a
              href={`/${tenantSlug}/menu/${locationId}/takeaway`}
              className="block w-full text-center py-4 rounded-2xl font-bold text-base"
              style={{ backgroundColor: primaryColor, color: backgroundColor }}>
              Volver al menú
            </a>
          )}
          {hasRewardItems && loyaltyData && (
            <a
              href={`/app/profile/club/${tenantSlug}`}
              className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl font-bold text-base border-2 transition-opacity hover:opacity-80"
              style={{ borderColor: primaryColor, color: primaryColor }}>
              <Star size={16} className="fill-current" />
              Ver mis canjes
            </a>
          )}
        </div>
      )}
      
      {/* Estrategia B: Share-to-Earn (UGC) */}
      {loyaltyDiscountAmount > 0 && status !== 'cancelled' && (
        <div className="mb-8">
          <LoyaltySharePrompt 
            tenantName={tenantName}
            clubName={clubName}
            discountAmount={loyaltyDiscountAmount}
            pointsUsed={loyaltyPointsUsed}
          />
        </div>
      )}


      {/* SECCIÓN LOYALTY PARA INVITADOS/MIEMBROS */}
      {loyaltyData && (
        <div className="mt-12 pt-8 border-t border-zinc-100">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
              <Star size={16} className="text-amber-600 fill-amber-600" />
            </div>
            <h3 className="font-black text-lg">Tu Club de Puntos</h3>
          </div>
          
          <div className="bg-white rounded-3xl p-6 border-2 border-amber-100 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <Sparkles size={80} className="text-amber-600" />
            </div>
            
            <p className="text-sm text-zinc-600 mb-6 leading-relaxed">
              ¡Hola <span className="font-bold text-zinc-900">{loyaltyData.name}</span>! Ya sos parte del club. 
              Guardá tu tarjeta para no perder tus puntos y recibir beneficios.
            </p>

            <AddToWalletButtons
              tenantSlug={tenantSlug}
              memberId={loyaltyData.memberId}
              publicId={loyaltyData.publicId}
              points={loyaltyData.points}
              tier={loyaltyData.tier}
            />
          </div>
        </div>
      )}
    </div>
  )
}
