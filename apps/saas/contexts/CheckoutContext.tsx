'use client'

import { createContext, useContext, useCallback, useRef, useReducer, useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import type { CartItem } from '@/types/cart'

export interface DeliveryAddress {
  street: string
  number: string
  apt: string
  city: string
}

export interface DeliveryQuote {
  loading: boolean
  cost: number
  distance: number
  withinRange: boolean
  error: string | null
}

export interface LoyaltyConfig {
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

export interface StoreItem {
  _id: string
  name: string
  description: string
  imageUrl: string
  pointsCost: number
  stock?: number | null
  isActive: boolean
}

export interface ScheduledOrdersConfig {
  enabled: boolean
  minAdvanceMinutes: number
  maxAdvanceHours: number
}

export interface BusinessInfo {
  corporateAccountId: string
  role: string
  paymentMode: string
}

export interface ActiveQrPromo {
  discountPercentage: number
  checkoutDiscountLabel?: string
  promoSlug?: string
  source?: string
}

export interface EstimatedTimeInfo {
  baseTime: number
  delayAnnouncement: Record<string, { enabled: boolean; extraMinutes: number; message: string } | undefined>
}

export type ServiceHoursSlot = { days: number[]; open: string; close: string }

export interface CheckoutState {
  currentStep: number
  mode: 'takeaway' | 'delivery'
  tenantSlug: string
  locationId: string
  tenantName: string
  cart: CartItem[]
  upsellHints: any[]
  loading: boolean
  form: {
    name: string
    phone: string
    email: string
    birthDate: string
    notes: string
    countryCode: string
  }
  activeOrderNumber: string | null
  activeQrPromo: ActiveQrPromo | null
  promoCode: string
  loyaltyMember: any | null
  walletEnabled: boolean
  pointsLookupLoading: boolean
  storeItems: StoreItem[]
  businessInfo: BusinessInfo | null
  selectedRewardItemId: string | null
  rewardItemLoading: boolean
  loyaltyConfig: LoyaltyConfig | null
  joinClub: boolean
  scheduledOrdersConfig: ScheduledOrdersConfig | null
  scheduleOrder: boolean
  scheduledPickupAt: string | null
  activeLegalModal: 'terminos' | 'privacidad' | null
  redirectingToMp: boolean
  kriptonEnabled: boolean
  selectedPaymentMethod: 'mercadopago' | 'kripton' | 'transfer' | null
  paymentSurcharges: Record<string, number>
  paymentTotalFees: Record<string, number>
  transferEnabled: boolean
  transferData: { alias: string | null; cbu: string | null; cvu: string | null; bankName: string | null; holderName: string | null } | null
  estimatedTimeInfo: EstimatedTimeInfo | null
  deliveryMode: boolean
  deliveryAddress: DeliveryAddress
  deliveryQuote: DeliveryQuote
  deliveryConfirmed: boolean
  serviceHours?: {
    takeaway?: ServiceHoursSlot[]
    dineIn?: ServiceHoursSlot[]
    delivery?: ServiceHoursSlot[]
  }
  timezone?: string
  deliveryConfig?: { enabled?: boolean }
  hiddenRewardClaims: Array<{ menuItemId: string; discountPercentage: number; rewardTitle: string }>
}

type CheckoutAction =
  | { type: 'SET_STEP'; step: number }
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'SET_MODE'; mode: 'takeaway' | 'delivery' }
  | { type: 'SET_CART'; cart: CartItem[] }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_FORM'; form: Partial<CheckoutState['form']> }
  | { type: 'SET_ACTIVE_ORDER'; orderNumber: string | null }
  | { type: 'SET_LOYALTY_MEMBER'; member: any | null }
  | { type: 'SET_STORE_ITEMS'; items: StoreItem[] }
  | { type: 'SET_SELECTED_REWARD'; id: string | null }
  | { type: 'SET_LOYALTY_CONFIG'; config: LoyaltyConfig | null }
  | { type: 'SET_JOIN_CLUB'; join: boolean }
  | { type: 'SET_SCHEDULED_ORDERS_CONFIG'; config: ScheduledOrdersConfig | null }
  | { type: 'SET_SCHEDULE_ORDER'; schedule: boolean }
  | { type: 'SET_SCHEDULED_PICKUP'; at: string | null }
  | { type: 'SET_LEGAL_MODAL'; modal: 'terminos' | 'privacidad' | null }
  | { type: 'SET_REDIRECTING'; redirecting: boolean }
  | { type: 'SET_KRIPTON_ENABLED'; enabled: boolean }
  | { type: 'SET_PAYMENT_METHOD'; method: 'mercadopago' | 'kripton' | 'transfer' | null }
  | { type: 'SET_PAYMENT_SURCHARGES'; surcharges: Record<string, number> }
  | { type: 'SET_PAYMENT_TOTAL_FEES'; totalFees: Record<string, number> }
  | { type: 'SET_TRANSFER_ENABLED'; enabled: boolean }
  | { type: 'SET_TRANSFER_DATA'; data: { alias: string | null; cbu: string | null; cvu: string | null; bankName: string | null; holderName: string | null } | null }
  | { type: 'SET_ESTIMATED_TIME'; info: EstimatedTimeInfo | null }
  | { type: 'SET_DELIVERY_MODE'; delivery: boolean }
  | { type: 'SET_DELIVERY_ADDRESS'; address: Partial<DeliveryAddress> }
  | { type: 'SET_DELIVERY_QUOTE'; quote: Partial<DeliveryQuote> }
  | { type: 'SET_DELIVERY_CONFIRMED'; confirmed: boolean }
  | { type: 'SET_UPSERT_HINTS'; hints: any[] }
  | { type: 'SET_POINTS_LOOKUP_LOADING'; loading: boolean }
  | { type: 'SET_REWARD_LOADING'; loading: boolean }
  | { type: 'SET_WALLET_ENABLED'; enabled: boolean }
  | { type: 'SET_BUSINESS_INFO'; info: BusinessInfo | null }
  | { type: 'SET_ACTIVE_QR_PROMO'; promo: ActiveQrPromo | null }
  | { type: 'SET_PROMO_CODE'; code: string }
  | { type: 'SET_TENANT_NAME'; name: string }
  | { type: 'SET_SERVICE_HOURS'; serviceHours: CheckoutState['serviceHours']; timezone?: string; deliveryConfig?: { enabled?: boolean } }
  | { type: 'SET_HIDDEN_REWARD_CLAIMS'; claims: Array<{ menuItemId: string; discountPercentage: number; rewardTitle: string }> }

interface CheckoutContextValue {
  state: CheckoutState
  dispatch: React.Dispatch<CheckoutAction>
  steps: string[]
  increaseQty: (cartItemId: string) => void
  decreaseQty: (cartItemId: string) => void
  removeItem: (cartItemId: string) => void
  addHintToCart: (item: any) => void
  subtotal: number
  discountAmount: number
  deliveryCost: number
  total: number
  effectiveTime: number
  delayEnabled: boolean
  extraMinutes: number
  delayMessage: string
  qrEligibleSubtotal: number
  selectedRewardItem: StoreItem | null
  rewardNeedsAdvance: boolean
  missingPoints: number
  canUseSos: boolean
  effectiveAdvanceLimit: number
  currentMode: string
  modeDelay: { enabled: boolean; extraMinutes: number; message: string } | undefined
  tenantName: string
  baseTotal: number
  activeSurchargePercent: number
  transferData: { alias: string | null; cbu: string | null; cvu: string | null; bankName: string | null; holderName: string | null } | null
  hiddenRewardClaims: Array<{ menuItemId: string; discountPercentage: number; rewardTitle: string }>
}

const CheckoutContext = createContext<CheckoutContextValue | null>(null)

function reducer(state: CheckoutState, action: CheckoutAction): CheckoutState {
  switch (action.type) {
    case 'SET_STEP': return { ...state, currentStep: action.step }
    case 'NEXT_STEP': return { ...state, currentStep: state.currentStep + 1 }
    case 'PREV_STEP': return { ...state, currentStep: state.currentStep - 1 }
    case 'SET_MODE': return { ...state, mode: action.mode }
    case 'SET_CART': return { ...state, cart: action.cart }
    case 'SET_LOADING': return { ...state, loading: action.loading }
    case 'SET_FORM': return { ...state, form: { ...state.form, ...action.form } }
    case 'SET_ACTIVE_ORDER': return { ...state, activeOrderNumber: action.orderNumber }
    case 'SET_LOYALTY_MEMBER': return { ...state, loyaltyMember: action.member }
    case 'SET_STORE_ITEMS': return { ...state, storeItems: action.items }
    case 'SET_SELECTED_REWARD': return { ...state, selectedRewardItemId: action.id }
    case 'SET_LOYALTY_CONFIG': return { ...state, loyaltyConfig: action.config }
    case 'SET_JOIN_CLUB': return { ...state, joinClub: action.join }
    case 'SET_SCHEDULED_ORDERS_CONFIG': return { ...state, scheduledOrdersConfig: action.config }
    case 'SET_SCHEDULE_ORDER': return { ...state, scheduleOrder: action.schedule }
    case 'SET_SCHEDULED_PICKUP': return { ...state, scheduledPickupAt: action.at }
    case 'SET_LEGAL_MODAL': return { ...state, activeLegalModal: action.modal }
    case 'SET_REDIRECTING': return { ...state, redirectingToMp: action.redirecting }
    case 'SET_KRIPTON_ENABLED': return { ...state, kriptonEnabled: action.enabled }
    case 'SET_PAYMENT_METHOD': return { ...state, selectedPaymentMethod: action.method }
    case 'SET_PAYMENT_SURCHARGES': return { ...state, paymentSurcharges: action.surcharges }
    case 'SET_PAYMENT_TOTAL_FEES': return { ...state, paymentTotalFees: action.totalFees }
    case 'SET_TRANSFER_ENABLED': return { ...state, transferEnabled: action.enabled }
    case 'SET_TRANSFER_DATA': return { ...state, transferData: action.data }
    case 'SET_ESTIMATED_TIME': return { ...state, estimatedTimeInfo: action.info }
    case 'SET_DELIVERY_MODE': return { ...state, deliveryMode: action.delivery }
    case 'SET_DELIVERY_ADDRESS': return { ...state, deliveryAddress: { ...state.deliveryAddress, ...action.address } }
    case 'SET_DELIVERY_QUOTE': return { ...state, deliveryQuote: { ...state.deliveryQuote, ...action.quote } }
    case 'SET_DELIVERY_CONFIRMED': return { ...state, deliveryConfirmed: action.confirmed }
    case 'SET_UPSERT_HINTS': return { ...state, upsellHints: action.hints }
    case 'SET_POINTS_LOOKUP_LOADING': return { ...state, pointsLookupLoading: action.loading }
    case 'SET_REWARD_LOADING': return { ...state, rewardItemLoading: action.loading }
    case 'SET_WALLET_ENABLED': return { ...state, walletEnabled: action.enabled }
    case 'SET_BUSINESS_INFO': return { ...state, businessInfo: action.info }
    case 'SET_ACTIVE_QR_PROMO': return { ...state, activeQrPromo: action.promo }
    case 'SET_PROMO_CODE': return { ...state, promoCode: action.code }
    case 'SET_TENANT_NAME': return { ...state, tenantName: action.name }
    case 'SET_SERVICE_HOURS': return { ...state, serviceHours: action.serviceHours, timezone: action.timezone ?? state.timezone, deliveryConfig: action.deliveryConfig ?? state.deliveryConfig }
    case 'SET_HIDDEN_REWARD_CLAIMS': return { ...state, hiddenRewardClaims: action.claims }
    default: return state
  }
}

function createInitialState(tenantSlug: string, locationId: string, mode: 'takeaway' | 'delivery'): CheckoutState {
  return {
    currentStep: 0,
    mode,
    tenantSlug,
    locationId,
    tenantName: '',
    cart: [],
    upsellHints: [],
    loading: false,
    form: { name: '', phone: '', email: '', birthDate: '', notes: '', countryCode: '+54' },
    activeOrderNumber: null,
    activeQrPromo: null,
    promoCode: '',
    loyaltyMember: null,
    walletEnabled: false,
    pointsLookupLoading: false,
    storeItems: [],
    businessInfo: null,
    selectedRewardItemId: null,
    rewardItemLoading: false,
    loyaltyConfig: null,
    joinClub: false,
    scheduledOrdersConfig: null,
    scheduleOrder: false,
    scheduledPickupAt: null,
    activeLegalModal: null,
    redirectingToMp: false,
    kriptonEnabled: false,
    selectedPaymentMethod: null as any,
    paymentSurcharges: {},
    paymentTotalFees: {},
    transferEnabled: false,
    transferData: null,
    estimatedTimeInfo: null,
    deliveryMode: mode === 'delivery',
    deliveryAddress: { street: '', number: '', apt: '', city: '' },
    deliveryQuote: { loading: false, cost: 0, distance: 0, withinRange: false, error: null },
    deliveryConfirmed: false,
    serviceHours: undefined,
    timezone: undefined,
    deliveryConfig: undefined,
    hiddenRewardClaims: [],
  }
}

export const stepsMap: Record<string, string[]> = {
  takeaway: ['Tu pedido', 'Tus datos', 'Pago'],
  delivery: ['Tu pedido', 'Dirección', 'Tus datos', 'Pago'],
}

interface Props {
  tenantSlug: string
  locationId: string
  mode: 'takeaway' | 'delivery'
  children: ReactNode
}

export function CheckoutProvider({ tenantSlug, locationId, mode, children }: Props) {
  const router = useRouter()
  const { data: session } = useSession()
  const [state, dispatch] = useReducer(reducer, { tenantSlug, locationId, mode }, (init) => createInitialState(init.tenantSlug, init.locationId, init.mode))
  const stateRef = useRef(state)
  stateRef.current = state

  // ── Initialization: load cart, settings, loyalty, kripton ──────
  useEffect(() => {
    const saved = sessionStorage.getItem(`cart_${tenantSlug}`)
    if (!saved) {
      router.back()
      return
    }
    const parsedCart = JSON.parse(saved)
    const cartWithType = parsedCart.map((item: any) => ({
      ...item,
      type: item.type || (item.promotionId ? 'promotion' : 'menuItem'),
    }))
    dispatch({ type: 'SET_CART', cart: cartWithType })

    const hints = sessionStorage.getItem('upsellHints')
    if (hints) {
      dispatch({ type: 'SET_UPSERT_HINTS', hints: JSON.parse(hints) })
      sessionStorage.removeItem('upsellHints')
    }

    // Fetch location config + estimated times
    fetch(`/api/${tenantSlug}/locations/${locationId}`)
      .then(r => r.json())
      .then(data => {
        if (data.location) {
          dispatch({ type: 'SET_TENANT_NAME', name: data.tenantName || '' })
          dispatch({ type: 'SET_SCHEDULED_ORDERS_CONFIG', config: data.location.scheduledOrdersConfig || null })
          dispatch({ type: 'SET_SERVICE_HOURS', serviceHours: data.location.serviceHours, timezone: data.location.timezone, deliveryConfig: data.location.deliveryConfig })
          const settings = data.location.settings || {}
          dispatch({ type: 'SET_ESTIMATED_TIME', info: {
            baseTime: settings.estimatedPickupTime ?? 20,
            delayAnnouncement: settings.delayAnnouncement ?? {},
          } })
        } else {
          dispatch({ type: 'SET_SCHEDULED_ORDERS_CONFIG', config: null })
        }
      })
      .catch(() => dispatch({ type: 'SET_SCHEDULED_ORDERS_CONFIG', config: null }))

    // Fetch loyalty settings
    fetch(`/api/${tenantSlug}/loyalty/settings`)
      .then(r => r.json())
      .then(data => {
        if (data.loyalty?.enabled) {
          dispatch({ type: 'SET_LOYALTY_CONFIG', config: { ...data.loyalty, pointsConfig: data.pointsConfig } })
        }
      })
      .catch(() => {})

    // Fetch kripton status
    fetch(`/api/${tenantSlug}/kripton/status`)
      .then(r => r.json())
      .then(data => {
        if (data?.enabled) {
          dispatch({ type: 'SET_KRIPTON_ENABLED', enabled: true })
          dispatch({ type: 'SET_PAYMENT_METHOD', method: 'kripton' })
        }
      })
      .catch(() => {})

    // Fetch payment methods + surcharges + transfer data
    // Se pasa el mode efectivo para que el precio de transferencia mostrado al cliente
    // coincida exactamente con lo que el servidor va a calcular (comisión solo en delivery).
    const effectiveMode = stateRef.current.deliveryMode ? 'delivery' : mode
    fetch(`/api/${tenantSlug}/payment-methods?mode=${effectiveMode}`)
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
        const totalFees: Record<string, number> = {}
        for (const m of data.methods) {
          surcharges[m.id] = m.surchargePercent || 0
          totalFees[m.id] = m.totalFees || 0
        }
        dispatch({ type: 'SET_PAYMENT_SURCHARGES', surcharges })
        dispatch({ type: 'SET_PAYMENT_TOTAL_FEES', totalFees })

        const trAvailable = data.methods.find((m: any) => m.id === 'transfer')?.enabled
        if (trAvailable) {
          dispatch({ type: 'SET_TRANSFER_ENABLED', enabled: true })
          dispatch({ type: 'SET_TRANSFER_DATA', data: data.transfer })
        }
      })
      .catch((err) => { console.error('payment-methods fetch error:', err) })
  }, [tenantSlug, state.deliveryMode, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // QR promo from sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem('tgo-active-qr-promo')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (parsed.tenantSlug === tenantSlug && parsed.discountPercentage > 0) {
          dispatch({ type: 'SET_ACTIVE_QR_PROMO', promo: {
            discountPercentage: parsed.discountPercentage,
            checkoutDiscountLabel: parsed.checkoutDiscountLabel,
            promoSlug: parsed.promoSlug,
            source: parsed.source,
          }})
        }
      } catch {}
    }
  }, [tenantSlug])

  // Hidden Rewards: consultar /check cuando cambia el phone y hay items en el carrito
  useEffect(() => {
    const s = stateRef.current
    if (s.form.phone.length < 8 || s.cart.length === 0) {
      dispatch({ type: 'SET_HIDDEN_REWARD_CLAIMS', claims: [] })
      return
    }
    const timer = setTimeout(async () => {
      try {
        const fullPhone = `${s.form.countryCode}${s.form.phone}`
        const menuItemIds = s.cart
          .filter(item => item.type === 'menuItem' && item.menuItemId)
          .map(item => item.menuItemId!)
        if (menuItemIds.length === 0) return
        const res = await fetch(`/api/${tenantSlug}/hidden-rewards/check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: fullPhone, menuItemIds }),
        })
        const data = await res.json()
        dispatch({ type: 'SET_HIDDEN_REWARD_CLAIMS', claims: data.ok ? (data.claims || []) : [] })
      } catch {
        dispatch({ type: 'SET_HIDDEN_REWARD_CLAIMS', claims: [] })
      }
    }, 1200)
    return () => clearTimeout(timer)
  }, [state.form.phone, state.form.countryCode, tenantSlug, state.cart]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill from session
  useEffect(() => {
    const name = session?.user?.name
    const email = session?.user?.email
    if (email) {
      dispatch({ type: 'SET_FORM', form: { email, name: name || email.split('@')[0] || '' } })

      fetch(`/api/${tenantSlug}/loyalty/lookup?email=${encodeURIComponent(email)}`)
        .then(r => r.json())
        .then(data => {
          if (data.member) {
            dispatch({ type: 'SET_LOYALTY_MEMBER', member: data.member })
            dispatch({ type: 'SET_WALLET_ENABLED', enabled: data.wallet?.enabled ?? false })
            if (data.member.phone) {
              const digits = data.member.phone.replace(/\D/g, '')
              dispatch({ type: 'SET_FORM', form: { phone: digits.length > 10 ? digits.slice(-10) : digits } })
            }
          }
        })
        .catch(() => {})
    }
  }, [session, tenantSlug])

  // Lookup loyalty member when phone changes — handled via effect inside context consumer or component
  useEffect(() => {
    const phone = stateRef.current.form.phone
    if (phone.length < 8) {
      dispatch({ type: 'SET_LOYALTY_MEMBER', member: null })
      return
    }
    const timer = setTimeout(async () => {
      dispatch({ type: 'SET_POINTS_LOOKUP_LOADING', loading: true })
      try {
        const fullPhone = `${stateRef.current.form.countryCode}${phone}`
        const res = await fetch(`/api/${tenantSlug}/loyalty/lookup?phone=${encodeURIComponent(fullPhone)}`)
        const data = await res.json()
        if (res.ok && data.member) {
          dispatch({ type: 'SET_LOYALTY_MEMBER', member: data.member })
          dispatch({ type: 'SET_WALLET_ENABLED', enabled: data.wallet?.enabled ?? false })
        } else {
          dispatch({ type: 'SET_LOYALTY_MEMBER', member: null })
          dispatch({ type: 'SET_WALLET_ENABLED', enabled: false })
        }
      } catch (err) {
        console.error('Loyalty lookup error', err)
      } finally {
        dispatch({ type: 'SET_POINTS_LOOKUP_LOADING', loading: false })
      }
    }, 1000)
    return () => clearTimeout(timer)
  }, [state.form.phone, state.form.countryCode, tenantSlug]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load store items when member changes
  useEffect(() => {
    const s = stateRef.current
    if (!s.loyaltyMember || !s.loyaltyConfig?.enabled) {
      dispatch({ type: 'SET_STORE_ITEMS', items: [] })
      dispatch({ type: 'SET_SELECTED_REWARD', id: null })
      return
    }
    dispatch({ type: 'SET_REWARD_LOADING', loading: true })
    fetch(`/api/${tenantSlug}/store/items?isActive=true`)
      .then(r => r.json())
      .then(data => {
        if (data.items) dispatch({ type: 'SET_STORE_ITEMS', items: data.items })
      })
      .catch(() => {})
      .finally(() => dispatch({ type: 'SET_REWARD_LOADING', loading: false }))
  }, [state.loyaltyMember, state.loyaltyConfig?.enabled, tenantSlug]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset delivery quote when address changes
  useEffect(() => {
    const s = stateRef.current
    if (s.deliveryQuote.cost > 0 || s.deliveryQuote.error) {
      dispatch({ type: 'SET_DELIVERY_QUOTE', quote: { loading: false, cost: 0, distance: 0, withinRange: false, error: null } })
      dispatch({ type: 'SET_DELIVERY_CONFIRMED', confirmed: false })
    }
  }, [state.deliveryAddress])

  // SOS tracking (derived values)
  useEffect(() => {
    if (selectedRewardItem && rewardNeedsAdvance && canUseSos) {
      // Track reward advance offer (no-op for now)
    }
  }, [state.selectedRewardItemId]) // eslint-disable-line react-hooks/exhaustive-deps

  const steps = stepsMap[state.mode === 'delivery' ? 'delivery' : 'takeaway'] || stepsMap.takeaway

  const currentMode = state.deliveryMode ? 'delivery' : state.mode
  const modeDelay = state.estimatedTimeInfo?.delayAnnouncement?.[currentMode]
  const delayEnabled = modeDelay?.enabled ?? false
  const extraMinutes = modeDelay?.extraMinutes ?? 0
  const delayMessage = modeDelay?.message ?? ''
  const effectiveTime = (state.estimatedTimeInfo?.baseTime ?? 0) + (delayEnabled ? extraMinutes : 0)

  const subtotal = state.cart.reduce((sum, i) => sum + i.price * i.quantity, 0)

  const qrEligibleSubtotal = state.cart
    .filter(i => i.type !== 'promotion')
    .reduce((sum, i) => sum + i.price * i.quantity, 0)

  const hiddenRewardDiscount = !state.activeQrPromo && state.hiddenRewardClaims.length > 0
    ? state.hiddenRewardClaims.reduce((sum, claim) => {
        const cartItem = state.cart.find(i => i.menuItemId === claim.menuItemId)
        return cartItem ? sum + Math.floor(cartItem.price * cartItem.quantity * (claim.discountPercentage / 100)) : sum
      }, 0)
    : 0

  const qrDiscount = state.activeQrPromo
    ? Math.floor(qrEligibleSubtotal * (state.activeQrPromo.discountPercentage / 100))
    : 0

  const discountAmount = qrDiscount + hiddenRewardDiscount

  const selectedRewardItem = state.selectedRewardItemId
    ? state.storeItems.find(i => i._id === state.selectedRewardItemId) ?? null
    : null

  const rewardNeedsAdvance = selectedRewardItem && state.loyaltyMember
    ? state.loyaltyMember.points < selectedRewardItem.pointsCost
    : false

  const missingPoints = rewardNeedsAdvance
    ? (selectedRewardItem?.pointsCost ?? 0) - (state.loyaltyMember?.points ?? 0)
    : 0

  const effectiveAdvanceLimit = Math.min(
    state.loyaltyConfig?.sosLimit ?? 0,
    state.loyaltyConfig?.sosMaxLimit ?? 0
  )

  const canUseSos = rewardNeedsAdvance
    && effectiveAdvanceLimit > 0
    && missingPoints <= effectiveAdvanceLimit
    && !state.loyaltyMember?.hasAdvanceActive

  const deliveryCost = state.deliveryMode && state.deliveryQuote.withinRange ? state.deliveryQuote.cost : 0
  const baseTotal = Math.max(0, subtotal - discountAmount) + deliveryCost
  const activeTotalFees = state.selectedPaymentMethod
    ? (state.paymentTotalFees[state.selectedPaymentMethod] ?? 0)
    : 0
  const activeSurchargePercent = activeTotalFees > 0
    ? (state.selectedPaymentMethod === 'transfer'
      ? Math.round(activeTotalFees * 10000) / 100
      : Math.round((1 / (1 - activeTotalFees) - 1) * 10000) / 100)
    : 0
  const total = activeTotalFees > 0
    ? (state.selectedPaymentMethod === 'transfer'
      ? baseTotal + Math.round(baseTotal * activeTotalFees)
      : Math.ceil(baseTotal / (1 - activeTotalFees)))
    : baseTotal

  const increaseQty = useCallback((cartItemId: string) => {
    dispatch({ type: 'SET_CART', cart: stateRef.current.cart.map(i =>
      i.cartItemId === cartItemId ? { ...i, quantity: i.quantity + 1 } : i
    )})
  }, [])

  const decreaseQty = useCallback((cartItemId: string) => {
    dispatch({ type: 'SET_CART', cart: stateRef.current.cart.reduce((acc, i) => {
      if (i.cartItemId !== cartItemId) { acc.push(i); return acc }
      if (i.quantity === 1) return acc
      acc.push({ ...i, quantity: i.quantity - 1 })
      return acc
    }, [] as CartItem[]) })
  }, [])

  const removeItem = useCallback((cartItemId: string) => {
    dispatch({ type: 'SET_CART', cart: stateRef.current.cart.filter(i => i.cartItemId !== cartItemId) })
  }, [])

  const addHintToCart = useCallback((item: any) => {
    const plainId = `${item._id}:plain`
    const prev = stateRef.current
    const existing = prev.cart.find(i => i.cartItemId === plainId)
    if (existing) {
      dispatch({ type: 'SET_CART', cart: prev.cart.map(i =>
        i.cartItemId === plainId ? { ...i, quantity: i.quantity + 1 } : i
      )})
    } else {
      dispatch({ type: 'SET_CART', cart: [...prev.cart, {
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
        type: 'menuItem' as const,
        originalPrice: item.originalPrice,
        takeawayOriginalPrice: item.takeawayOriginalPrice,
      }] })
    }
    dispatch({ type: 'SET_UPSERT_HINTS', hints: prev.upsellHints.filter(h => h._id !== item._id) })
  }, [])

  const value: CheckoutContextValue = {
    state, dispatch, steps,
    increaseQty, decreaseQty, removeItem, addHintToCart,
    subtotal, discountAmount, deliveryCost, baseTotal, total,
    effectiveTime, delayEnabled, extraMinutes, delayMessage,
    qrEligibleSubtotal, selectedRewardItem,
    rewardNeedsAdvance, missingPoints, canUseSos, effectiveAdvanceLimit,
    currentMode, modeDelay,
    tenantName: state.tenantName,
    activeSurchargePercent,
    transferData: state.transferData,
    hiddenRewardClaims: state.hiddenRewardClaims,
  }

  return (
    <CheckoutContext.Provider value={value}>
      {children}
    </CheckoutContext.Provider>
  )
}

export function useCheckout() {
  const ctx = useContext(CheckoutContext)
  if (!ctx) throw new Error('useCheckout must be used within CheckoutProvider')
  return ctx
}
