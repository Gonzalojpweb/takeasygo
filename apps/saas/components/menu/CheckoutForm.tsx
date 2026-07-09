'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Plus, Minus, Trash2, Star, Clock, Percent, X, Gift, Wallet, AlertTriangle, Copy, Check, Banknote } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'
import LocationBar from '@/components/menu/LocationBar'
import { motion, AnimatePresence } from 'framer-motion'
import { terminos, privacidad } from '@/lib/legal-content'
import { cn } from '@/lib/utils'
import type { CartItem } from '@/types/cart'
import SchedulePicker from './SchedulePicker'
import { FeedbackProvider, useFeedback } from '@/components/feedback/FeedbackContext'
import FeedbackModal from '@/components/feedback/FeedbackModal'
import { captureCheckoutStarted, captureRewardRedeemed, captureRewardAdvanceOffered, captureRewardAdvanceAccepted } from '@/lib/tia/events'

interface Props {
  tenantSlug: string
  locationId: string
  mode: 'takeaway' | 'dine-in' | 'business' | 'delivery'
}

interface LoyaltyConfig {
  enabled: boolean
  clubName: string
  welcomeMessage: string
  sosLimit?: number
  sosMaxLimit?: number
  pointsConfig?: {
    pointsRedemptionValue: number
    redemptionEnabled: boolean
  }
}

interface StoreItem {
  _id: string
  name: string
  description: string
  imageUrl: string
  pointsCost: number
  stock?: number | null
  isActive: boolean
}

interface ScheduledOrdersConfig {
  enabled: boolean
  minAdvanceMinutes: number
  maxAdvanceHours: number
}

export default function CheckoutForm({ tenantSlug, locationId, mode }: Props) {
  return (
    <FeedbackProvider tenantSlug={tenantSlug}>
      <CheckoutFormInner tenantSlug={tenantSlug} locationId={locationId} mode={mode} />
      <FeedbackModal tenantSlug={tenantSlug} />
    </FeedbackProvider>
  )
}

