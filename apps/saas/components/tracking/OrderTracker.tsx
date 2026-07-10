'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import ConfirmPickupButton from './ConfirmPickupButton'
import DeliveryCodeDisplay from './DeliveryCodeDisplay'
import LiveTrackingBadge from './LiveTrackingBadge'
import { Calendar, Lock, Copy, Check, Banknote, Loader2 } from 'lucide-react'
import LoyaltySharePrompt from '@/components/menu/LoyaltySharePrompt'
import { useNotificationSound } from '@/hooks/useNotificationSound'
import { toast } from 'sonner'
import { StatusNotificationCard } from './StatusNotificationCard'
import PointsEarnedToast from '@/components/rewards/PointsEarnedToast'
import PostDeliveryCelebration from './PostDeliveryCelebration'
import { Confetti, type ConfettiRef } from '@/registry/magicui/confetti'

const STATUS_STEPS = ['awaiting_payment', 'awaiting_confirmation', 'pending', 'confirmed', 'preparing', 'ready', 'en_ruta', 'arrived', 'delivered']

const STATUS_INFO: Record<string, { label: string; description: string; emoji: string; pulse?: boolean }> = {
  awaiting_payment: { label: 'Esperando pago', description: 'Completá el pago para confirmar tu pedido', emoji: '💳' },
  awaiting_confirmation: { label: 'Esperando confirmación', description: 'El local está verificando tu pago', emoji: '⏳', pulse: true },
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
  // ── Transferencia ─────────────────────────────────────────────────
  initialPaymentMethod?: string
  initialBaseTotal?: number
  initialSurchargePercent?: number
  initialSurchargeAmount?: number
  initialTransferConfirmed?: boolean
  initialCustomerName?: string
  initialWhatsAppPhone?: string | null
  initialTransferData?: {
    alias: string | null
    cbu: string | null
    cvu: string | null
  } | null
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

function buildWhatsAppLink(phone: string, opts: {
  customerName: string
  orderNumber: string
  amount: number
  orderMode?: string
  deliveryAddress?: { street: string; number: string; apt?: string; city: string }
  trackingUrl: string
}): string {
  const { customerName, orderNumber, amount, orderMode, deliveryAddress, trackingUrl } = opts
  const cleanPhone = phone.replace(/[^\d]/g, '')

  const modeLabel = orderMode === 'delivery' ? '🚚 DELIVERY' : '🥡 TAKE AWAY'

  let msg = `Hola soy ${customerName} y tengo el pedido #${orderNumber}.
Te envío el comprobante de pago por $${amount.toLocaleString('es-AR')}.

${modeLabel}`

  if (orderMode === 'delivery' && deliveryAddress) {
    const addr = deliveryAddress
    msg += `\nDirección: ${addr.street} ${addr.number}${addr.apt ? `, ${addr.apt}` : ''}, ${addr.city}`
  }

  msg += `\n\nPodes hacer el seguimiento de tu pedido:\n${trackingUrl}`

  return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`
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
  rewardAdvanceApplied = false,
  rewardAdvanceConsolidated = false,
  pointsEarnedFromOrder = 0,
  tenantName,
  clubName,
  orderMode,
  deliveryAddress,
  initialPaymentMethod,
  initialBaseTotal,
  initialSurchargePercent,
  initialSurchargeAmount,
  initialTransferConfirmed,
  initialCustomerName = '',
  initialWhatsAppPhone,
  initialTransferData,
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
  // ── Transferencia (cache local que se actualiza vía polling) ──────
  const [paymentMethod, setPaymentMethod] = useState(initialPaymentMethod || 'mercadopago')
  const [baseTotal, setBaseTotal] = useState(initialBaseTotal || 0)
  const [surchargePercent, setSurchargePercent] = useState(initialSurchargePercent || 0)
  const [surchargeAmount, setSurchargeAmount] = useState(initialSurchargeAmount || 0)
  const [transferConfirmed, setTransferConfirmed] = useState(initialTransferConfirmed || false)
  const [transferData, setTransferData] = useState(initialTransferData || null)
  const [whatsAppPhone] = useState(initialWhatsAppPhone || null)
  const [confirmTransferLoading, setConfirmTransferLoading] = useState(false)

  const whatsAppLink = whatsAppPhone && paymentMethod === 'transfer'
    ? buildWhatsAppLink(whatsAppPhone, {
        customerName: initialCustomerName,
        orderNumber,
        amount: baseTotal || 0,
        orderMode,
        deliveryAddress,
        trackingUrl: typeof window !== 'undefined'
          ? `${window.location.origin}/${tenantSlug}/tracking/${orderNumber}`
          : '',
      })
    : null
  const [copiedField, setCopiedField] = useState<string | null>(null)
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
      if (data.payment) {
        setPaymentMethod(data.payment.method || 'mercadopago')
        setBaseTotal(data.payment.baseTotal || 0)
        setSurchargePercent(data.payment.surchargePercent || 0)
        setSurchargeAmount(data.payment.surchargeAmount || 0)
        setTransferConfirmed(data.payment.transferConfirmed || false)
      }
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
                  {index === currentStep && info.pulse && (
                    <>
                      <span
                        className="absolute inset-0 rounded-full animate-[pulse-ring_1.5s_cubic-bezier(0.24,0,0.38,1)_infinite]"
                        style={{ boxShadow: `0 0 0 0 ${primaryColor}60` }}
                      />
                      <span
                        className="absolute inset-0 rounded-full animate-[pulse-ring_1.5s_cubic-bezier(0.24,0,0.38,1)_infinite]"
                        style={{ boxShadow: `0 0 0 0 ${primaryColor}60`, animationDelay: '0.75s' }}
                      />
                    </>
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

      {/* ── TRANSFERENCIA: awaiting_payment — mostrar datos bancarios + botón confirmar ── */}
      {paymentMethod === 'transfer' && status === 'awaiting_payment' && transferData && (
        <div className="mb-8 rounded-2xl border-2 border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Banknote size={20} className="text-blue-700" />
            <h3 className="font-bold text-base text-blue-900">Datos para transferir</h3>
          </div>

          {transferData.alias && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Alias</p>
              <div className="flex items-center justify-between bg-white rounded-xl px-3 py-2.5 border border-blue-200">
                <span className="text-sm font-mono font-bold text-zinc-900">{transferData.alias}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(transferData.alias!)
                    setCopiedField('alias')
                    setTimeout(() => setCopiedField(null), 2000)
                  }}
                  className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 hover:bg-blue-200 transition-colors"
                >
                  {copiedField === 'alias' ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          )}

          {(transferData.cbu || transferData.cvu) && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                {transferData.cbu && transferData.cvu ? 'CBU / CVU' : transferData.cbu ? 'CBU' : 'CVU'}
              </p>
              <div className="flex items-center justify-between bg-white rounded-xl px-3 py-2.5 border border-blue-200">
                <span className="text-sm font-mono font-bold text-zinc-900">{transferData.cbu || transferData.cvu}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(transferData.cbu || transferData.cvu!)
                    setCopiedField('cbu')
                    setTimeout(() => setCopiedField(null), 2000)
                  }}
                  className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 hover:bg-blue-200 transition-colors"
                >
                  {copiedField === 'cbu' ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          )}

          <div className="rounded-xl bg-amber-50 border-2 border-amber-200 p-4 space-y-2">
            <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
              <span>⚠️</span>
              Antes de continuar, seguí estos pasos:
            </p>
            <div className="space-y-1.5 text-xs text-amber-800">
              <p className="flex items-start gap-2">
                <span className="font-bold bg-amber-200 text-amber-900 w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px]">1</span>
                <span>Hacé la transferencia por <strong>${(baseTotal || 0).toLocaleString('es-AR')}</strong> desde tu banco usando el <strong>Alias</strong> o <strong>CBU</strong> de arriba.</span>
              </p>
              <p className="flex items-start gap-2">
                <span className="font-bold bg-amber-200 text-amber-900 w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px]">2</span>
                <span>Tocá el botón de abajo para enviarnos el comprobante por WhatsApp y confirmar el pago.</span>
              </p>
            </div>
          </div>

          <button
            onClick={async () => {
              if (whatsAppLink) {
                window.open(whatsAppLink, '_blank')
              }
              setConfirmTransferLoading(true)
              try {
                const res = await fetch(`/api/${tenantSlug}/orders/${orderId}/confirm-transfer-client`, { method: 'PATCH' })
                if (!res.ok) {
                  const err = await res.json()
                  throw new Error(err.error || 'Error')
                }
                setStatus('awaiting_confirmation')
              } catch (err: any) {
                toast.error(err.message || 'Error al confirmar la transferencia')
              } finally {
                setConfirmTransferLoading(false)
              }
            }}
            disabled={confirmTransferLoading}
            className="w-full py-4 rounded-2xl font-bold text-base text-white disabled:opacity-50 transition-all active:scale-[0.98]"
            style={{ backgroundColor: '#059669' }}
          >
            {confirmTransferLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" /> Confirmando...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Enviar comprobante y confirmar pago
              </span>
            )}
          </button>
        </div>
      )}

      {/* ── TRANSFERENCIA: awaiting_confirmation — card llamativa ── */}
      {paymentMethod === 'transfer' && status === 'awaiting_confirmation' && (
        <div className="mb-8 rounded-2xl border-2 border-blue-400 bg-gradient-to-br from-blue-600 to-indigo-700 p-6 shadow-xl text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.2),transparent_70%)]" />
          </div>
          <div className="relative z-10 text-center">
            <div className="text-5xl mb-4 animate-pulse">⏳</div>
            <h2 className="text-xl font-black mb-2">Esperando confirmación</h2>
            <p className="text-blue-100 text-sm mb-4">
              El local está verificando tu pago por transferencia. Te notificaremos cuando esté confirmado.
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 text-sm font-semibold">
              <span className="w-2 h-2 rounded-full bg-green-300 animate-pulse" />
              Transferencia reportada
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
            customerName={initialCustomerName}
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

      {/* Post-delivery celebration */}
      {status === 'delivered' && (
        <PostDeliveryCelebration
          customerName={initialCustomerName}
          tenantName={tenantName}
          tenantSlug={tenantSlug}
          orderNumber={orderNumber}
          locationId={locationId}
          orderId={orderId}
          ratingToken={ratingToken}
          primaryColor={primaryColor}
          backgroundColor={backgroundColor}
        />
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

    </div>
  )
}