function CheckoutFormInner({ tenantSlug, locationId, mode }: Props) {
  const router = useRouter()
  const { data: session } = useSession()
  const feedback = useFeedback()
  const [cart, setCart] = useState<CartItem[]>([])
  const [upsellHints, setUpsellHints] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '', birthDate: '', notes: '', countryCode: '+54' })
  const [activeOrderNumber, setActiveOrderNumber] = useState<string | null>(null)
  const [activeQrPromo, setActiveQrPromo] = useState<{ discountPercentage: number; checkoutDiscountLabel?: string; promoSlug?: string; source?: string } | null>(null)
  const [loyaltyMember, setLoyaltyMember] = useState<any | null>(null)
  const [walletEnabled, setWalletEnabled] = useState(false)
  const [pointsLookupLoading, setPointsLookupLoading] = useState(false)
  const [storeItems, setStoreItems] = useState<StoreItem[]>([])

  const [businessInfo, setBusinessInfo] = useState<{
    corporateAccountId: string
    role: string
    paymentMode: string
  } | null>(null)
  const [selectedRewardItemId, setSelectedRewardItemId] = useState<string | null>(null)
  const [rewardItemLoading, setRewardItemLoading] = useState(false)

  useEffect(() => {
    const stored = sessionStorage.getItem('tgo-active-qr-promo')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (parsed.tenantSlug === tenantSlug && parsed.discountPercentage > 0) {
          setActiveQrPromo({
            discountPercentage: parsed.discountPercentage,
            checkoutDiscountLabel: parsed.checkoutDiscountLabel,
            promoSlug: parsed.promoSlug,
            source: parsed.source,
          })
        }
      } catch (e) {
        console.error('Error parsing QR promo:', e)
      }
    }
  }, [tenantSlug])
  const [loyaltyConfig, setLoyaltyConfig] = useState<LoyaltyConfig | null>(null)
  const [joinClub, setJoinClub] = useState(false)
  const [scheduledOrdersConfig, setScheduledOrdersConfig] = useState<ScheduledOrdersConfig | null>(null)
  const [scheduleOrder, setScheduleOrder] = useState(false)
  const [scheduledPickupAt, setScheduledPickupAt] = useState<string | null>(null)
  const [activeLegalModal, setActiveLegalModal] = useState<'terminos' | 'privacidad' | null>(null)
  const [redirectingToMp, setRedirectingToMp] = useState(false)
  const [kriptonEnabled, setKriptonEnabled] = useState(false)
  const [transferEnabled, setTransferEnabled] = useState(false)
  const [transferData, setTransferData] = useState<{ alias: string | null; cbu: string | null; cvu: string | null; bankName: string | null; holderName: string | null } | null>(null)
  const [paymentSurcharges, setPaymentSurcharges] = useState<Record<string, number>>({})
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'mercadopago' | 'kripton' | 'transfer'>('mercadopago')
  const [copiedField, setCopiedField] = useState<string | null>(null)

  // ── Estimated time + Delay announcement ──────────────────────────
  const [estimatedTimeInfo, setEstimatedTimeInfo] = useState<{
    baseTime: number
    delayAnnouncement: Record<string, { enabled: boolean; extraMinutes: number; message: string } | undefined>
  } | null>(null)

  // ── Delivery state ────────────────────────────────────────────────────
  const [deliveryMode, setDeliveryMode] = useState(mode === 'delivery')

  const currentMode = deliveryMode ? 'delivery' : mode
  const modeDelay = estimatedTimeInfo?.delayAnnouncement?.[currentMode]
  const delayEnabled = modeDelay?.enabled ?? false
  const extraMinutes = modeDelay?.extraMinutes ?? 0
  const delayMessage = modeDelay?.message ?? ''
  const effectiveTime = (estimatedTimeInfo?.baseTime ?? 0) + (delayEnabled ? extraMinutes : 0)
  const [deliveryAddress, setDeliveryAddress] = useState({ street: '', number: '', apt: '', city: '' })
  const [deliveryQuote, setDeliveryQuote] = useState<{
    loading: boolean
    cost: number
    distance: number
    withinRange: boolean
    error: string | null
  }>({ loading: false, cost: 0, distance: 0, withinRange: false, error: null })
  const [deliveryConfirmed, setDeliveryConfirmed] = useState(false)

  // Reset delivery quote when address changes
  useEffect(() => {
    if (deliveryQuote.cost > 0 || deliveryQuote.error) {
      setDeliveryQuote({ loading: false, cost: 0, distance: 0, withinRange: false, error: null })
      setDeliveryConfirmed(false)
    }
  }, [deliveryAddress])

  useEffect(() => {
    const saved = sessionStorage.getItem('cart')
    if (!saved) {
      router.back()
      return
    }
    const parsedCart = JSON.parse(saved)
    const cartWithType = parsedCart.map((item: any) => ({
      ...item,
      type: item.type || (item.promotionId ? 'promotion' : 'menuItem'),
    }))
    setCart(cartWithType)

    const hints = sessionStorage.getItem('upsellHints')
    if (hints) {
      setUpsellHints(JSON.parse(hints))
      sessionStorage.removeItem('upsellHints')
    }

    if (mode === 'business') {
      const corporateAccountId = sessionStorage.getItem('businessCorporateAccountId')
      const role = sessionStorage.getItem('businessRole')
      const paymentMode = sessionStorage.getItem('businessPaymentMode')
      if (corporateAccountId) {
        setBusinessInfo({ corporateAccountId, role: role ?? 'employee', paymentMode: paymentMode ?? 'cash_mp' })
      }
    }

    fetch(`/api/${tenantSlug}/loyalty/settings`)
      .then(r => r.json())
      .then(data => {
        if (data.loyalty?.enabled) {
          setLoyaltyConfig({
            ...data.loyalty,
            pointsConfig: data.pointsConfig
          })
        }
      })
      .catch(() => {})

    fetch(`/api/${tenantSlug}/locations/${locationId}`)
      .then(r => r.json())
      .then(data => {
        if (data.location) {
          setScheduledOrdersConfig(data.location.scheduledOrdersConfig || null)
          const settings = data.location.settings || {}
          setEstimatedTimeInfo({
            baseTime: settings.estimatedPickupTime ?? 20,
            delayAnnouncement: settings.delayAnnouncement ?? {},
          })
        } else {
          setScheduledOrdersConfig(null)
        }
      })
      .catch(() => {
        setScheduledOrdersConfig(null)
      })

    fetch(`/api/${tenantSlug}/kripton/status`)
      .then(r => r.json())
      .then(data => {
        if (data?.enabled) {
          setKriptonEnabled(true)
        }
      })
      .catch(() => {})

    fetch(`/api/${tenantSlug}/payment-methods`)
      .then(r => r.json())
      .then(data => {
        if (data?.error) {
          console.error('payment-methods API error:', data.error)
          return
        }
        if (!data?.methods) {
          console.error('payment-methods API: no methods in response', data)
          return
        }
        const surcharges: Record<string, number> = {}
        for (const m of data.methods) {
          surcharges[m.id] = m.surchargePercent || 0
        }
        setPaymentSurcharges(surcharges)

        const mpAvailable = data.methods.find((m: any) => m.id === 'mercadopago')?.enabled
        const krAvailable = data.methods.find((m: any) => m.id === 'kripton')?.enabled
        const trAvailable = data.methods.find((m: any) => m.id === 'transfer')?.enabled

        if (krAvailable) {
          setKriptonEnabled(true)
        }
        if (trAvailable) {
          setTransferEnabled(true)
          setTransferData(data.transfer)
        }
        if (!mpAvailable && !krAvailable && trAvailable) {
          setSelectedPaymentMethod('transfer')
        } else if (!mpAvailable && krAvailable) {
          setSelectedPaymentMethod('kripton')
        }
      })
      .catch((err) => {
        console.error('payment-methods fetch error:', err)
      })
  }, [])
  
  // Auto-fill from session and lookup loyalty by email
  useEffect(() => {
    const name = session?.user?.name
    const email = session?.user?.email
    if (email) {
      setForm(p => ({ 
        ...p, 
        email: email || p.email, 
        name: p.name || name || email.split('@')[0] || '' 
      }))
      
      // Intentar buscar miembro por email si el club está habilitado
      fetch(`/api/${tenantSlug}/loyalty/lookup?email=${encodeURIComponent(email)}`)
        .then(r => r.json())
        .then(data => {
          if (data.member) {
            setLoyaltyMember(data.member)
            setWalletEnabled(data.wallet?.enabled ?? false)
            // Si tiene teléfono guardado en el miembro, actualizar el form para que lookup por phone también de match
            if (data.member.phone) {
              const digits = data.member.phone.replace(/\D/g, '')
              setForm(p => ({ ...p, phone: digits.length > 10 ? digits.slice(-10) : digits }))
            }
          }
        })
        .catch(() => {})
    }
  }, [session, tenantSlug])

  // Lookup loyalty member when phone changes
  useEffect(() => {
    if (form.phone.length < 8) {
      setLoyaltyMember(null)
      return
    }

    const timer = setTimeout(async () => {
      setPointsLookupLoading(true)
      try {
        const fullPhone = `${form.countryCode}${form.phone}`
        const res = await fetch(`/api/${tenantSlug}/loyalty/lookup?phone=${encodeURIComponent(fullPhone)}`)
        const data = await res.json()
        if (res.ok && data.member) {
          setLoyaltyMember(data.member)
          setWalletEnabled(data.wallet?.enabled ?? false)
        } else {
          setLoyaltyMember(null)
          setWalletEnabled(false)
        }
      } catch (err) {
        console.error('Loyalty lookup error', err)
      } finally {
        setPointsLookupLoading(false)
      }
    }, 1000)

    return () => clearTimeout(timer)
  }, [form.phone, form.countryCode, tenantSlug])

  // Cargar items del store disponibles para canje cuando hay miembro del club
  useEffect(() => {
    if (!loyaltyMember || !loyaltyConfig?.enabled) {
      setStoreItems([])
      setSelectedRewardItemId(null)
      return
    }
    setRewardItemLoading(true)
    fetch(`/api/${tenantSlug}/store/items?isActive=true`)
      .then(r => r.json())
      .then(data => {
        if (data.items) setStoreItems(data.items)
      })
      .catch(() => {})
      .finally(() => setRewardItemLoading(false))
  }, [loyaltyMember, tenantSlug, loyaltyConfig?.enabled])

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const qrEligibleSubtotal = cart
    .filter(i => i.type !== 'promotion')
    .reduce((sum, i) => sum + i.price * i.quantity, 0)
  const discountAmount = activeQrPromo ? Math.round(qrEligibleSubtotal * (activeQrPromo.discountPercentage / 100)) : 0

  // Calcular si el reward seleccionado necesita SOS
  const selectedRewardItem = selectedRewardItemId
    ? storeItems.find(i => i._id === selectedRewardItemId) ?? null
    : null

  const rewardNeedsAdvance = selectedRewardItem && loyaltyMember
    ? loyaltyMember.points < selectedRewardItem.pointsCost
    : false

  const missingPoints = rewardNeedsAdvance
    ? (selectedRewardItem?.pointsCost ?? 0) - (loyaltyMember?.points ?? 0)
    : 0

  const effectiveAdvanceLimit = Math.min(
    loyaltyConfig?.sosLimit ?? 0,
    loyaltyConfig?.sosMaxLimit ?? 0
  )

  const canUseSos = rewardNeedsAdvance
    && effectiveAdvanceLimit > 0
    && missingPoints <= effectiveAdvanceLimit
    && !loyaltyMember?.hasAdvanceActive

  useEffect(() => {
    if (rewardNeedsAdvance && canUseSos && selectedRewardItem) {
      captureRewardAdvanceOffered(missingPoints, loyaltyMember?.points ?? 0)
    }
  }, [rewardNeedsAdvance, canUseSos, selectedRewardItem]) // eslint-disable-line react-hooks/exhaustive-deps

  function increaseQty(cartItemId: string) {
    setCart(prev => prev.map(i => i.cartItemId === cartItemId ? { ...i, quantity: i.quantity + 1 } : i))
  }

  function decreaseQty(cartItemId: string) {
    setCart(prev => {
      const item = prev.find(i => i.cartItemId === cartItemId)
      if (!item) return prev
      if (item.quantity === 1) return prev.filter(i => i.cartItemId !== cartItemId)
      return prev.map(i => i.cartItemId === cartItemId ? { ...i, quantity: i.quantity - 1 } : i)
    })
  }

  function removeItem(cartItemId: string) {
    setCart(prev => prev.filter(i => i.cartItemId !== cartItemId))
  }

  function addHintToCart(item: any) {
    const plainId = `${item._id}:plain`
    setCart(prev => {
      const existing = prev.find(i => i.cartItemId === plainId)
      if (existing) return prev.map(i => i.cartItemId === plainId ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, {
        cartItemId: plainId,
        menuItemId: item._id,
        name: item.name,
        basePrice: item.price,
        extraPrice: 0,
        price: item.price,
        quantity: 1,
        customizations: [],
        customizationSummary: '',
        addedFrom: 'checkout_banner' as const,
        type: 'menuItem',
        originalPrice: item.originalPrice,
        takeawayOriginalPrice: item.takeawayOriginalPrice,
      }]
    })
    setUpsellHints(prev => prev.filter(h => h._id !== item._id))
  }

  const deliveryCost = deliveryMode && deliveryQuote.withinRange ? deliveryQuote.cost : 0
  const baseTotal = Math.max(0, subtotal - discountAmount) + deliveryCost
  const activeSurchargePercent = paymentSurcharges[selectedPaymentMethod] ?? 0
  const total = selectedPaymentMethod === 'transfer'
    ? baseTotal
    : Math.round(baseTotal * (1 + activeSurchargePercent / 100))

async function handleSubmit(e: React.FormEvent) {
  e.preventDefault()
  if (!form.name.trim()) return toast.error('El nombre es obligatorio')
  if (joinClub && !form.phone.trim()) return toast.error('El teléfono es obligatorio para unirse al club')
  if (joinClub && !form.email.trim()) return toast.error('El email es obligatorio para unirse al club')
  if (joinClub && form.email.trim() && !/^[^\s@]+@[^\s@]+$/.test(form.email.trim())) return toast.error('Formato de email inválido')
  if (scheduleOrder && !scheduledPickupAt) return toast.error('Seleccioná una fecha y hora para retirar')
  setLoading(true)

    captureCheckoutStarted({ total, itemsCount: cart.length, orderMode: mode })

    let lastOrder: any = null

    try {
      const orderBody: Record<string, any> = {
        locationId,
        customer: {
          name: form.name,
          phone: form.phone ? `${form.countryCode} ${form.phone}` : '',
          email: form.email,
          ...(joinClub && form.birthDate && { birthDate: form.birthDate })
        },
        items: cart,
        mode: deliveryMode ? 'delivery' : mode,
        notes: form.notes,
        clientToken: localStorage.getItem('tgo-client-token') ?? undefined,
        joinClub: joinClub && loyaltyConfig?.enabled,
        qrPromoApplied: !!activeQrPromo,
        promoSlug: activeQrPromo?.promoSlug ?? undefined,
        ...(selectedRewardItemId && selectedRewardItem
          ? { rewardItems: [{ storeItemId: selectedRewardItemId }], loyaltyPointsRequired: selectedRewardItem.pointsCost }
          : {}),
        source: sessionStorage.getItem('tgo_attribution_source') || activeQrPromo?.source || undefined,
        ...(mode === 'business' && businessInfo ? {
          corporateAccountId: businessInfo.corporateAccountId,
          paymentModeSnapshot: businessInfo.paymentMode,
        } : {}),
        ...(deliveryMode ? {
          deliveryAddress: {
            street: deliveryAddress.street,
            number: deliveryAddress.number,
            apt: deliveryAddress.apt || '',
            city: deliveryAddress.city,
          },
          deliveryCost: deliveryQuote.cost,
        } : {}),
        paymentMethod: selectedPaymentMethod,
        baseTotal,
        surchargePercent: activeSurchargePercent,
      }

      // Delivery mode validation
      if (deliveryMode) {
        if (!deliveryAddress.street.trim()) {
          setLoading(false)
          return toast.error('Ingresá la calle de entrega')
        }
        if (!deliveryAddress.number.trim()) {
          setLoading(false)
          return toast.error('Ingresá el número')
        }
        if (!deliveryAddress.city.trim()) {
          setLoading(false)
          return toast.error('Ingresá la localidad')
        }
        if (!deliveryQuote.withinRange) {
          setLoading(false)
          return toast.error('Calculá el costo de envío antes de continuar')
        }
      }

      if (scheduleOrder && scheduledPickupAt) {
        orderBody.orderTiming = 'scheduled'
        orderBody.scheduledPickupAt = scheduledPickupAt
      }

      const orderRes = await fetch(`/api/${tenantSlug}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderBody),
      })

    if (orderRes.status === 409) {
      const data = await orderRes.json()
      setActiveOrderNumber(data.activeOrderNumber)
      setLoading(false)
      return
    }

    if (!orderRes.ok) {
      let errMsg = 'Error al crear el pedido'
      try {
        const errData = await orderRes.json()
        if (errData.error) errMsg = errData.error
      } catch {}
      throw new Error(errMsg)
    }
    const { order } = await orderRes.json()
    lastOrder = order

    if (rewardNeedsAdvance) {
      captureRewardAdvanceAccepted(missingPoints)
    }

    sessionStorage.removeItem('cart')

    // Transferencia: no redirigir a pasarela, mostrar datos bancarios en tracking
    if (selectedPaymentMethod === 'transfer') {
      router.push(`/${tenantSlug}/tracking/${order.orderNumber}`)
      return
    }

    // Business deferred: skip MP, show success directly
    const skipPayment = mode === 'business' && businessInfo?.paymentMode === 'deferred'

    if (skipPayment) {
      router.push(`/${tenantSlug}/tracking/${order.orderNumber}`)
      return
    }

    // 2. Crear preferencia de pago según método
    if (kriptonEnabled && selectedPaymentMethod === 'kripton') {
      const prefRes = await fetch(`/api/${tenantSlug}/payments/create-kripton-preference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order._id }),
      })
      if (!prefRes.ok) {
        const errData = await prefRes.json()
        throw new Error(errData.error || 'Error al crear el pago con Kripton')
      }
      const { url, method } = await prefRes.json()

      try {
        localStorage.setItem('tgo-pending-order', JSON.stringify({
          orderNumber: order.orderNumber,
          tenantSlug,
          orderId: order._id,
          createdAt: Date.now(),
        }))
      } catch {}

      setRedirectingToMp(true)
      setTimeout(() => {
        window.location.href = url
      }, 120)
    } else {
      const prefRes = await fetch(`/api/${tenantSlug}/payments/create-preference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order._id }),
      })
      if (!prefRes.ok) throw new Error('Error al crear el pago')
      const { sandboxInitPoint, initPoint } = await prefRes.json()

      const redirectUrl = process.env.NODE_ENV === 'development' ? sandboxInitPoint : initPoint

      try {
        localStorage.setItem('tgo-pending-order', JSON.stringify({
          orderNumber: order.orderNumber,
          tenantSlug,
          orderId: order._id,
          createdAt: Date.now(),
        }))
      } catch {}

      setRedirectingToMp(true)
      setTimeout(() => {
        window.location.href = redirectUrl
      }, 120)
    }

  } catch (err: any) {
    toast.error(err.message || 'Error al procesar el pedido')
    feedback.show({
      variant: 'checkout_error',
      metadata: { error: err.message },
      orderId: lastOrder?._id,
      locationId,
      clientHash: localStorage.getItem('tgo-client-token') ?? undefined,
    })
    setLoading(false)
  }
}

  // Bloqueo por pedido activo — se muestra en lugar del formulario después del intento
  if (activeOrderNumber) {
    return (
      <div className="bg-white min-h-screen">
        <header className="sticky top-0 bg-white border-b px-4 py-4 flex items-center gap-3">
          <button onClick={() => router.back()}>
            <ArrowLeft size={20} className="text-zinc-600" />
          </button>
          <h1 className="font-bold text-lg">Tu pedido</h1>
        </header>
        <div className="max-w-md mx-auto px-4 py-12 text-center space-y-5">
          <div className="text-5xl">🛍️</div>
          <h2 className="text-xl font-black">Tenés un pedido activo</h2>
          <p className="text-zinc-500 text-sm">
            Ya tenés un pedido en curso. Primero retirá ese pedido antes de hacer uno nuevo.
          </p>
          <a
            href={`/${tenantSlug}/tracking/${activeOrderNumber}`}
            className="block w-full py-4 rounded-2xl bg-zinc-900 text-white font-bold text-base"
          >
            Ver mi pedido #{activeOrderNumber}
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white">
      <header className="sticky top-0 bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()}>
          <ArrowLeft size={20} className="text-zinc-600" />
        </button>
        <h1 className="font-bold text-lg">Tu pedido</h1>
        <div className="ml-auto">
          <LocationBar tenantSlug={tenantSlug} locationId={locationId} />
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-6">
        {/* Resumen editable */}
        <div className="bg-zinc-50 rounded-2xl p-4 mb-6">
          <h2 className="font-semibold text-sm text-zinc-500 mb-3 uppercase tracking-wide">Resumen</h2>

          {cart.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-zinc-400 text-sm">Tu carrito está vacío.</p>
              <button
                type="button"
                onClick={() => router.back()}
                className="mt-3 text-sm font-bold text-zinc-700 underline underline-offset-2"
              >
                Volver al menú
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map((item: CartItem) => {
                const hasCustomizations = item.customizations.length > 0
                return (
                  <div key={item.cartItemId} className="flex items-start gap-3">
                    {/* Controles de cantidad */}
                    <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                      <button
                        type="button"
                        onClick={() => decreaseQty(item.cartItemId)}
                        className="w-7 h-7 rounded-full bg-zinc-200 flex items-center justify-center text-zinc-600 hover:bg-zinc-300 transition-colors"
                      >
                        {item.quantity === 1 ? <Trash2 size={12} /> : <Minus size={12} />}
                      </button>
                      <span className="text-sm font-bold w-4 text-center tabular-nums">{item.quantity}</span>
                      {/* + solo para ítems sin customizaciones (no se puede reabrir el modal aquí) */}
                      {!hasCustomizations ? (
                        <button
                          type="button"
                          onClick={() => increaseQty(item.cartItemId)}
                          className="w-7 h-7 rounded-full bg-zinc-900 flex items-center justify-center text-white hover:bg-zinc-700 transition-colors"
                        >
                          <Plus size={12} />
                        </button>
                      ) : (
                        <div className="w-7 h-7" /> /* placeholder para alinear */
                      )}
                    </div>

                    {/* Nombre e info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {item.type === 'promotion' && (
                          <span className="text-[9px] font-black uppercase tracking-wider px-1 py-0.5 rounded bg-blue-100 text-blue-700 leading-none">Promo</span>
                        )}
                        <p className="text-sm font-medium text-zinc-700 break-words">{item.name}</p>
                      </div>
                      {item.description && (
                        <p className="text-xs text-zinc-400 break-words mt-0.5">{item.description}</p>
                      )}
                      {(item as any)._promotionShortDescription && (
                        <p className="text-[10px] text-zinc-400 break-words italic mt-0.5">{(item as any)._promotionShortDescription}</p>
                      )}
                      {(item as any)._itemName && item.customizationSummary && (
                        <p className="text-xs text-zinc-400 break-words mt-0.5">{(item as any)._itemName} · {item.customizationSummary}</p>
                      )}
                      {!(item as any)._itemName && item.customizationSummary && (
                        <p className="text-xs text-zinc-400 break-words mt-0.5">{item.customizationSummary}</p>
                      )}
                      {!item.customizationSummary && item.selectedVariant && (
                        <p className="text-xs text-zinc-400 break-words mt-0.5">{item.selectedVariant.name}</p>
                      )}
                      {(item as any)._itemName && !item.customizationSummary && !item.selectedVariant && (
                        <p className="text-xs text-zinc-400 break-words mt-0.5">{(item as any)._itemName}</p>
                      )}
                    </div>

                    {/* Subtotal */}
                    <span className="text-sm font-semibold text-zinc-800 flex-shrink-0 pt-0.5">
                      ${(item.price * item.quantity).toLocaleString('es-AR')}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {selectedRewardItem && (
            <div className="mt-2 flex items-center justify-between py-2 px-3 bg-emerald-50 rounded-xl border border-emerald-200">
              <div className="flex items-center gap-2 min-w-0">
                {selectedRewardItem.imageUrl && (
                  <img src={selectedRewardItem.imageUrl} alt={selectedRewardItem.name} className="w-8 h-8 object-cover rounded-lg flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-emerald-800 truncate">{selectedRewardItem.name}</p>
                  <p className="text-[10px] text-emerald-600 font-medium">Canjeado con {selectedRewardItem.pointsCost} pts</p>
                </div>
              </div>
              <span className="text-sm font-bold text-emerald-700 flex-shrink-0">$0</span>
            </div>
          )}

          {cart.length > 0 && (
            <div className="border-t border-zinc-200 mt-4 pt-3 flex justify-between font-bold">
              <span>Total</span>
              <span>${total.toLocaleString('es-AR')}</span>
            </div>
          )}
        </div>

        {/* Estimated time + Delay announcement */}
        {estimatedTimeInfo && !scheduleOrder && (
          <div className={cn(
            'mb-6 rounded-2xl p-4 border transition-all',
            delayEnabled
              ? 'bg-amber-50 border-amber-200'
              : 'bg-zinc-50 border-zinc-100'
          )}>
            <div className="flex items-center gap-2">
              <Clock size={16} className={delayEnabled ? 'text-amber-600' : 'text-zinc-500'} />
              <span className={cn(
                'text-sm font-semibold',
                delayEnabled ? 'text-amber-900' : 'text-zinc-700'
              )}>
                ⏱ Listo en ~{effectiveTime} min
              </span>
            </div>
            {delayEnabled && (
              <div className="mt-2 space-y-1">
                <div className="flex items-start gap-2 text-xs text-amber-700">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  <span>
                    El restaurante está experimentando demoras
                    {delayMessage ? `: "${delayMessage}"` : ''}
                  </span>
                </div>
                <p className="text-[11px] text-amber-600 pl-5">
                  Tiempo estimado base: ~{estimatedTimeInfo.baseTime} min
                  {extraMinutes > 0 && (
                    <> · Demora informada: +{extraMinutes} min</>
                  )}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Pre-checkout upsell */}
        {upsellHints.length > 0 && (
          <div className="mb-6 rounded-2xl border border-zinc-100 overflow-hidden">
            <p className="px-4 py-2.5 text-xs font-bold text-zinc-400 uppercase tracking-widest bg-zinc-50">
              ¿Agregás algo más?
            </p>
            <div className="divide-y divide-zinc-100">
              {upsellHints.map(item => (
                <div key={item._id} className="flex items-center gap-3 px-4 py-3">
                  {item.imageUrl && (
                    <img src={item.imageUrl} alt={item.name} className="w-12 h-12 object-cover rounded-xl flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-700 truncate">{item.name}</p>
                    <p className="text-sm font-bold text-zinc-900">${item.price.toLocaleString('es-AR')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => addHintToCart(item)}
                    className="w-8 h-8 rounded-full bg-zinc-900 text-white flex items-center justify-center flex-shrink-0"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Selector de modo (solo cuando mode es takeaway o delivery) */}
        {(mode === 'takeaway' || mode === 'delivery') && (
          <div className="mb-6">
            <h2 className="font-semibold text-sm text-zinc-500 uppercase tracking-wide mb-3">Modalidad</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setDeliveryMode(false); setDeliveryQuote({ loading: false, cost: 0, distance: 0, withinRange: false, error: null }); setDeliveryConfirmed(false) }}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-semibold border-2 transition-all ${
                  !deliveryMode
                    ? 'border-zinc-900 bg-zinc-900 text-white'
                    : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400'
                }`}
              >
                🥡 Para llevar
              </button>
              <button
                type="button"
                onClick={() => setDeliveryMode(true)}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-semibold border-2 transition-all ${
                  deliveryMode
                    ? 'border-zinc-900 bg-zinc-900 text-white'
                    : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400'
                }`}
              >
                🚚 Delivery
              </button>
            </div>
          </div>
        )}

        {/* Formulario de dirección para delivery */}
        {deliveryMode && (
          <div className="mb-6 space-y-3">
            <h2 className="font-semibold text-sm text-zinc-500 uppercase tracking-wide">Dirección de entrega</h2>
            <div className="flex gap-2">
              <input
                required
                placeholder="Calle *"
                value={deliveryAddress.street}
                onChange={e => setDeliveryAddress(p => ({ ...p, street: e.target.value }))}
                className="flex-1 border border-zinc-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-zinc-400"
              />
              <input
                required
                placeholder="Número *"
                value={deliveryAddress.number}
                onChange={e => setDeliveryAddress(p => ({ ...p, number: e.target.value }))}
                className="w-24 border border-zinc-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-zinc-400"
              />
            </div>
            <input
              placeholder="Piso / Depto (opcional)"
              value={deliveryAddress.apt}
              onChange={e => setDeliveryAddress(p => ({ ...p, apt: e.target.value }))}
              className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-zinc-400"
            />
            <input
              required
              placeholder="Localidad *"
              value={deliveryAddress.city}
              onChange={e => setDeliveryAddress(p => ({ ...p, city: e.target.value }))}
              className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-zinc-400"
            />
            <button
              type="button"
              onClick={async () => {
                if (!deliveryAddress.street.trim() || !deliveryAddress.number.trim() || !deliveryAddress.city.trim()) {
                  return toast.error('Completá calle, número y localidad')
                }
                setDeliveryQuote(p => ({ ...p, loading: true, error: null }))
                try {
                  const res = await fetch(`/api/${tenantSlug}/delivery/quote`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      locationId,
                      address: {
                        street: deliveryAddress.street,
                        number: deliveryAddress.number,
                        apt: deliveryAddress.apt || '',
                        city: deliveryAddress.city,
                      },
                    }),
                  })
                  const data = await res.json()
                  if (!res.ok) {
                    setDeliveryQuote(p => ({ ...p, loading: false, error: data.error || 'Error al calcular' }))
                    return
                  }
                  if (!data.withinRange) {
                    setDeliveryQuote(p => ({ ...p, loading: false, error: data.error || 'Tu dirección está fuera del área de cobertura.' }))
                    return
                  }
                  setDeliveryQuote({
                    loading: false,
                    cost: data.cost,
                    distance: data.distance,
                    withinRange: true,
                    error: null,
                  })
                  setDeliveryConfirmed(true)
                  toast.success('Costo de envío calculado')
                } catch {
                  setDeliveryQuote(p => ({ ...p, loading: false, error: 'Error de conexión. Intentá de nuevo.' }))
                }
              }}
              disabled={deliveryQuote.loading}
              className="w-full py-3 px-4 rounded-xl bg-zinc-100 text-sm font-semibold text-zinc-700 hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              {deliveryQuote.loading ? 'Calculando...' : deliveryConfirmed ? '✅ Costo calculado' : 'Calcular costo de envío'}
            </button>

            {deliveryQuote.error && (
              <p className="text-sm text-red-500 flex items-center gap-1">
                <span className="text-base">⚠️</span> {deliveryQuote.error}
              </p>
            )}

            {deliveryConfirmed && deliveryQuote.withinRange && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                <p className="text-sm text-emerald-800 font-semibold flex items-center gap-2">
                  <span>🚚</span> Envío: <span className="text-base">${deliveryQuote.cost.toLocaleString('es-AR')}</span>
                  <span className="text-xs text-emerald-600 font-normal">({deliveryQuote.distance} km)</span>
                </p>
              </div>
            )}
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <h2 className="font-semibold text-sm text-zinc-500 uppercase tracking-wide">Tus datos</h2>

          <input
            required
            placeholder="Nombre *"
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-zinc-400"
          />
          <div className="flex gap-2">
            <select
              value={form.countryCode}
              onChange={e => setForm(p => ({ ...p, countryCode: e.target.value }))}
              className="w-[88px] border border-zinc-200 rounded-xl px-2 py-3 text-sm focus:outline-none focus:border-zinc-400 text-center"
            >
              <option value="+54">🇦🇷 +54</option>
              <option value="+598">🇺🇾 +598</option>
              <option value="+56">🇨🇱 +56</option>
              <option value="+55">🇧🇷 +55</option>
              <option value="+51">🇵🇪 +51</option>
              <option value="+52">🇲🇽 +52</option>
              <option value="+1">🇺🇸 +1</option>
              <option value="+34">🇪🇸 +34</option>
              <option value="+44">🇬🇧 +44</option>
              <option value="+49">🇩🇪 +49</option>
              <option value="+33">🇫🇷 +33</option>
              <option value="+39">🇮🇹 +39</option>
            </select>
            <input
              required={joinClub}
              placeholder={joinClub ? "Teléfono (obligatorio) *" : "Teléfono (opcional)"}
              type="tel"
              value={form.phone}
              onChange={e => setForm(p => ({ ...p, phone: e.target.value.replace(/\D/g, '') }))}
              className={cn(
                "flex-1 border rounded-xl px-4 py-3 text-base focus:outline-none transition-all",
                joinClub && !form.phone.trim() 
                  ? "border-amber-300 bg-amber-50/30 focus:border-amber-500" 
                  : "border-zinc-200 focus:border-zinc-400"
              )}
            />
          </div>
          {form.countryCode === '+54' && (
            <p className="text-[10px] text-zinc-400 mt-1 ml-1 font-medium italic">
              Ej: 11 6001 9734 (Sin el 0 ni el 9)
            </p>
          )}
          <input
            required={joinClub}
            placeholder={joinClub ? "Email (obligatorio para el club) *" : "Email (opcional)"}
            type="email"
            value={form.email}
            onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            className={cn(
              "w-full border rounded-xl px-4 py-3 text-base focus:outline-none transition-all",
              joinClub && !form.email.trim()
                ? "border-amber-300 bg-amber-50/30 focus:border-amber-500"
                : "border-zinc-200 focus:border-zinc-400"
            )}
          />
          <textarea
            placeholder="Notas o aclaraciones (opcional)"
            value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            rows={3}
            className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-zinc-400 resize-none"
          />

          {scheduledOrdersConfig?.enabled && mode === 'takeaway' && (
            <div className="space-y-3">
              <div>
                <h3 className="font-semibold text-sm text-zinc-700 mb-2">¿Cuándo querés retirar?</h3>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setScheduleOrder(false); setScheduledPickupAt(null) }}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      !scheduleOrder
                        ? 'border-zinc-900 bg-zinc-50'
                        : 'border-zinc-200 bg-white hover:border-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        !scheduleOrder ? 'border-zinc-900' : 'border-zinc-300'
                      }`}>
                        {!scheduleOrder && <div className="w-2 h-2 rounded-full bg-zinc-900" />}
                      </div>
                      <span className="text-sm font-bold text-zinc-900">Ahora</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-tight">Se prepara al instante</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScheduleOrder(true)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      scheduleOrder
                        ? 'border-zinc-900 bg-zinc-50'
                        : 'border-zinc-200 bg-white hover:border-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        scheduleOrder ? 'border-zinc-900' : 'border-zinc-300'
                      }`}>
                        {scheduleOrder && <div className="w-2 h-2 rounded-full bg-zinc-900" />}
                      </div>
                      <span className="text-sm font-bold text-zinc-900">Programar</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-tight">Elegí hora de retiro</p>
                  </button>
                </div>
              </div>

              {scheduleOrder && (
                <div>
                  <SchedulePicker
                    tenantSlug={tenantSlug}
                    locationId={locationId}
                    maxAdvanceHours={scheduledOrdersConfig?.maxAdvanceHours ?? 24}
                    onSelect={(pickupAt) => setScheduledPickupAt(pickupAt)}
                  />
                </div>
              )}
            </div>
          )}

            {loyaltyConfig?.enabled && !(mode === 'business' && businessInfo?.role === 'company_admin') && (
             <div className="space-y-3">
                {/* Card VIP si ya es miembro */}
               {loyaltyMember && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                  className="p-4 rounded-2xl border-2 border-zinc-900 bg-zinc-900 text-white shadow-xl shadow-zinc-200 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Star size={80} className="fill-white" />
                  </div>
                  
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="bg-amber-400 text-zinc-900 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter">
                        VIP Member
                      </div>
                      <span className="text-xs font-medium text-zinc-400">¡Hola, {loyaltyMember.name}!</span>
                    </div>
                    
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <p className="text-2xl font-black tabular-nums">{loyaltyMember.points}</p>
                        <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Tus puntos acumulados</p>
                      </div>
                      
                      {loyaltyMember.hasAdvanceActive && (
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wide">
                            Adelanto activo
                          </span>
                          <span className="text-[11px] text-zinc-400">
                            -{loyaltyMember.pointsPendingToConsolidate} pts por consolidar
                          </span>
                        </div>
                      )}
                    </div>

                      {walletEnabled && (
                        <button
                          type="button"
                          onClick={() => {
                            router.push(`/${tenantSlug}/club/lookup`)
                          }}
                          className="mt-3 w-full h-10 rounded-xl text-xs font-bold transition-all active:scale-[0.985] flex items-center justify-center gap-2 border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                        >
                          <Wallet size={16} />
                          Guardar en billetera digital
                        </button>
                      )}
                  </div>
                </motion.div>
              )}

              {/* Canjeá tus puntos */}
              {loyaltyMember && storeItems.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Gift size={16} className="text-zinc-700" />
                    <h3 className="text-sm font-bold text-zinc-700">Canjeá tus puntos</h3>
                  </div>

                  {rewardItemLoading ? (
                    <div className="flex justify-center py-4">
                      <div className="w-5 h-5 border-2 border-zinc-300 border-t-zinc-900 rounded-full animate-spin" />
                    </div>
                  ) : (
                    <motion.div
                      initial="hidden"
                      animate="visible"
                      variants={{
                        visible: { transition: { staggerChildren: 0.06 } },
                      }}
                      className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory scrollbar-thin"
                    >
                      {storeItems.map(item => {
                        const isSelected = selectedRewardItemId === item._id
                        const enoughPoints = loyaltyMember.points >= item.pointsCost
                        const needsAdvance = !enoughPoints
                        const itemMissingPoints = item.pointsCost - (loyaltyMember?.points ?? 0)
                        const canAdvance = needsAdvance && effectiveAdvanceLimit > 0
                          && itemMissingPoints <= effectiveAdvanceLimit
                          && !loyaltyMember?.hasAdvanceActive

                        return (
                          <motion.div
                            key={item._id}
                            variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
                          >
                          <button
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setSelectedRewardItemId(null)
                              } else if (enoughPoints || canAdvance) {
                                setSelectedRewardItemId(item._id)
                                captureRewardRedeemed({ _id: item._id, type: 'store_item', value: item.pointsCost })
                              }
                            }}
                            disabled={!enoughPoints && !canAdvance}
                            className={cn(
                              "flex-shrink-0 w-50 snap-start rounded-2xl border-2 p-3 text-left transition-all duration-500",
                              isSelected
                                ? "border-zinc-900 bg-zinc-50"
                                : !enoughPoints && !canAdvance
                                  ? "border-zinc-100 bg-zinc-50 opacity-50 grayscale cursor-not-allowed"
                                  : "border-zinc-200 bg-white hover:border-zinc-300"
                            )}
                          >
                            {item.imageUrl && (
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className="w-full h-20 object-cover rounded-xl mb-2"
                              />
                            )}
                            <p className="text-xs font-bold text-zinc-800 truncate">{item.name}</p>
                            <div className="flex items-center gap-1 mt-1">
                              <Star size={11} className="fill-amber-400 text-amber-400" />
                              <span className="text-xs font-semibold text-zinc-600">{item.pointsCost} pts</span>
                            </div>
                            {isSelected && enoughPoints && (
                              <span className="mt-1 block text-[10px] font-bold text-green-600">✓ Canjeado</span>
                            )}
                            {isSelected && !enoughPoints && (
                              <span className="mt-1 block text-[10px] font-bold text-amber-600">Con Reward Advance</span>
                            )}
                            {!isSelected && !enoughPoints && canAdvance && (
                              <span className="mt-1 block text-[10px] font-medium text-amber-500">Faltan {item.pointsCost - loyaltyMember.points} pts</span>
                            )}
                            {!isSelected && !enoughPoints && !canAdvance && (
                              <span className="mt-1 block text-[10px] font-medium text-zinc-400">Te faltan {item.pointsCost - loyaltyMember.points} pts</span>
                            )}
                            </button>
                          </motion.div>
                        )
                      })}
                    </motion.div>
                  )}

                  {/* Info de Reward Advance (SOS) */}
                  {selectedRewardItem && rewardNeedsAdvance && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                      <div className="flex items-start gap-2">
                        {/* <AlertTriangle size={14} className="text-amber-600 mt-0.5 flex-shrink-0" /> */}
                        <div>
                          {canUseSos ? (
                            <>
                              <p className="text-[11px] text-bold text-amber-600 mt-0.5">
                                ✨ Premio Liberado, obtén ya tu Reward Advance!
                              </p>
                              <p className="text-xs font-bold text-amber-800">
                                Te adelantamos {missingPoints} pts para que disfrutes tu recompensa hoy.
                              </p>
                              <p className="text-[11px] text-amber-600 mt-0.5">
                                Disfrutá tu canje a 0$. Te adelantamos los puntos pendientes. Consolidá tu progreso en tu próxima compra.
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-xs font-bold text-amber-800">
                                No podés usar Reward Advance
                              </p>
                              <p className="text-[11px] text-amber-600 mt-0.5">
                                {loyaltyMember.hasAdvanceActive
                                  ? 'Ya tenés un adelanto activo. Primero consolidalo.'
                                  : `El límite de adelanto es de ${effectiveAdvanceLimit} pts y necesitás ${missingPoints}.`
                                }
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Registro si no es miembro */}
              {!loyaltyMember && (
                <motion.label
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ type: 'spring', damping: 24, stiffness: 300, delay: 0.1 }}
                  className="flex items-start gap-3 p-4 rounded-2xl border-2 border-amber-200 bg-amber-50 cursor-pointer hover:bg-amber-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={joinClub}
                    onChange={e => setJoinClub(e.target.checked)}
                    className="mt-1 w-5 h-5 rounded border-amber-300 text-amber-500 focus:ring-amber-400"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Star size={16} className="text-amber-500 fill-amber-500" />
                      <span className="text-sm font-bold text-amber-900">
                        Unirme a {loyaltyConfig.clubName || 'Club de Fidelización'}
                      </span>
                    </div>
                    <p className="text-xs text-amber-700 mt-1">
                      {loyaltyConfig.welcomeMessage || 'Completá tu registro para recibir beneficios exclusivos.'}
                    </p>
                  </div>
                </motion.label>
              )}
            </div>
          )}

          {/* Fecha de nacimiento cuando se une al club */}
          {joinClub && loyaltyConfig?.enabled && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-zinc-700">
                Fecha de nacimiento <span className="text-zinc-400">(opcional)</span>
              </label>
              <input
                type="date"
                value={form.birthDate}
                onChange={e => setForm(p => ({ ...p, birthDate: e.target.value }))}
                max={new Date(Date.now() - 13 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                min={new Date(Date.now() - 120 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-zinc-400"
              />
              <p className="text-xs text-zinc-500">
                Te enviaremos felicitaciones en tu cumpleaños y ofertas especiales
              </p>
            </div>
          )}

          {/* Resumen de precios */}
          <div className="pt-4 border-t border-zinc-100 space-y-2 mb-6">
            <div className="flex justify-between text-sm text-zinc-500">
              <span>Subtotal</span>
              <span>${subtotal.toLocaleString('es-AR')}</span>
            </div>
            {activeQrPromo && (
              <div className="flex justify-between text-sm text-green-600 font-semibold">
                <span className="flex items-center gap-1">
                  <Percent size={12} />
                  {activeQrPromo.checkoutDiscountLabel || 'Descuento QR'} ({activeQrPromo.discountPercentage}%)
                </span>
                <span>-${discountAmount.toLocaleString('es-AR')}</span>
              </div>
            )}
            {selectedRewardItem && (
              <div className="flex justify-between text-sm text-emerald-600 font-semibold">
                <span className="flex items-center gap-1">
                  <Gift size={12} />
                  {selectedRewardItem.name} (Canje)
                </span>
                <span>$0</span>
              </div>
            )}
            {deliveryMode && deliveryQuote.withinRange && (
              <div className="flex justify-between text-sm text-zinc-500">
                <span className="flex items-center gap-1">🚚 Envío</span>
                <span>${deliveryQuote.cost.toLocaleString('es-AR')}</span>
              </div>
            )}
            {selectedPaymentMethod === 'transfer' ? (
              <div className="flex justify-between text-lg font-black text-emerald-700">
                <span>Total (precio de carta)</span>
                <span>${total.toLocaleString('es-AR')}</span>
              </div>
            ) : activeSurchargePercent > 0 ? (
              <>
                <div className="flex justify-between text-sm text-zinc-500">
                  <span>Precio de carta</span>
                  <span>${baseTotal.toLocaleString('es-AR')}</span>
                </div>
                <div className="flex justify-between text-sm text-amber-600 font-semibold">
                  <span>Recargo ({activeSurchargePercent}%)</span>
                  <span>+${(total - baseTotal).toLocaleString('es-AR')}</span>
                </div>
                <div className="flex justify-between text-lg font-black text-zinc-900">
                  <span>Total</span>
                  <span>${total.toLocaleString('es-AR')}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between text-lg font-black text-zinc-900">
                <span>Total</span>
                <span>${total.toLocaleString('es-AR')}</span>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Método de pago</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSelectedPaymentMethod('mercadopago')}
                className={`flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all ${selectedPaymentMethod === 'mercadopago' ? 'border-zinc-900 bg-zinc-900/5' : 'border-zinc-200 bg-white'}`}
              >
                <span className="text-2xl">💳</span>
                <div>
                  <p className="text-sm font-bold text-zinc-900">Mercado Pago</p>
                  <p className="text-[10px] text-zinc-500">Tarjeta, efectivo, transferencia</p>
                </div>
              </button>
              {transferEnabled && (
                <button
                  type="button"
                  onClick={() => setSelectedPaymentMethod('transfer')}
                  className={`flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all ${selectedPaymentMethod === 'transfer' ? 'border-emerald-600 bg-emerald-600/5' : 'border-zinc-200 bg-white'}`}
                >
                  <span className="text-2xl">🏦</span>
                  <div>
                    <p className="text-sm font-bold text-zinc-900">Transferencia</p>
                    <p className="text-[10px] text-zinc-500">Precio de carta</p>
                  </div>
                </button>
              )}
              {kriptonEnabled && (
                <button
                  type="button"
                  onClick={() => setSelectedPaymentMethod('kripton')}
                  className={`flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all ${selectedPaymentMethod === 'kripton' ? 'border-purple-600 bg-purple-600/5' : 'border-zinc-200 bg-white'}`}
                >
                  <span className="text-2xl">🪙</span>
                  <div>
                    <p className="text-sm font-bold text-zinc-900">Kripton</p>
                    <p className="text-[10px] text-zinc-500">USDT, BTC, ETH y más</p>
                  </div>
                </button>
              )}
            </div>

            {/* Info de recargo para MP y Kripton */}
            {selectedPaymentMethod !== 'transfer' && activeSurchargePercent > 0 && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
                <span className="text-lg">💡</span>
                <div className="text-xs text-amber-800">
                  <p className="font-semibold">
                    {selectedPaymentMethod === 'mercadopago' ? 'Mercado Pago' : 'Kripton'} · Precio con recargo
                  </p>
                  <p className="mt-0.5">
                    ${(baseTotal).toLocaleString('es-AR')} + {activeSurchargePercent}% ={' '}
                    <strong>${total.toLocaleString('es-AR')}</strong>
                  </p>
                  <p className="mt-0.5 text-amber-600">
                    Incluye costos operativos del medio de pago.
                  </p>
                </div>
              </div>
            )}

            {/* Datos bancarios para transferencia */}
            {selectedPaymentMethod === 'transfer' && transferData && (
                <div className="rounded-2xl bg-blue-50 border-2 border-blue-200 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Banknote size={18} className="text-blue-700" />
                    <p className="text-sm font-bold text-blue-900">Datos para transferir</p>
                  </div>
                  {transferData.alias && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Alias</p>
                      <div className="flex items-center justify-between bg-white rounded-xl px-3 py-2.5 border border-blue-100">
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
                      <div className="flex items-center justify-between bg-white rounded-xl px-3 py-2.5 border border-blue-100">
                        <span className="text-sm font-mono font-bold text-zinc-900">
                          {transferData.cbu || transferData.cvu}
                        </span>
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
                  {transferData.bankName && (
                    <div className="text-xs text-blue-600">
                      <span className="font-semibold">Banco:</span> {transferData.bankName}
                    </div>
                  )}
                  {transferData.holderName && (
                    <div className="text-xs text-blue-600">
                      <span className="font-semibold">Titular:</span> {transferData.holderName}
                    </div>
                  )}
                  <div className="bg-amber-50 rounded-xl p-2.5 border border-amber-200">
                    <p className="text-[11px] text-amber-800 font-medium flex items-center gap-1">
                      <span>⚠️</span>
                      Transferí el monto exacto de <strong>${total.toLocaleString('es-AR')}</strong> y luego confirmá el pago en la pantalla de seguimiento.
                    </p>
                  </div>
                </div>
              )}
            </div>

          <button
            type="submit"
            disabled={loading || cart.length === 0}
            className="w-full py-4 rounded-2xl bg-zinc-900 text-white font-bold text-base disabled:opacity-50"
          >
            {loading ? 'Procesando...' : scheduleOrder ? `📅 Programar y pagar` : mode === 'business' && businessInfo?.paymentMode !== 'cash_mp' ? '✅ Confirmar pedido' : deliveryMode ? `🚚 Pagar con ${selectedPaymentMethod === 'kripton' ? 'Kripton' : selectedPaymentMethod === 'transfer' ? 'Transferencia' : 'MercadoPago'}` : `💳 Pagar con ${selectedPaymentMethod === 'kripton' ? 'Kripton' : selectedPaymentMethod === 'transfer' ? 'Transferencia' : 'MercadoPago'}`}
          </button>

          {/* Términos y Privacidad */}
          <div className="mt-4 text-center space-x-2">
            <button
              type="button"
              onClick={() => setActiveLegalModal('terminos')}
              className="text-xs text-zinc-400 hover:text-zinc-600 underline underline-offset-2 transition-colors"
            >
              Términos y Condiciones
            </button>
            <span className="text-xs text-zinc-300">·</span>
            <button
              type="button"
              onClick={() => setActiveLegalModal('privacidad')}
              className="text-xs text-zinc-400 hover:text-zinc-600 underline underline-offset-2 transition-colors"
            >
              Política de Privacidad
            </button>
          </div>
        </form>
      </div>

      {/* Modal legal */}
      <AnimatePresence>
        {activeLegalModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 30 }}
              transition={{ type: 'spring', damping: 28, stiffness: 380 }}
              className="w-full max-w-md bg-white rounded-3xl max-h-[80dvh] overflow-y-auto"
            >
              <div className="sticky top-0 bg-white border-b border-zinc-100 p-4 flex items-center justify-between rounded-t-3xl z-10">
                <h2 className="font-bold text-base text-zinc-900">
                  {activeLegalModal === 'terminos' ? 'Términos y Condiciones' : 'Política de Privacidad'}
                </h2>
                <button
                  onClick={() => setActiveLegalModal(null)}
                  className="w-8 h-8 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-500 hover:bg-zinc-200 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                {(activeLegalModal === 'terminos' ? terminos : privacidad).map((section, i) => (
                  <div key={i}>
                    <h3 className="font-bold text-sm text-zinc-900 mb-1">{section.title}</h3>
                    <p className="text-sm text-zinc-500 leading-relaxed">{section.body}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {redirectingToMp && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center px-6">
          <div className="text-center max-w-sm">
            <div className="w-12 h-12 border-2 border-zinc-300 border-t-zinc-900 rounded-full animate-spin mx-auto mb-6" />
            <h2 className="text-xl font-black text-zinc-900 mb-3">Redirigiendo a {selectedPaymentMethod === 'kripton' ? 'Kripton' : selectedPaymentMethod === 'transfer' ? 'Transferencia' : 'Mercado Pago'}</h2>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-left space-y-3">
              <p className="text-sm font-bold text-amber-800">⚠️ Importante:</p>
              <p className="text-sm text-amber-700 leading-relaxed">
                Después de pagar, <strong className="text-amber-900">NO cierres la aplicación</strong>.
                Esperá 2 segundos y volverás automáticamente para ver el seguimiento de tu pedido.
              </p>
              <div className="flex items-center gap-2 text-amber-700">
                <span className="text-lg">✅</span>
                <span className="text-sm font-medium">Pago aprobado</span>
                <span className="text-zinc-400">→</span>
                <span className="text-lg">📦</span>
                <span className="text-sm font-medium">Ver seguimiento</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}