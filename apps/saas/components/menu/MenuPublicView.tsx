'use client'

import { useState, useEffect, useRef, useSyncExternalStore, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { cn, cloudinaryUrl, cloudinaryBlurUrl } from '@/lib/utils'
import { toPesos } from '@takeasygo/business/browser'
import { evaluateRewardRedemption } from '@takeasygo/business'
import {
  ShoppingCart, X, Plus, Minus, Leaf, UtensilsCrossed,
  Settings, MapPin, Phone, Clock, Instagram, Facebook, Twitter,
  Award, Wallet, Tag, Heart, UserPlus,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { CartItem, PromoBundleSlot, SelectedVariant } from '@/types/cart'
import type { ICoOccurrencePair } from '@/models/MenuInsights'
import PoweredByTakeasy from '@/components/PoweredByTakeasy'
import CustomizationSheet from '@/components/menu/CustomizationSheet'
import UpsellSheet from '@/components/menu/UpsellSheet'
import { PromotionCard, PromotionCarousel } from '@/components/menu/PromotionCard'
import { resolveSlotCustomizationMode, type SlotCustomizationMode } from '@/lib/promotion-helpers'
import StoreCarousel, { type IdentifiedMember } from '@/components/menu/StoreCarousel'
import PointsStickyBar from '@/components/menu/PointsStickyBar'
import { saveClubPhoneForCheckout } from '@/lib/cart-restore-client'
import GeofenceFeedback from '@/components/feedback/GeofenceFeedback'
import { isAvailableNow } from '@/lib/availability'
import BestSellersSection from '@/components/menu/BestSellersSection'
import LikeBadge from '@/components/menu/LikeBadge'
import { getSuggestions, type UpsellSource } from '@/lib/upsell-menu'
import { useNotificationSound } from '@/hooks/useNotificationSound'
import { useClubMembership } from '@/hooks/useClubMembership'
import { captureHiddenRewardDiscovered, captureHiddenRewardRevealed, captureBestSellerAdded } from '@/lib/tia/events'
import { captureUpsellImpression } from '@/lib/events'
import { trackMenuOpened, trackCartAdd, trackCartRemove, trackRewardInteraction } from '@/lib/track'
import {
  normalizeStoredCart,
  getRewardLines,
  sumRewardPoints,
  isRewardInCart,
  addRewardLine,
  resolveMaxRewardsPerOrder,
} from '@/lib/cart-items'
import { motion } from 'framer-motion'
import EndOfMenuSection from '@/components/menu/EndOfMenuSection'
import { Confetti, type ConfettiRef } from '@/registry/magicui/confetti'
import LocationBar from '@/components/menu/LocationBar'
import OrderLookupByPhone from '@/components/menu/OrderLookupByPhone'
import PromotionStories from '@/components/menu/PromotionStories'
import AppStoryViewer, { type AppStoryItem } from '@/components/menu/AppStoryViewer'
import { SectionContainer } from '@/components/menu/SectionContainer'

interface Props {
  tenant: any
  location: any
  menu: any
  mode: 'takeaway' | 'dine-in' | 'business'
  groupSessionToken?: string
  groupEmail?: string
  onGroupItemAdded?: (itemName: string, updatedItems: any[]) => void
  bestSellers?: any[]
}

const VEGETARIAN_TAGS = ['vegetariano', 'vegano', 'vegan', 'vegetarian']
function isVegetarian(tags: string[]): boolean {
  return tags.some(t => VEGETARIAN_TAGS.includes(t.toLowerCase()))
}

function tn(obj: any, field: 'name' | 'description', locale: 'es' | 'en'): string {
  if (locale === 'en') {
    const trans = field === 'name' ? obj.nameTranslations : obj.descriptionTranslations
    if (trans?.en) return trans.en
  }
  return obj[field] || ''
}

/** Check if any category or item is missing an English translation */
function hasMissingTranslations(categories: any[]): boolean {
  for (const cat of categories) {
    if (!cat.nameTranslations?.en) return true
    for (const item of cat.items ?? []) {
      if (!item.nameTranslations?.en) return true
    }
    for (const sub of cat.subcategories ?? []) {
      if (!sub.nameTranslations?.en) return true
      for (const item of sub.items ?? []) {
        if (!item.nameTranslations?.en) return true
      }
    }
  }
  return false
}

const UI = {
  es: {
    featured: '⭐ Destacados',
    featuredTitle: 'Platos Destacados',
    featuredSubtitle: 'Una selección de nuestras creaciones más aclamadas, donde la técnica se encuentra con la pasión',
    takeaway: '🥡 Para llevar',
    dineIn: '🍽️ En mesa',
    viewOrder: 'Ver pedido',
    yourOrder: 'Tu pedido',
    total: 'Total',
    confirm: 'Confirmar pedido →',
    contact: 'Contacto',
    ourStory: 'Nuestra Historia',
    followUs: 'Síguenos',
    followIG: 'Seguinos en Instagram',
    followFB: 'Seguinos en Facebook',
    followTW: 'Seguinos en Twitter',
    rights: 'Todos los derechos reservados.',
    translating: 'Traduciendo...',
    product: 'producto',
    products: 'productos',
    save: 'Ahorrás',
  },
  en: {
    featured: '⭐ Featured',
    featuredTitle: 'Featured Dishes',
    featuredSubtitle: 'A selection of our most acclaimed creations, where technique meets passion',
    takeaway: '🥡 Takeaway',
    dineIn: '🍽️ Dine in',
    viewOrder: 'View order',
    yourOrder: 'Your order',
    total: 'Total',
    confirm: 'Confirm order →',
    contact: 'Contact',
    ourStory: 'Our Story',
    followUs: 'Follow us',
    followIG: 'Follow us on Instagram',
    followFB: 'Follow us on Facebook',
    followTW: 'Follow us on Twitter',
    rights: 'All rights reserved.',
    translating: 'Translating...',
    product: 'product',
    products: 'products',
    save: 'You save',
  },
}

export default function MenuPublicView({ tenant, location, menu, mode, groupSessionToken, groupEmail, onGroupItemAdded, bestSellers }: Props) {
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false)
  const [locale, setLocale] = useState<'es' | 'en'>('es')
  const [translating, setTranslating] = useState(false)
  // menuData is kept in state so we can update it after bulk translation
  const [menuData, setMenuData] = useState(menu)

  const [cart, setCart] = useState<CartItem[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = sessionStorage.getItem(`cart_${tenant.slug}`)
      if (saved) return normalizeStoredCart(JSON.parse(saved))
    } catch {}
    return []
  })
  const [showCart, setShowCart] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string>('')
  const [customizingItem, setCustomizingItem] = useState<any | null>(null)
  const [halfPriceContext, setHalfPriceContext] = useState<{
    isHalfAndHalf: boolean
    halfPriceItems: Array<{ _id: string; name: string; grandePrice: number }>
  } | null>(null)
  const [upsellSuggestions, setUpsellSuggestions] = useState<any[]>([])
  const [upsellSource, setUpsellSource] = useState<UpsellSource>('static')
  const [insights, setInsights] = useState<ICoOccurrencePair[] | null>(null)
  const skipUpsellRef = useRef(false)
  const upsellModalRef = useRef(false)
  const upsellDismissedRef = useRef(false)
  const bestSellerRef = useRef(false)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const navRef = useRef<HTMLDivElement>(null)
  const { play: playAddSound } = useNotificationSound('/pop.mp3')
  const [flyingItem, setFlyingItem] = useState<{
    startX: number; startY: number; startW: number; startH: number
    endX: number; endY: number
    imageUrl?: string
  } | null>(null)
  const cartBtnRef = useRef<HTMLButtonElement>(null)
  const confettiRef = useRef<ConfettiRef>(null)
  const navigatingRef = useRef(false)
  const branding = tenant.branding
  const profile = tenant.profile ?? {}
  const applyGridToTakeaway = !branding.menuLayoutApplyTo || branding.menuLayoutApplyTo === 'both' || branding.menuLayoutApplyTo === 'takeaway'
  const isGridForTakeaway = applyGridToTakeaway && branding.menuLayout === 'grid'
  const router = useRouter()
  const t = UI[locale]
  const isOperational = tenant.isOperational !== false
  const getItemPrice = (item: any) => {
    const hasVariants = (item.variants ?? []).length > 0
    if (hasVariants) {
      const prices = item.variants.map((v: any) => {
        const p = mode === 'takeaway' ? (v.takeawayPrice ?? v.price) :
          mode === 'business' ? (v.businessPrice ?? v.price) :
          v.price
        return Number(p) || 0
      })
      return Math.min(...prices)
    }
    if (mode === 'takeaway') return Number(item.takeawayPrice ?? item.price) || 0
    if (mode === 'business') return Number(item.businessPrice ?? item.price) || 0
    return Number(item.price) || 0
  }

  const [isAdminCorp, setIsAdminCorp] = useState(false)
  const [promotions, setPromotions] = useState<any[]>([])
  const [promotionsLoading, setPromotionsLoading] = useState(true)
  const [memberPoints, setMemberPoints] = useState(0)
  // Canje en checkout (store.maxRewardsPerOrder / store.enableCheckoutRedemption)
  const [checkoutRedemption, setCheckoutRedemption] = useState<{ enabled: boolean; maxPerOrder: number }>({
    enabled: false,
    maxPerOrder: 1,
  })
  const [promoSlotSelection, setPromoSlotSelection] = useState<{
    promo: any
    slotStates: Record<number, { selectedItems: any[]; completed: boolean }>
    currentSlotIndex: number
  } | null>(null)

  const [likesOrderId, setLikesOrderId] = useState<string | null>(null)
  const [likesToken, setLikesToken] = useState<string | null>(null)
  const [likedItems, setLikedItems] = useState<Set<string>>(new Set())
  const [likesLoading, setLikesLoading] = useState<Set<string>>(new Set())
  const [showStories, setShowStories] = useState(false)
  const [appStories, setAppStories] = useState<AppStoryItem[]>([])
  const [showAppStories, setShowAppStories] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const sp = new URLSearchParams(window.location.search)
    const oid = sp.get('likes')
    const tok = sp.get('token')
    if (oid && tok) {
      setLikesOrderId(oid)
      setLikesToken(tok)
    }
  }, [])

  // Detect company admin in business mode (block promos + store)
  useEffect(() => {
    if (mode === 'business' && !groupSessionToken) {
      const role = sessionStorage.getItem('businessRole')
      setIsAdminCorp(role === 'company_admin')
    }
  }, [mode, groupSessionToken])

  useEffect(() => {
    fetch(`/api/${tenant.slug}/menu/${location._id}/promotions?mode=${mode}`)
      .then(r => r.ok ? r.json() : { promotions: [] })
      .then(data => {
        setPromotions(data.promotions || [])
        setPromotionsLoading(false)
      })
      .catch(() => setPromotionsLoading(false))
  }, [tenant.slug, location._id, mode])

  useEffect(() => {
    fetch('/api/app-stories')
      .then(r => r.ok ? r.json() : { stories: [] })
      .then(data => setAppStories(data.stories || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    trackMenuOpened(location._id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Upsell impression: track when suggestions become visible
  const prevUpsellCountRef = useRef(0)
  useEffect(() => {
    if (upsellSuggestions.length > 0 && prevUpsellCountRef.current === 0) {
      captureUpsellImpression({ suggestions: upsellSuggestions.map((s: any) => s.name), source: upsellSource || 'static' })
    }
    prevUpsellCountRef.current = upsellSuggestions.length
  }, [upsellSuggestions, upsellSource])

  const clubMembership = useClubMembership(tenant.slug, location._id)

  // ── Club Discount: descuento en carta solo para miembros ───────────────────
  const [clubDiscount, setClubDiscount] = useState<{
    scope: string
    categoryIds: string[]
    subcategoryIds: string[]
    itemIds: string[]
    discountPercent: number
    cooldownHours: number
  } | null>(null)

  useEffect(() => {
    // Con la sede: si la sede desactivó el descuento del club, no se muestra.
    fetch(`/api/${tenant.slug}/club-discount?locationId=${location._id}`)
      .then(r => (r.ok ? r.json() : { discount: null }))
      .then(data => setClubDiscount(data.discount ?? null))
      .catch(() => {})
  }, [tenant.slug, location._id])

  // Check if member is eligible (cooldown passed)
  const [clubEligible, setClubEligible] = useState(false)
  useEffect(() => {
    if (!clubMembership.isMember || !clubDiscount) {
      setClubEligible(false)
      return
    }
    // Read joinedAt from localStorage
    try {
      const storageKey = location._id ? `club_${tenant.slug}_${location._id}` : `club_${tenant.slug}`
      const raw = localStorage.getItem(storageKey)
      if (!raw) { setClubEligible(false); return }
      const stored = JSON.parse(raw)
      const joinedAt = new Date(stored.joinedAt).getTime()
      const hoursSinceJoin = (Date.now() - joinedAt) / (1000 * 60 * 60)
      setClubEligible(hoursSinceJoin >= (clubDiscount.cooldownHours ?? 24))
    } catch {
      setClubEligible(false)
    }
  }, [clubMembership.isMember, clubDiscount, tenant.slug, location._id])

  // Helper: get discounted price for an item (returns null if no discount applies)
  const getClubDiscountedPrice = useCallback((item: any, itemCategoryId?: string, itemSubcategoryId?: string): { original: number; discounted: number } | null => {
    if (!clubDiscount || !clubEligible) return null
    const price = mode === 'takeaway'
      ? Number(item.takeawayPrice ?? item.price) || 0
      : mode === 'business'
        ? Number(item.businessPrice ?? item.price) || 0
        : Number(item.price) || 0
    if (price <= 0) return null
    let eligible = false
    if (clubDiscount.scope === 'all') {
      eligible = true
    } else if (clubDiscount.scope === 'category' && itemCategoryId) {
      eligible = clubDiscount.categoryIds.includes(itemCategoryId)
    } else if (clubDiscount.scope === 'subcategory' && itemSubcategoryId) {
      eligible = clubDiscount.subcategoryIds.includes(itemSubcategoryId)
    } else if (clubDiscount.scope === 'item') {
      eligible = clubDiscount.itemIds.includes(item._id?.toString?.() ?? item._id)
    }
    if (!eligible) return null
    const discounted = Math.floor(price * (1 - clubDiscount.discountPercent / 100))
    return { original: price, discounted }
  }, [clubDiscount, clubEligible, mode])

  // Sincronizar memberPoints desde el hook para StoreCarousel
  useEffect(() => {
    if (clubMembership.isMember) {
      setMemberPoints(clubMembership.points)
    }
  }, [clubMembership.isMember, clubMembership.points])

  // El miembro ya identificado (JWT/auth/cache) deja su teléfono listo para
  // el checkout: sin esto, el CheckoutContext no sabría quién es y sacaría
  // los premios del carrito al no encontrar membresía. Solo ≥10 dígitos:
  // hashPhone conserva los últimos 10, así que cualquier prefijo de país
  // ficticio (+54) conserva el sufijo y hace match igual.
  useEffect(() => {
    if (!clubMembership.isMember) return
    const digits = (clubMembership.phone || '').replace(/\D/g, '')
    if (digits.length < 10) return
    saveClubPhoneForCheckout(tenant.slug, {
      countryCode: '+54',
      phone: digits,
      name: clubMembership.name,
    })
  }, [clubMembership.isMember, clubMembership.phone, clubMembership.name, tenant.slug])

  // Config pública del store: habilita "agregar al carrito" y el tope de premios
  useEffect(() => {
    let cancelled = false
    fetch(`/api/${tenant.slug}/store/config`)
      .then(r => r.json())
      .then((data: { config?: { enableCheckoutRedemption?: boolean; maxRewardsPerOrder?: number | null } }) => {
        if (cancelled) return
        const cfg = data?.config
        setCheckoutRedemption({
          enabled: Boolean(cfg?.enableCheckoutRedemption),
          maxPerOrder: resolveMaxRewardsPerOrder(cfg),
        })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [tenant.slug])

  // Estado de los premios en el carrito del menú (fuente de verdad compartida
  // con el checkout vía sessionStorage)
  const rewardLines = getRewardLines(cart)
  const rewardPointsInCart = sumRewardPoints(cart)
  const rewardLimitReached = rewardLines.length >= checkoutRedemption.maxPerOrder
  const rewardPointsAvailable = Math.max(0, memberPoints - rewardPointsInCart)
  const rewardCheckoutActive = checkoutRedemption.enabled && clubMembership.isMember

  const featuredPromotions = promotions.filter(p => p.isFeatured)
  const regularPromotions = promotions.filter(p => !p.isFeatured)

  const categories = menuData.categories
    .filter((cat: any) => {
      if (mode === 'business' && !cat.isBusinessAvailable) return false
      return cat.isAvailable && (!mounted || isAvailableNow(cat.availabilityMode, cat.availabilitySchedule))
    })
    .sort((a: any, b: any) => {
      const diff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
      return diff !== 0 ? diff : String(a._id).localeCompare(String(b._id))
    })

  const featuredItems = categories.flatMap((cat: any) => {
    const catGroups = cat.customizationGroups ?? []
    const direct = cat.items.filter((i: any) => {
      if (mode === 'business') return i.isFeatured && i.isBusinessAvailable
      return i.isFeatured
    }).map((i: any) => ({ ...i, _catGroups: catGroups }))
    const sub = (cat.subcategories ?? []).flatMap((sub: any) =>
      sub.items.filter((i: any) => {
        if (mode === 'business') return i.isFeatured && i.isBusinessAvailable
        return i.isFeatured
      }).map((i: any) => ({ ...i, _catGroups: catGroups }))
    )
    return [...direct, ...sub]
  })

  async function switchToEnglish() {
    if (categories.length > 0 && hasMissingTranslations(categories)) {
      setTranslating(true)
      try {
        const res = await fetch(`/api/${tenant.slug}/menu/translate-all`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locationId: location._id }),
        })
        if (res.ok) {
          const data = await res.json()
          setMenuData(data.menu)
        }
      } catch {
        // If translation fails, still switch — will show Spanish as fallback
      } finally {
        setTranslating(false)
      }
    }
    setLocale('en')
  }

  function handleLocaleToggle(newLocale: 'es' | 'en') {
    if (newLocale === 'en') {
      switchToEnglish()
    } else {
      setLocale('es')
    }
  }

  // Intersection observer for active category tracking
  useEffect(() => {
    if (categories.length === 0) return
    setActiveCategory(categories[0]._id)
    const observers: IntersectionObserver[] = []
    categories.forEach((cat: any) => {
      const el = sectionRefs.current[cat._id]
      if (!el) return
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveCategory(cat._id) },
        { rootMargin: '-30% 0px -65% 0px', threshold: 0 }
      )
      obs.observe(el)
      observers.push(obs)
    })
    return () => observers.forEach(o => o.disconnect())
  }, [menuData])

  // Auto-scroll nav circle to active
  useEffect(() => {
    if (!navRef.current || !activeCategory) return
    const btn = navRef.current.querySelector(`[data-cat="${activeCategory}"]`) as HTMLElement
    if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [activeCategory])

  // Fetch insights de co-ocurrencia (no bloquea el render, mejora sugerencias cuando llegan)
  useEffect(() => {
    fetch(`/api/${tenant.slug}/menu/insights/${location._id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.pairs?.length) setInsights(data.pairs) })
      .catch(() => { /* falla silenciosa, el fallback estático sigue funcionando */ })
  }, [tenant.slug, location._id])

  // Reset upsell suppression when cart becomes empty
  useEffect(() => {
    if (cart.length === 0) upsellDismissedRef.current = false
  }, [cart.length])

  async function handleLikeToggle(itemId: string) {
    if (!likesOrderId || !likesToken) return
    const loadingKey = itemId
    if (likesLoading.has(loadingKey)) return
    setLikesLoading(prev => new Set(prev).add(loadingKey))
    const isLiked = likedItems.has(itemId)
    try {
      const res = await fetch(`/api/${tenant.slug}/menu/items/${itemId}/like`, {
        method: isLiked ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: likesOrderId, token: likesToken }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setLikedItems(prev => { const n = new Set(prev); if (data.liked) n.add(itemId); else n.delete(itemId); return n })
      setMenuData((prev: any) => {
        const cats = prev.categories.map((cat: any) => ({
          ...cat,
          items: cat.items.map((it: any) =>
            it._id === itemId ? { ...it, likesCount: data.likesCount } : it
          ),
          subcategories: (cat.subcategories ?? []).map((sub: any) => ({
            ...sub,
            items: sub.items.map((it: any) =>
              it._id === itemId ? { ...it, likesCount: data.likesCount } : it
            ),
          })),
        }))
        return { ...prev, categories: cats }
      })
    } catch { toast.error('No se pudo actualizar el like') }
    finally { setLikesLoading(prev => { const n = new Set(prev); n.delete(loadingKey); return n }) }
  }

  const handleFlyToCart = useCallback((item: any, rect: DOMRect) => {
    const cartRect = cartBtnRef.current?.getBoundingClientRect()
    const targetX = cartRect
      ? cartRect.left + cartRect.width / 2 - 8
      : rect.left
    const targetY = cartRect
      ? cartRect.top + cartRect.height / 2 - 8
      : rect.top - 60
    setFlyingItem({
      startX: rect.left, startY: rect.top, startW: rect.width, startH: rect.height,
      endX: targetX, endY: targetY,
      imageUrl: item.imageUrl,
    })
  }, [])

  function addPlainToCart(item: any, triggerUpsell = true, addedFrom: CartItem['addedFrom'] = 'menu') {
    const hasVariants = (item.variants ?? []).length > 0
    const hasCustomizationGroups = (item.customizationGroups ?? []).length > 0
    if (hasVariants || hasCustomizationGroups) {
      openCustomizationModal(item)
      return
    }

    // Group session: post directly to session API
    if (groupSessionToken && groupEmail) {
      addToGroupSession([{
        menuItemId: item._id,
        quantity: 1,
        customizations: [],
        selectedVariant: undefined,
      }], item.name)
      return
    }

    const plainId = `${item._id}:plain`
    const isNew = !cart.some(i => i.cartItemId === plainId)
    setCart(prev => {
      const existing = prev.find(i => i.cartItemId === plainId)
      if (existing) return prev.map(i => i.cartItemId === plainId ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, {
        cartItemId: plainId,
        menuItemId: item._id,
        name: item.name,
        description: item.description,
        imageUrl: item.imageUrl,
        basePrice: getItemPrice(item),
        extraPrice: 0,
        price: getItemPrice(item),
        quantity: 1,
        customizations: [],
        customizationSummary: '',
        addedFrom,
        type: 'menuItem',
        originalPrice: item.originalPrice,
        takeawayOriginalPrice: item.takeawayOriginalPrice,
      }]
    })
    if (triggerUpsell && isNew && !upsellDismissedRef.current) {
      const { items, source } = getSuggestions(categories, cart, String(item._id), insights, 2, tenant.specialDates)
      if (items.length > 0) { setUpsellSuggestions(items); setUpsellSource(source) }
    }
    trackCartAdd({ menuItemId: item._id, name: item.name, category: '', price: getItemPrice(item), quantity: 1, hasCustomizations: false, source: addedFrom || 'menu', locationId: location._id })
    // Momento 01: feedback de posesión
    playAddSound()
    if (navigator.vibrate) navigator.vibrate(50)

    // Hidden Rewards: disparar descubrimiento (fire-and-forget)
    discoverHiddenReward(item._id)
  }

  async function discoverHiddenReward(menuItemId: string) {
    try {
      captureHiddenRewardDiscovered(menuItemId)
      const res = await fetch(`/api/${tenant.slug}/hidden-rewards/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menuItemId, locationId: location._id, sessionId: sessionStorage.getItem('hr_sessionId') || undefined }),
      })
      if (!res.ok) return
      const data = await res.json()
      if (data.ok && data.reward) {
        // Guardar sessionId para el mismo carrito (regla "no consumir en la misma sesión")
        if (data.reward.sessionId) {
          sessionStorage.setItem('hr_sessionId', data.reward.sessionId)
        }
        captureHiddenRewardRevealed(menuItemId, data.reward.title, data.reward.discountPercentage)
        // Toast celebratorio centrado + confetti
        toast(
          <div className="flex flex-col items-center gap-1 py-2">
            <span className="text-2xl">🎁</span>
            <span className="font-bold text-base">{data.reward.title}</span>
            <span className="text-sm text-zinc-500">{data.reward.description || `${data.reward.discountPercentage}% de descuento`}</span>
          </div>,
          { duration: 5000, position: 'top-center' }
        )
        confettiRef.current?.fire({ particleCount: 120, spread: 140 })
      }
    } catch {
      // silencioso — no afecta la experiencia del usuario
    }
  }

  async function addToGroupSession(items: any[], itemName: string) {
    try {
      const res = await fetch(`/api/${tenant.slug}/business/group-session/${groupSessionToken}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: groupEmail, items }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || 'Error al agregar item al pedido grupal')
        return
      }
      toast.success(`${itemName} agregado al pedido grupal`)
      const data = await res.json()
      onGroupItemAdded?.(itemName, data.session.items)
    } catch {
      toast.error('Error al agregar item al pedido grupal')
    }
  }

  function addPromotionToCart(promotion: any) {
    if (promotion.type !== 'sale' || !promotion.slots?.length) return

    const promoOverrideGroups = promotion.overrideCustomizationGroups ?? []

    function resolveItemsForSlot(slot: any) {
      const resolved: any[] = []
      const seenItemIds = new Set<string>()

      if (Array.isArray(slot.itemIds) && slot.itemIds.length > 0) {
        for (const cat of menuData.categories ?? []) {
          for (const item of cat.items ?? []) {
            const itemId = item._id?.toString?.() || item._id
            if (slot.itemIds.some((id: any) => (id?.toString?.() || id) === itemId) && !seenItemIds.has(itemId)) {
              seenItemIds.add(itemId)
              resolved.push({
                _id: itemId,
                name: item.name,
                categoryName: cat.name,
                variants: item.variants ?? [],
                customizationGroups: [
                  ...(cat.customizationGroups ?? []),
                  ...(item.customizationGroups ?? []),
                  ...(slot.overrideCustomizationGroups ?? []),
                  ...(promoOverrideGroups ?? []),
                ],
              })
            }
          }
        }
      } else if (Array.isArray(slot.categoryIds) && slot.categoryIds.length > 0) {
        for (const cat of menuData.categories ?? []) {
          const catId = cat._id?.toString?.() || cat._id
          if (slot.categoryIds.some((id: any) => (id?.toString?.() || id) === catId)) {
            for (const item of cat.items ?? []) {
              const itemId = item._id?.toString?.() || item._id
              if (!seenItemIds.has(itemId)) {
                seenItemIds.add(itemId)
                resolved.push({
                  _id: itemId,
                  name: item.name,
                  categoryName: cat.name,
                  variants: item.variants ?? [],
                  customizationGroups: [
                    ...(cat.customizationGroups ?? []),
                    ...(item.customizationGroups ?? []),
                    ...(slot.overrideCustomizationGroups ?? []),
                    ...(promoOverrideGroups ?? []),
                  ],
                })
              }
            }
          }
        }
      }

      return resolved
    }

    const slotsWithResolved = promotion.slots.map((slot: any) => ({
      ...slot,
      resolvedItems: slot.resolvedItems ?? resolveItemsForSlot(slot),
    }))

    // Auto-select disabled: always show the multi-slot picker UI so users manually confirm
    const allAutoSelect = false

    // Note: when allAutoSelect is true, the block below auto-adds all items to cart.
    // Disabled because multi-sabor promotions (docenas, pizzas mitad y mitad) require
    // manual selection. The slot picker UI at line 630+ is always shown instead.

    const initialSlotStates: Record<number, { selectedItems: any[]; completed: boolean }> = {}
    slotsWithResolved.forEach((_: any, idx: number) => {
      initialSlotStates[idx] = { selectedItems: [], completed: false }
    })

    setPromoSlotSelection({
      promo: { ...promotion, slots: slotsWithResolved },
      slotStates: initialSlotStates,
      currentSlotIndex: 0,
    })
  }

  /**
   * Acumula una unidad elegida en el slot activo del picker de promoción.
   * Devuelve false si el slot ya está completo o el picker no está abierto.
   */
  function addPromoUnitToSlot(unit: {
    itemId: string
    itemName: string
    selectedVariant?: SelectedVariant
    customizations?: CartItem['customizations']
    customizationSummary?: string
    /** Precio de los agregados elegidos (centavos); se cobra si la promo lo indica. */
    extraPrice?: number
  }): boolean {
    if (!promoSlotSelection) return false
    const slotIdx = promoSlotSelection.currentSlotIndex
    const slot = promoSlotSelection.promo.slots[slotIdx]
    const state = promoSlotSelection.slotStates[slotIdx]
    if (!slot || !state) return false
    const required = slot.requiredQuantity ?? 1
    if (state.selectedItems.length >= required) return false
    setPromoSlotSelection(prev => {
      if (!prev) return null
      const st = prev.slotStates[slotIdx]
      if (!st || st.selectedItems.length >= required) return prev
      const newSelectedItems = [...st.selectedItems, unit]
      const isCompleted = newSelectedItems.length >= required
      const newSlotStates = { ...prev.slotStates }
      newSlotStates[slotIdx] = { selectedItems: newSelectedItems, completed: isCompleted }
      let nextSlotIdx = prev.currentSlotIndex
      if (isCompleted) {
        for (let i = 0; i < prev.promo.slots.length; i++) {
          if (!newSlotStates[i]?.completed) {
            nextSlotIdx = i
            break
          }
        }
      }
      return { ...prev, slotStates: newSlotStates, currentSlotIndex: nextSlotIdx }
    })
    return true
  }

  /**
   * Confirma el picker: agrega TODA la selección al carrito como UNA sola
   * línea (bundle) con price = promotion.price. El server valida cada unidad
   * contra los slots y cobra el precio del combo una sola vez por bundle.
   */
  function confirmPromoBundle() {
    if (!promoSlotSelection) return
    const { promo, slotStates } = promoSlotSelection
    const bundle: PromoBundleSlot[] = promo.slots.map((slot: any, idx: number) => ({
      slotName: slot.name || `Slot ${idx + 1}`,
      units: (slotStates[idx]?.selectedItems ?? []).map((u: any) => ({
        menuItemId: String(u.itemId || ''),
        itemName: u.itemName || '',
        slotName: slot.name || `Slot ${idx + 1}`,
        ...(u.selectedVariant ? { selectedVariant: u.selectedVariant } : {}),
        ...(u.customizations?.length ? { customizations: u.customizations } : {}),
        ...(u.customizationSummary ? { customizationSummary: u.customizationSummary } : {}),
      })),
    }))
    if (bundle.some(s => s.units.length === 0)) {
      toast.error('Completá la selección de todos los pasos')
      return
    }
    const summary = bundle
      .flatMap(s => s.units)
      .map(u => (u.customizationSummary ? `${u.itemName} · ${u.customizationSummary}` : u.itemName))
      .join(' · ')
    // Agregados con precio (por combo): se suman al precio de la promo salvo
    // que el comercio los incluya sin costo (chargeCustomizationExtras false).
    const chargeExtras = promo.chargeCustomizationExtras !== false
    const comboExtras = chargeExtras
      ? promo.slots.reduce((sum: number, _slot: any, idx: number) =>
          sum + (slotStates[idx]?.selectedItems ?? []).reduce((s: number, u: any) => s + (u.extraPrice || 0), 0), 0)
      : 0
    const bundleKey = JSON.stringify(bundle)
    setCart(prev => {
      const existing = prev.find(i =>
        i.type === 'promotion' &&
        i.promotionId === promo._id &&
        (i as any)._bundle &&
        JSON.stringify((i as any)._bundle) === bundleKey
      )
      if (existing) return prev.map(i => i.cartItemId === existing.cartItemId ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, {
        cartItemId: `promo:${promo._id}:${Date.now()}`,
        promotionId: promo._id,
        _promotionTitle: promo.title,
        _promotionShortDescription: promo.shortDescription || '',
        name: promo.title,
        basePrice: promo.price,
        extraPrice: comboExtras,
        price: promo.price + comboExtras,
        quantity: 1,
        customizations: [],
        customizationSummary: summary,
        addedFrom: 'menu' as const,
        type: 'promotion' as const,
        _bundle: bundle,
      }]
    })
    trackCartAdd({ promotionId: promo._id, name: promo.title, price: promo.price, quantity: 1, hasCustomizations: false, source: 'menu', locationId: location._id })
    toast.success(`${promo.title} agregado al pedido`)
    setPromoSlotSelection(null)
  }

  function buildPromoCustomizationItem(item: any, promotion: any) {
    return {
      ...item,
      _promotionId: promotion._id,
      _promotionTitle: promotion.title,
      _promotionDescription: promotion.description || '',
      _promotionShortDescription: promotion.shortDescription || '',
      _itemName: item.name,
      _itemCategoryName: item.categoryName || '',
      price: promotion.price,
      basePrice: promotion.price,
      isPromotion: true,
      variants: (item.variants ?? []).map((v: any) => ({
        ...v,
        price: promotion.price,
        takeawayPrice: promotion.price,
      })),
      customizationGroups: item.customizationGroups ?? [],
    }
  }

  function handleConfirmCustomization(cartItem: CartItem) {
    if ((cartItem as any).isPromotion) {
      const itemName = (cartItem as any)._itemName || ''

      // Group session: post directly
      if (groupSessionToken && groupEmail) {
        addToGroupSession([{
          menuItemId: cartItem.menuItemId,
          quantity: 1,
          customizations: cartItem.customizations,
          selectedVariant: cartItem.selectedVariant ? { name: cartItem.selectedVariant.name } : undefined,
        }], (cartItem as any)._promotionTitle || cartItem.name)
        setCustomizingItem(null)
        return
      }

      // Acumula la unidad en el slot actual del picker. El bundle completo se
      // agrega al carrito como UNA sola línea (price = promotion.price) cuando
      // todos los slots están completos — ver confirmPromoBundle().
      const accepted = addPromoUnitToSlot({
        itemId: cartItem.menuItemId || (cartItem as any)._id || '',
        itemName,
        selectedVariant: cartItem.selectedVariant,
        customizations: cartItem.customizations?.length ? cartItem.customizations : undefined,
        customizationSummary: cartItem.customizationSummary || '',
        // Mitad y mitad tiene su propia regla de precio: no se suma como agregado.
        extraPrice: (cartItem as any)._isHalf ? 0 : Math.max(0, Math.round(cartItem.extraPrice || 0)),
      })
      setCustomizingItem(null)
      if (!accepted) {
        toast.info('Este paso ya está completo — pasá al siguiente o cerrá el selector')
        return
      }
      if (cartItem.menuItemId) {
        trackCartAdd({ menuItemId: cartItem.menuItemId, name: itemName, price: cartItem.price, quantity: 1, hasCustomizations: true, source: 'menu', locationId: location._id })
      }
      toast.success(`${itemName} seleccionado`)
      return
    }

    // Group session: post directly
    if (groupSessionToken && groupEmail) {
      addToGroupSession([{
        menuItemId: cartItem.menuItemId,
        quantity: cartItem.quantity,
        customizations: cartItem.customizations,
        selectedVariant: cartItem.selectedVariant ? { name: cartItem.selectedVariant.name } : undefined,
      }], cartItem.name)
      setCustomizingItem(null)
      return
    }

    if (cartItem.menuItemId) {
      const addedFrom = bestSellerRef.current ? 'best_sellers' : upsellModalRef.current ? 'upsell_sheet' : 'menu'
      trackCartAdd({ menuItemId: cartItem.menuItemId, name: cartItem.name, price: cartItem.price, quantity: cartItem.quantity, hasCustomizations: true, source: addedFrom, locationId: location._id })
    }
    if (bestSellerRef.current && cartItem.menuItemId) {
      captureBestSellerAdded({ _id: cartItem.menuItemId, name: cartItem.name, price: cartItem.price })
    }
    const taggedItem: CartItem = bestSellerRef.current
      ? { ...cartItem, addedFrom: 'best_sellers' }
      : upsellModalRef.current
        ? { ...cartItem, addedFrom: 'upsell_sheet' }
        : cartItem
    setCart(prev => [...prev, taggedItem])
    setCustomizingItem(null)
    if (cartItem.menuItemId) {
      discoverHiddenReward(cartItem.menuItemId)
    }
    if (!skipUpsellRef.current && !upsellDismissedRef.current && cartItem.menuItemId) {
      const { items, source } = getSuggestions(categories, cart, cartItem.menuItemId, insights, 2, tenant.specialDates)
      if (items.length > 0) { setUpsellSuggestions(items); setUpsellSource(source) }
    }
    skipUpsellRef.current = false
    upsellModalRef.current = false
    bestSellerRef.current = false
  }

  function handleUpsellOpenModal(item: any) {
    setUpsellSuggestions([])
    skipUpsellRef.current = true
    upsellModalRef.current = true
    openCustomizationModal(item)
  }

  function removeFromCart(cartItemId: string) {
    const existing = cart.find(i => i.cartItemId === cartItemId)
    // cart_remove = el producto sale del carrito por completo
    // (si quantity > 1 este botón solo decrementa, no elimina)
    const fullyRemoved = !existing || existing.quantity <= 1
    setCart(prev => {
      const item = prev.find(i => i.cartItemId === cartItemId)
      if (item && item.quantity > 1) return prev.map(i => i.cartItemId === cartItemId ? { ...i, quantity: i.quantity - 1 } : i)
      return prev.filter(i => i.cartItemId !== cartItemId)
    })
    if (existing && fullyRemoved) {
      trackCartRemove({ menuItemId: existing.menuItemId, name: existing.name, quantity: existing.quantity, locationId: location._id })
    }
  }

  /**
   * Lookup exitoso del celular inline en el carrusel: identifica al miembro
   * en caliente y deja el teléfono precargado para que el CheckoutContext lo
   * reutilice (los premios del carrito sobreviven al checkout).
   */
  function handleMemberIdentified(m: IdentifiedMember) {
    const fullPhone = `${m.countryCode}${m.phoneDigits}`
    clubMembership.setMembership({
      name: m.name,
      phone: fullPhone,
      points: m.points,
      joinedAt: m.joinedAt,
    })
    saveClubPhoneForCheckout(tenant.slug, {
      countryCode: m.countryCode,
      phone: m.phoneDigits,
      name: m.name,
    })
    toast.success(m.name ? `¡Hola ${m.name}! Ya podés canjear tus puntos` : '¡Identificado! Ya podés canjear tus puntos')
  }

  /**
   * Agrega un premio de la tienda al carrito (línea $0 + costo en puntos).
   * El menú exige saldo suficiente para los premios ya en el carrito; el
   * Reward Advance se arma desde el picker del checkout (donde está la config).
   */
  function addRewardToCart(item: { _id: string; name: string; imageUrl?: string; pointsCost: number }) {
    if (isRewardInCart(cart, item._id)) {
      toast.info('Ya agregaste este premio a tu pedido')
      return
    }
    if (rewardLimitReached) {
      toast.error(checkoutRedemption.maxPerOrder === 1
        ? 'Solo podés canjear 1 premio por pedido'
        : `Podés canjear hasta ${checkoutRedemption.maxPerOrder} premios por pedido`)
      return
    }
    const projectedPoints = rewardPointsInCart + item.pointsCost
    // Validación con la MISMA regla compartida que el server
    // (evaluateRewardRedemption). El menú exige saldo completo: advanceLimit 0
    // porque el Reward Advance solo se arma desde el picker del checkout.
    if (projectedPoints > 0) {
      const decision = evaluateRewardRedemption({
        mode: 'checkout',
        pointsBalance: memberPoints,
        pointsRequired: projectedPoints,
        advanceLimit: 0,
        advanceMaxLimit: 0,
      })
      if (!decision.valid) {
        toast.error(
          decision.missingPoints
            ? `Te faltan ${decision.missingPoints} puntos para este premio`
            : decision.error || 'No podés canjear este premio con tu saldo actual'
        )
        return
      }
    }
    setCart(prev => addRewardLine(prev, item))
    playAddSound()
    trackRewardInteraction({
      rewardId: item._id,
      type: 'store_item',
      value: item.pointsCost,
      action: 'add_to_cart',
      locationId: location._id,
    })
    toast.success(`${item.name} agregado a tu pedido`)
  }

  function buildHalfPriceContext(item: any): typeof halfPriceContext {
    // Check if this item has a "Grande" variant — prerequisite for half-and-half
    const hasGrande = item.variants?.some((v: any) => v.name.toLowerCase() === 'grande' && v.price > 0)
    if (!hasGrande) return null

    // Find the category containing this item
    const itemCategoryId = item.categoryId ?? item._id
    let siblingItems: any[] = []
    for (const cat of categories) {
      const allCatItems = [
        ...(cat.items ?? []),
        ...(cat.subcategories ?? []).flatMap((s: any) => s.items ?? []),
      ]
      if (allCatItems.some((i: any) => String(i._id) === String(item._id))) {
        siblingItems = allCatItems
        break
      }
    }

    // Collect all items in the category that have a Grande variant with price > 0
    const hpItems = siblingItems
      .filter((i: any) => i.variants?.some((v: any) => v.name.toLowerCase() === 'grande' && v.price > 0))
      .map((i: any) => {
        const grande = i.variants.find((v: any) => v.name.toLowerCase() === 'grande')
        return { _id: i._id, name: i.name, grandePrice: grande.price as number }
      })

    if (hpItems.length < 2) return null
    return { isHalfAndHalf: true, halfPriceItems: hpItems }
  }

  function openCustomizationModal(item: any, categoryGroups?: any[], hpCtx?: typeof halfPriceContext) {
    setShowCart(false)
    const mergedGroups = [
      ...(categoryGroups ?? []),
      ...(item.customizationGroups ?? []),
    ]
    setCustomizingItem({ ...item, customizationGroups: mergedGroups })

    // Auto-detect half-price context if not explicitly provided
    const effectiveCtx = hpCtx ?? buildHalfPriceContext(item)
    setHalfPriceContext(effectiveCtx)
  }

  function goToCheckout() {
    if (navigatingRef.current) return
    navigatingRef.current = true

    if (!isOperational) {
      toast.info('Este local está en modo catálogo. Próximamente habilitaremos pedidos.')
      navigatingRef.current = false
      return
    }

    // Group session: don't go to checkout, items are added directly to session
    if (groupSessionToken) {
      toast.info('Estás en un pedido grupal. Los items se agregan directamente al pedido grupal.')
      navigatingRef.current = false
      return
    }

    sessionStorage.setItem(`cart_${tenant.slug}`, JSON.stringify(cart))
    sessionStorage.setItem('mode', mode)

    if (mode === 'business') {
      const corporateAccountId = sessionStorage.getItem('businessCorporateAccountId')
      const businessRole = sessionStorage.getItem('businessRole')
      const businessPaymentMode = sessionStorage.getItem('businessPaymentMode')
      sessionStorage.setItem('businessCorporateAccountId', corporateAccountId ?? '')
      sessionStorage.setItem('businessRole', businessRole ?? '')
      sessionStorage.setItem('businessPaymentMode', businessPaymentMode ?? '')
    }

    // Pre-checkout upsell: ítems destacados fuera del carrito sin grupos requeridos
    const cartIds = new Set(cart.map(i => i.menuItemId))
    const hints = categories
      .flatMap((cat: any) => [
        ...(cat.items ?? []),
        ...(cat.subcategories ?? []).flatMap((s: any) => s.items ?? [])
      ])
      .filter((i: any) =>
        i.isAvailable &&
        i.isFeatured &&
        !cartIds.has(String(i._id)) &&
        !(i.customizationGroups ?? []).some((g: any) => g.required)
      )
      .slice(0, 2)
    sessionStorage.setItem('upsellHints', JSON.stringify(hints))

    router.push(`/${tenant.slug}/menu/${location._id}/${mode}/checkout`)
  }

  function scrollTo(categoryId: string) {
    sectionRefs.current[categoryId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const totalItems = cart.reduce((sum, i) => sum + i.quantity, 0)
  const totalPrice = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
  // Total at list price (pre-discount). Equal to totalPrice when no cart item has a
  // higher list price (originalPrice) — struck-through price is then hidden.
  const originalTotal = cart.reduce((sum, i) => {
    const list = (mode === 'takeaway'
      ? (i.takeawayOriginalPrice ?? i.originalPrice)
      : i.originalPrice) ?? i.price
    return sum + (list > i.price ? list : i.price) * i.quantity
  }, 0)
  const savings = Math.max(0, originalTotal - totalPrice)

  function itemTotalQty(menuItemId: string) {
    return cart.filter(i => i.menuItemId === menuItemId).reduce((s, i) => s + i.quantity, 0)
  }

  const primary = branding.primaryColor
  const bg = branding.backgroundColor
  const text = branding.textColor
  const borderStyle = branding.borderRadius === 'sharp' ? '0px'
    : branding.borderRadius === 'pill' ? '16px' : '10px'

  function getAllCategoryItems(category: any): any[] {
    return [
      ...(category.items ?? []),
      ...(category.subcategories ?? []).flatMap((s: any) => s.items ?? []),
    ]
  }

  return (
    <div style={{ backgroundColor: bg, color: text }} className="min-h-screen">
      <Confetti ref={confettiRef} className="fixed top-0 left-0 z-50 pointer-events-none size-full" />
      {!isOperational && (
        <div className="sticky top-0 z-[100] w-full px-4 py-2 text-center text-[10px] font-black uppercase tracking-[0.2em] shadow-lg animate-in slide-in-from-top duration-500"
          style={{ backgroundColor: '#f59e0b', color: '#fff', paddingTop: 'max(8px, env(safe-area-inset-top, 0px))' }}>
          ✨ Modo Catálogo · Próximamente Takeaway en TakeasyGO
        </div>
      )}

      {/* ── Translating overlay ── */}
      {translating && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <div className="flex items-center gap-3 px-5 py-3 rounded-2xl font-semibold text-base text-white"
            style={{ backgroundColor: primary }}>
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            {t.translating}
          </div>
        </div>
      )}

      {/* ── Sticky Header ── */}
      <header className="sticky top-0 z-40 backdrop-blur-md border-b"
        style={{ backgroundColor: bg + 'ee', borderColor: primary + '20', paddingTop: 'env(safe-area-inset-top, 0px)' }}>

        {/* Top bar: logo + language toggle + cart button */}
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {branding.logoUrl
              ? <img src={branding.logoUrl} alt={tenant.name} className="h-8 object-contain" />
              : <span className="font-bold text-lg" style={{ color: primary }}>{tenant.name}</span>}
            <LocationBar tenantSlug={tenant.slug} location={location} />
          </div>
          <div className="flex items-center gap-3">
            {/* Language toggle */}
            <div className="flex items-center gap-1 text-xs font-bold select-none">
              <button
                onClick={() => handleLocaleToggle('es')}
                className="px-1.5 py-0.5 rounded transition-opacity"
                style={{ opacity: locale === 'es' ? 1 : 0.35, color: primary }}>
                ES
              </button>
              <span style={{ opacity: 0.25, color: text }}>|</span>
              <button
                onClick={() => handleLocaleToggle('en')}
                className="px-1.5 py-0.5 rounded transition-opacity"
                style={{ opacity: locale === 'en' ? 1 : 0.35, color: primary }}>
                EN
              </button>
            </div>
            <span className="text-xs opacity-40">{mode === 'takeaway' ? t.takeaway : mode === 'business' ? 'Business' : t.dineIn}</span>
            {totalItems > 0 && !likesOrderId && (
              <button
                ref={cartBtnRef}
                onClick={() => setShowCart(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl font-semibold text-base"
                style={{ backgroundColor: primary, color: bg }}>
                <ShoppingCart size={15} />
                <motion.span
                  key={totalItems}
                  initial={{ scale: 1 }}
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 0.25 }}
                >
                  {totalItems}
                </motion.span>
                <span className="hidden sm:inline">${toPesos(totalPrice).toLocaleString('es-AR')}</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Category nav: circular images ── */}
        <nav
          ref={navRef}
          className="border-t overflow-x-auto"
          style={{ borderColor: primary + '15', scrollbarWidth: 'none' }}>
          <div className="flex gap-5 px-4 py-3 min-w-max">
            {appStories.length > 0 && !isAdminCorp && (
              <button
                onClick={() => setShowAppStories(true)}
                className="flex flex-col items-center gap-1.5 flex-shrink-0 transition-opacity hover:opacity-80"
                style={{ opacity: 0.85 }}>
                <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center"
                  style={{ border: `2.5px solid ${primary}`, backgroundColor: primary + '15' }}>
                  <span className="text-[10px] font-bold" style={{ color: primary }}>TGO</span>
                </div>
                <span className="text-xs font-medium text-center leading-tight"
                  style={{ color: primary, maxWidth: '64px' }}>
                  TGO APP
                </span>
              </button>
            )}
            {promotions.length > 0 && !isAdminCorp && (
              <button
                onClick={() => setShowStories(true)}
                className="flex flex-col items-center gap-1.5 flex-shrink-0 transition-opacity hover:opacity-80"
                style={{ opacity: 0.85 }}>
                <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center"
                  style={{ border: `2.5px solid ${primary}`, backgroundColor: primary + '15' }}>
                  <span className="text-xl">🎬</span>
                </div>
                <span className="text-xs font-medium text-center leading-tight"
                  style={{ color: primary, maxWidth: '64px' }}>
                  Promociones
                </span>
              </button>
            )}
            {categories.map((cat: any) => {
              const isActive = activeCategory === cat._id
              return (
                <button
                  key={cat._id}
                  data-cat={cat._id}
                  onClick={() => scrollTo(cat._id)}
                  className="flex flex-col items-center gap-1.5 flex-shrink-0 transition-opacity"
                  style={{ opacity: isActive ? 1 : 0.55 }}>
                  <div
                    className="w-14 h-14 rounded-full overflow-hidden transition-all"
                    style={{
                      border: `2.5px solid ${isActive ? primary : primary + '25'}`,
                      boxShadow: isActive ? `0 0 0 2px ${primary}25` : 'none',
                    }}>
                    {cat.imageUrl
                      ? <Image src={cloudinaryUrl(cat.imageUrl, { w: 200 })} alt={tn(cat, 'name', locale)} width={56} height={56} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"
                          style={{ backgroundColor: primary + '12' }}>
                          <UtensilsCrossed size={18} style={{ color: primary + '60' }} />
                        </div>
                    }
                  </div>
                  <span
                    className="text-xs font-medium text-center leading-tight"
                    style={{
                      color: isActive ? primary : text + '70',
                      maxWidth: '64px',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    } as React.CSSProperties}>
                    {tn(cat, 'name', locale)}
                  </span>
                </button>
              )
            })}
          </div>
        </nav>
      </header>

      {/* Points sticky bar — positioned below header, accounts for other banners */}
      {!isAdminCorp && (
        <PointsStickyBar
          tenantSlug={tenant.slug}
          memberPoints={memberPoints}
          locationId={location._id}
        />
      )}

      {/* ── Order Lookup (top) ── */}
      <div className="max-w-2xl mx-auto px-4 pt-4">
        <OrderLookupByPhone tenantSlug={tenant.slug} />
      </div>

      {/* ── Main menu content ── */}
      <main className="max-w-2xl mx-auto px-4 pt-6"
        style={{ paddingBottom: 'calc(7rem + env(safe-area-inset-bottom, 0px))' }}>

        {likesOrderId && (
          <div className="mb-6 p-4 rounded-2xl text-center" style={{ backgroundColor: primary + '12' }}>
            <Heart size={20} className="inline-block mb-1" style={{ color: primary }} fill={primary} />
            <p className="font-bold text-sm" style={{ color: primary }}>¡Dale like a tus platos favoritos!</p>
            <p className="text-xs opacity-50 mt-0.5">Cada like ayuda a otros a descubrir los mejores platos</p>
          </div>
        )}

        {/* Featured strip — shown first so repeat customers reach products immediately */}
        {featuredItems.length > 0 && (
          <SectionContainer variant="default" sectionContainerColor={branding.sectionContainerColor}>
            <div className="px-4 py-3 border-b mb-3" style={{ borderColor: primary + '25', backgroundColor: primary + '10' }}>
              <p className="text-base font-semibold uppercase tracking-widest" style={{ color: primary }}>
                {t.featured}
              </p>
            </div>
            <div>
              {featuredItems.map((item: any) => {
                const veg = isVegetarian(item.tags || [])
                const catGroups = item._catGroups ?? []
                return (
                  <div key={item._id} className="flex items-center gap-3 px-4 py-3 border-b last:border-0 cursor-pointer active:scale-[0.99] transition-transform"
                    style={{ borderColor: primary + '12' }}
                    onClick={() => openCustomizationModal(item, catGroups)}>
                    {item.imageUrl
                      ? <Image src={cloudinaryUrl(item.imageUrl, { w: 200 })} alt={tn(item, 'name', locale)} width={56} height={56} className="w-14 h-14 object-cover rounded-xl flex-shrink-0 food-photo" placeholder="blur" blurDataURL={cloudinaryBlurUrl(item.imageUrl)} />
                      : <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: primary + '15' }}>
                          {veg ? <Leaf size={16} style={{ color: '#22c55e' }} /> : <UtensilsCrossed size={14} style={{ color: primary + '80' }} />}
                        </div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-base truncate">{tn(item, 'name', locale)}</p>
                      {item.description && <p className="text-sm opacity-70 truncate">{tn(item, 'description', locale)}</p>}
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="font-bold text-sm" style={{ color: primary }}>
                          ${toPesos(getItemPrice(item)).toLocaleString('es-AR')}
                        </span>
                        {(item.tags || []).map((tag: string) => (
                          <span key={tag} className="text-xs px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: primary + '15', color: primary }}>
                            {tag}
                          </span>
                        ))}
                        <LikeBadge count={item.likesCount ?? 0} variant="inline" />
                        {(item.likesCount ?? 0) >= 5 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">
                            Popular
                          </span>
                        )}
                      </div>
                    </div>
                    {likesOrderId ? (
                      <LikeButton itemId={item._id} likesCount={item.likesCount ?? 0} liked={likedItems.has(item._id)} loading={likesLoading.has(item._id)} onToggle={handleLikeToggle} primary={primary} />
                    ) : isOperational ? (
                      <CartControl item={item} cart={cart} onAdd={addPlainToCart} onOpenModal={(i) => openCustomizationModal(i, catGroups)} onRemove={removeFromCart} totalQty={itemTotalQty(item._id)} primary={primary} bg={bg} categoryGroups={catGroups} onFlyToCart={handleFlyToCart} />
                    ) : (
                      <div className="px-3 py-1.5 rounded-lg border border-dashed text-[10px] font-bold opacity-40" style={{ borderColor: primary }}>
                        CATÁLOGO
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </SectionContainer>
        )}

        {/* Promotions Section — hidden for company admin in business mode */}
        {promotions.length > 0 && !isAdminCorp && (
          <section className="mb-8 px-1">
            <div className="flex items-center gap-2 mb-4">
              <Tag size={18} style={{ color: primary }} strokeWidth={2.5} />
              <h2 className="text-base font-bold tracking-tight" style={{ color: text }}>Promociones</h2>
            </div>
            
            <PromotionCarousel
              promotions={[...featuredPromotions, ...regularPromotions]}
              tenantSlug={tenant.slug}
              restaurantName={tenant.name}
              locationId={location._id}
              onAdd={addPromotionToCart}
              primary={primary}
              bg={bg}
              textColor={text}
              mode="takeaway"
              typeLabels={tenant.promotionLabels}
              loyaltyMessaging={tenant.loyaltyMessaging}
            />
          </section>
        )}

        {/* Store Points Carousel — hidden for company admin in business mode */}
        {!isAdminCorp && (
          <StoreCarousel
            tenantSlug={tenant.slug}
            memberPoints={memberPoints}
            locationId={location._id}
            rewardEnabled={rewardCheckoutActive}
            rewardPointsAvailable={rewardPointsAvailable}
            rewardLimitReached={rewardLimitReached}
            cartRewardIds={rewardLines.map(r => r.storeItemId).filter((id): id is string => Boolean(id))}
            onAddReward={addRewardToCart}
            identifyEnabled={
              checkoutRedemption.enabled &&
              (!clubMembership.isMember || !clubMembership.phone) &&
              !clubMembership.loading
            }
            onMemberIdentified={handleMemberIdentified}
          />
        )}

        {/* Best Sellers */}
        {bestSellers && bestSellers.length > 0 && tenant.branding?.bestSellers?.showSection !== false && (
          <BestSellersSection
            bestSellers={bestSellers}
            styles={tenant.branding?.bestSellers}
            locationName={location.name}
            primaryColor={primary}
            mode={mode}
            onAdd={(item) => {
              bestSellerRef.current = true
              const enriched = categories.flatMap((c: any) => [
                ...(c.items ?? []),
                ...(c.subcategories ?? []).flatMap((s: any) => s.items ?? [])
              ]).find((i: any) => String(i._id) === item._id)
              if (enriched) {
                openCustomizationModal(enriched)
              }
            }}
          />
        )}

        {/* All categories */}
        {categories.map((category: any) => {
          const hasSubcategories = (category.subcategories ?? []).length > 0
          return (
            <section
              key={category._id}
              ref={el => { sectionRefs.current[category._id] = el }}
              className="mb-8 scroll-mt-44">
              <div className="mb-3 pb-2 border-b" style={{ borderColor: primary + '30' }}>
                <h2 className="text-xl font-bold tracking-widest uppercase" style={{ color: primary }}>
                  {tn(category, 'name', locale)}
                </h2>
                {tn(category, 'description', locale) && (
                  <p className="text-sm mt-1 italic" style={{ color: primary + 'aa' }}>
                    {tn(category, 'description', locale)}
                  </p>
                )}
              </div>

              <div className={isGridForTakeaway ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-0'}>
                {hasSubcategories ? (
                  <>
                    {category.items
                      .filter((item: any) => {
                        if (mode === 'business') return item.isAvailable && item.isBusinessAvailable && (!mounted || isAvailableNow(item.availabilityMode, item.availabilitySchedule))
                        return item.isAvailable && item.isTakeawayAvailable !== false && (!mounted || isAvailableNow(item.availabilityMode, item.availabilitySchedule))
                      })
                      .length > 0 && (
                      <>
                        <div className="col-span-full flex items-center gap-2 mb-2 mt-1">
                          <div className="h-px flex-1" style={{ backgroundColor: primary + '15' }} />
                        </div>
                        {category.items
                          .filter((item: any) => {
                            if (mode === 'business') return item.isAvailable && item.isBusinessAvailable && (!mounted || isAvailableNow(item.availabilityMode, item.availabilitySchedule))
                            return item.isAvailable && item.isTakeawayAvailable !== false && (!mounted || isAvailableNow(item.availabilityMode, item.availabilitySchedule))
                          })
                          .map((item: any) => {
                            const veg = isVegetarian(item.tags || [])
                            const qty = itemTotalQty(item._id)
                            const catGroups = category.customizationGroups ?? []

                            if (isGridForTakeaway) {
                              return (
                                <div key={item._id} className="relative border overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
                                  style={{ borderColor: primary + '20', borderRadius: borderStyle }}
                                   onClick={() => openCustomizationModal(item, catGroups)}>
                                   {item.imageUrl && (
                                     <Image src={cloudinaryUrl(item.imageUrl, { w: 500 })} alt={tn(item, 'name', locale)} width={500} height={200} className="w-full h-36 object-cover food-photo" placeholder="blur" blurDataURL={cloudinaryBlurUrl(item.imageUrl)} />
                                   )}
                                   <LikeBadge count={item.likesCount ?? 0} variant="overlay" />
                                   <div className="p-3">
                                     <div className="flex items-center gap-1.5 mb-1">
                                       {veg
                                         ? <Leaf size={11} className="flex-shrink-0" style={{ color: '#22c55e' }} />
                                         : <UtensilsCrossed size={11} className="flex-shrink-0" style={{ color: primary + '60' }} />}
                                       <p className="font-semibold text-base leading-tight">{tn(item, 'name', locale)}</p>
                                     </div>
                                     {item.description && (
                                       <p className="text-sm opacity-70 line-clamp-2 mb-1.5">{tn(item, 'description', locale)}</p>
                                     )}
                                     <div className="flex items-center justify-between">
                                       <p className="font-bold text-sm" style={{ color: primary }}>
                                         ${toPesos(getItemPrice(item)).toLocaleString('es-AR')}
                                       </p>
                                       {likesOrderId ? (
                                         <LikeButton itemId={item._id} likesCount={item.likesCount ?? 0} liked={likedItems.has(item._id)} loading={likesLoading.has(item._id)} onToggle={handleLikeToggle} primary={primary} />
                                       ) : isOperational ? (
                                         <CartControl item={item} cart={cart} onAdd={addPlainToCart} onOpenModal={(i) => openCustomizationModal(i, catGroups)} onRemove={removeFromCart} totalQty={qty} primary={primary} bg={bg} compact categoryGroups={catGroups} onFlyToCart={handleFlyToCart} />
                                       ) : (
                                         <span className="text-[9px] font-bold opacity-30">CATÁLOGO</span>
                                       )}
                                     </div>
                                   </div>
                                 </div>
                              )
                            }

                            return (
                              <div key={item._id}
                                className="flex items-center gap-3 py-3 border-b cursor-pointer active:scale-[0.99] transition-transform"
                                style={{ borderColor: primary + '12' }}
                                onClick={() => openCustomizationModal(item, catGroups)}>
                                {item.imageUrl
                                  ? <Image src={cloudinaryUrl(item.imageUrl, { w: 200 })} alt={tn(item, 'name', locale)} width={64} height={64} className="w-16 h-16 object-cover rounded-xl flex-shrink-0 food-photo" placeholder="blur" blurDataURL={cloudinaryBlurUrl(item.imageUrl)} />
                                  : <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                                      style={{ backgroundColor: primary + '10' }}>
                                      {veg
                                        ? <Leaf size={14} style={{ color: '#22c55e' }} />
                                        : <UtensilsCrossed size={13} style={{ color: primary + '60' }} />}
                                    </div>
                                }
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-base">{tn(item, 'name', locale)}</p>
                                  {item.description && (
                                    <p className="text-sm opacity-70 line-clamp-2 mt-0.5">{tn(item, 'description', locale)}</p>
                                  )}
                                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                    {(() => {
                                      const clubPrice = getClubDiscountedPrice(item, category._id)
                                      if (clubPrice) {
                                        return (
                                          <>
                                            <span className="text-xs line-through opacity-50 text-zinc-400">
                                              ${toPesos(clubPrice.original).toLocaleString('es-AR')}
                                            </span>
                                            <span className="font-bold text-sm text-green-600">
                                              ${toPesos(clubPrice.discounted).toLocaleString('es-AR')}
                                            </span>
                                          </>
                                        )
                                      }
                                      return (
                                        <span className="font-bold text-sm" style={{ color: primary }}>
                                          ${toPesos(getItemPrice(item)).toLocaleString('es-AR')}
                                        </span>
                                      )
                                    })()}
                                    {(item.tags || []).map((tag: string) => (
                                      <span key={tag} className="text-xs px-1.5 py-0.5 rounded-full"
                                        style={{ backgroundColor: primary + '10', color: primary + 'cc' }}>
                                        {tag}
                                      </span>
                                    ))}
                                    <LikeBadge count={item.likesCount ?? 0} variant="inline" />
                                    {(item.likesCount ?? 0) >= 5 && (
                                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">
                                        Popular
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {likesOrderId ? (
                                  <LikeButton itemId={item._id} likesCount={item.likesCount ?? 0} liked={likedItems.has(item._id)} loading={likesLoading.has(item._id)} onToggle={handleLikeToggle} primary={primary} />
                                ) : isOperational ? (
                                  <CartControl item={item} cart={cart} onAdd={addPlainToCart} onOpenModal={(i) => openCustomizationModal(i, catGroups)} onRemove={removeFromCart} totalQty={qty} primary={primary} bg={bg} categoryGroups={catGroups} onFlyToCart={handleFlyToCart} />
                                ) : (
                                  <div className="px-3 py-1.5 rounded-lg border border-dashed text-[10px] font-bold opacity-40" style={{ borderColor: primary }}>
                                    CATÁLOGO
                                  </div>
                                )}
                              </div>
                            )
                          })}
                      </>
                    )}

                    {(category.subcategories ?? [])
                      .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
                      .map((subcategory: any) => {
                        const subItems = subcategory.items.filter((item: any) => {
                          if (mode === 'business') return item.isAvailable && item.isBusinessAvailable && (!mounted || isAvailableNow(item.availabilityMode, item.availabilitySchedule))
                          return item.isAvailable && item.isTakeawayAvailable !== false && (!mounted || isAvailableNow(item.availabilityMode, item.availabilitySchedule))
                        })
                        if (subItems.length === 0) return null
                        return (
                          <div key={subcategory._id} className={isGridForTakeaway ? 'col-span-2 grid grid-cols-2 gap-3' : ''}>
                            <div className={isGridForTakeaway ? 'col-span-full flex items-center gap-2 mb-2 mt-4' : 'flex items-center gap-2 mb-2 mt-4'}>
                              <div className="h-px flex-1" style={{ backgroundColor: primary + '15' }} />
                              <span className="text-sm font-semibold uppercase tracking-wider" style={{ color: primary + 'cc' }}>
                                {tn(subcategory, 'name', locale)}
                              </span>
                              <div className="h-px flex-1" style={{ backgroundColor: primary + '15' }} />
                            </div>

                            {subItems.map((item: any) => {
                              const veg = isVegetarian(item.tags || [])
                              const qty = itemTotalQty(item._id)
                              const catGroups = category.customizationGroups ?? []

                              if (isGridForTakeaway) {
                                return (
                                  <div key={item._id} className="relative border overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
                                    style={{ borderColor: primary + '20', borderRadius: borderStyle }}
                                    onClick={() => openCustomizationModal(item, catGroups)}>
                                    {item.imageUrl && (
                                      <Image src={cloudinaryUrl(item.imageUrl, { w: 500 })} alt={tn(item, 'name', locale)} width={500} height={200} className="w-full h-36 object-cover food-photo" placeholder="blur" blurDataURL={cloudinaryBlurUrl(item.imageUrl)} />
                                    )}
                                    <LikeBadge count={item.likesCount ?? 0} variant="overlay" />
                                    <div className="p-3">
                                      <div className="flex items-center gap-1.5 mb-1">
                                        {veg
                                          ? <Leaf size={11} className="flex-shrink-0" style={{ color: '#22c55e' }} />
                                          : <UtensilsCrossed size={11} className="flex-shrink-0" style={{ color: primary + '60' }} />}
                                        <p className="font-semibold text-base leading-tight">{tn(item, 'name', locale)}</p>
                                      </div>
                                      {item.description && (
                                        <p className="text-sm opacity-70 line-clamp-2 mb-1.5">{tn(item, 'description', locale)}</p>
                                      )}
                                      <div className="flex items-center justify-between">
                                        {(() => {
                                          const clubPrice = getClubDiscountedPrice(item, category._id, subcategory._id)
                                          if (clubPrice) {
                                            return (
                                              <div className="flex items-center gap-1.5">
                                                <span className="text-xs line-through opacity-50 text-zinc-400">
                                                  ${toPesos(clubPrice.original).toLocaleString('es-AR')}
                                                </span>
                                                <span className="font-bold text-sm text-green-600">
                                                  ${toPesos(clubPrice.discounted).toLocaleString('es-AR')}
                                                </span>
                                              </div>
                                            )
                                          }
                                          return (
                                            <p className="font-bold text-sm" style={{ color: primary }}>
                                              ${toPesos(getItemPrice(item)).toLocaleString('es-AR')}
                                            </p>
                                          )
                                        })()}
                                        {likesOrderId ? (
                                          <LikeButton itemId={item._id} likesCount={item.likesCount ?? 0} liked={likedItems.has(item._id)} loading={likesLoading.has(item._id)} onToggle={handleLikeToggle} primary={primary} />
                                        ) : isOperational ? (
                                          <CartControl item={item} cart={cart} onAdd={addPlainToCart} onOpenModal={(i) => openCustomizationModal(i, catGroups)} onRemove={removeFromCart} totalQty={qty} primary={primary} bg={bg} compact categoryGroups={catGroups} onFlyToCart={handleFlyToCart} />
                                        ) : (
                                          <span className="text-[9px] font-bold opacity-30">CATÁLOGO</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )
                              }

                              return (
                                <div key={item._id}
                                  className="flex items-center gap-3 py-3 border-b cursor-pointer active:scale-[0.99] transition-transform"
                                  style={{ borderColor: primary + '12' }}
                                  onClick={() => openCustomizationModal(item, catGroups)}>
                                  {item.imageUrl
                                    ? <Image src={cloudinaryUrl(item.imageUrl, { w: 200 })} alt={tn(item, 'name', locale)} width={64} height={64} className="w-16 h-16 object-cover rounded-xl flex-shrink-0 food-photo" placeholder="blur" blurDataURL={cloudinaryBlurUrl(item.imageUrl)} />
                                    : <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                                        style={{ backgroundColor: primary + '10' }}>
                                        {veg
                                          ? <Leaf size={14} style={{ color: '#22c55e' }} />
                                          : <UtensilsCrossed size={13} style={{ color: primary + '60' }} />}
                                      </div>
                                  }
                                  <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-base">{tn(item, 'name', locale)}</p>
                                    {item.description && (
                                      <p className="text-sm opacity-70 line-clamp-2 mt-0.5">{tn(item, 'description', locale)}</p>
                                    )}
                                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                      {(() => {
                                        const clubPrice = getClubDiscountedPrice(item, category._id, subcategory._id)
                                        if (clubPrice) {
                                          return (
                                            <>
                                              <span className="text-xs line-through opacity-50 text-zinc-400">
                                                ${toPesos(clubPrice.original).toLocaleString('es-AR')}
                                              </span>
                                              <span className="font-bold text-sm text-green-600">
                                                ${toPesos(clubPrice.discounted).toLocaleString('es-AR')}
                                              </span>
                                            </>
                                          )
                                        }
                                        return (
                                          <span className="font-bold text-sm" style={{ color: primary }}>
                                            ${toPesos(getItemPrice(item)).toLocaleString('es-AR')}
                                          </span>
                                        )
                                      })()}
                                      {(item.tags || []).map((tag: string) => (
                                        <span key={tag} className="text-xs px-1.5 py-0.5 rounded-full"
                                          style={{ backgroundColor: primary + '10', color: primary + 'cc' }}>
                                          {tag}
                                        </span>
                                      ))}
                                      <LikeBadge count={item.likesCount ?? 0} variant="inline" />
                                      {(item.likesCount ?? 0) >= 5 && (
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">
                                          Popular
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {likesOrderId ? (
                                    <LikeButton itemId={item._id} likesCount={item.likesCount ?? 0} liked={likedItems.has(item._id)} loading={likesLoading.has(item._id)} onToggle={handleLikeToggle} primary={primary} />
                                  ) : isOperational ? (
                                    <CartControl item={item} cart={cart} onAdd={addPlainToCart} onOpenModal={(i) => openCustomizationModal(i, catGroups)} onRemove={removeFromCart} totalQty={qty} primary={primary} bg={bg} categoryGroups={catGroups} onFlyToCart={handleFlyToCart} />
                                  ) : (
                                    <div className="px-3 py-1.5 rounded-lg border border-dashed text-[10px] font-bold opacity-40" style={{ borderColor: primary }}>
                                      CATÁLOGO
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                  </>
                ) : (
                  category.items
                    .filter((item: any) => {
                      if (mode === 'business') return item.isAvailable && item.isBusinessAvailable && (!mounted || isAvailableNow(item.availabilityMode, item.availabilitySchedule))
                      return item.isAvailable && item.isTakeawayAvailable !== false && (!mounted || isAvailableNow(item.availabilityMode, item.availabilitySchedule))
                    })
                    .map((item: any) => {
                      const veg = isVegetarian(item.tags || [])
                      const qty = itemTotalQty(item._id)
                      const catGroups = category.customizationGroups ?? []

                      if (isGridForTakeaway) {
                        return (
                          <div key={item._id} className="relative border overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
                            style={{ borderColor: primary + '20', borderRadius: borderStyle }}
                            onClick={() => openCustomizationModal(item, catGroups)}>
                            {item.imageUrl && (
                              <Image src={cloudinaryUrl(item.imageUrl, { w: 500 })} alt={tn(item, 'name', locale)} width={500} height={200} className="w-full h-36 object-cover food-photo" placeholder="blur" blurDataURL={cloudinaryBlurUrl(item.imageUrl)} />
                            )}
                            <LikeBadge count={item.likesCount ?? 0} variant="overlay" />
                            <div className="p-3">
                              <div className="flex items-center gap-1.5 mb-1">
                                {veg
                                  ? <Leaf size={11} className="flex-shrink-0" style={{ color: '#22c55e' }} />
                                  : <UtensilsCrossed size={11} className="flex-shrink-0" style={{ color: primary + '60' }} />}
                                <p className="font-semibold text-base leading-tight">{tn(item, 'name', locale)}</p>
                              </div>
                              {item.description && (
                                <p className="text-sm opacity-70 line-clamp-2 mb-1.5">{tn(item, 'description', locale)}</p>
                              )}
                              <div className="flex items-center justify-between">
                                {(() => {
                                  const clubPrice = getClubDiscountedPrice(item, category._id)
                                  if (clubPrice) {
                                    return (
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs line-through opacity-50 text-zinc-400">
                                          ${toPesos(clubPrice.original).toLocaleString('es-AR')}
                                        </span>
                                        <span className="font-bold text-sm text-green-600">
                                          ${toPesos(clubPrice.discounted).toLocaleString('es-AR')}
                                        </span>
                                      </div>
                                    )
                                  }
                                  return (
                                    <p className="font-bold text-sm" style={{ color: primary }}>
                                      ${toPesos(getItemPrice(item)).toLocaleString('es-AR')}
                                    </p>
                                  )
                                })()}
                                {likesOrderId ? (
                                  <LikeButton itemId={item._id} likesCount={item.likesCount ?? 0} liked={likedItems.has(item._id)} loading={likesLoading.has(item._id)} onToggle={handleLikeToggle} primary={primary} />
                                ) : isOperational ? (
                                  <CartControl item={item} cart={cart} onAdd={addPlainToCart} onOpenModal={(i) => openCustomizationModal(i, catGroups)} onRemove={removeFromCart} totalQty={qty} primary={primary} bg={bg} compact categoryGroups={catGroups} onFlyToCart={handleFlyToCart} />
                                ) : (
                                  <span className="text-[9px] font-bold opacity-30">CATÁLOGO</span>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      }

                      return (
                        <div key={item._id}
                          className="flex items-center gap-3 py-3 border-b cursor-pointer active:scale-[0.99] transition-transform"
                          style={{ borderColor: primary + '12' }}
                          onClick={() => openCustomizationModal(item, catGroups)}>
                          {item.imageUrl
                            ? <Image src={cloudinaryUrl(item.imageUrl, { w: 200 })} alt={tn(item, 'name', locale)} width={64} height={64} className="w-16 h-16 object-cover rounded-xl flex-shrink-0 food-photo" placeholder="blur" blurDataURL={cloudinaryBlurUrl(item.imageUrl)} />
                            : <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ backgroundColor: primary + '10' }}>
                                {veg
                                  ? <Leaf size={14} style={{ color: '#22c55e' }} />
                                  : <UtensilsCrossed size={13} style={{ color: primary + '60' }} />}
                              </div>
                          }
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-base">{tn(item, 'name', locale)}</p>
                            {item.description && (
                              <p className="text-sm opacity-70 line-clamp-2 mt-0.5">{tn(item, 'description', locale)}</p>
                            )}
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {(() => {
                                const clubPrice = getClubDiscountedPrice(item, category._id)
                                if (clubPrice) {
                                  return (
                                    <>
                                      <span className="text-xs line-through opacity-50 text-zinc-400">
                                        ${toPesos(clubPrice.original).toLocaleString('es-AR')}
                                      </span>
                                      <span className="font-bold text-sm text-green-600">
                                        ${toPesos(clubPrice.discounted).toLocaleString('es-AR')}
                                      </span>
                                    </>
                                  )
                                }
                                return (
                                  <span className="font-bold text-sm" style={{ color: primary }}>
                                    ${toPesos(getItemPrice(item)).toLocaleString('es-AR')}
                                  </span>
                                )
                              })()}
                              {(item.tags || []).map((tag: string) => (
                                <span key={tag} className="text-xs px-1.5 py-0.5 rounded-full"
                                  style={{ backgroundColor: primary + '10', color: primary + 'cc' }}>
                                  {tag}
                                </span>
                              ))}
                              <LikeBadge count={item.likesCount ?? 0} variant="inline" />
                              {(item.likesCount ?? 0) >= 5 && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">
                                  Popular
                                </span>
                              )}
                            </div>
                          </div>
                          {likesOrderId ? (
                            <LikeButton itemId={item._id} likesCount={item.likesCount ?? 0} liked={likedItems.has(item._id)} loading={likesLoading.has(item._id)} onToggle={handleLikeToggle} primary={primary} />
                          ) : isOperational ? (
                            <CartControl item={item} cart={cart} onAdd={addPlainToCart} onOpenModal={(i) => openCustomizationModal(i, catGroups)} onRemove={removeFromCart} totalQty={qty} primary={primary} bg={bg} categoryGroups={catGroups} onFlyToCart={handleFlyToCart} />
                          ) : (
                            <div className="px-3 py-1.5 rounded-lg border border-dashed text-[10px] font-bold opacity-40" style={{ borderColor: primary }}>
                              CATÁLOGO
                            </div>
                          )}
                        </div>
                      )
                    })
                )}
              </div>
            </section>
          )
        })}
      </main>

      {/* ── End of Menu: Club + TGO Network ── */}
      <EndOfMenuSection
        tenantSlug={tenant.slug}
        tenantName={tenant.name}
        primaryColor={primary}
        bgDark="#1e293b"
        clubMembership={clubMembership}
        showClub={mounted && !isAdminCorp}
      />

      {/* ── Footer ── */}
      <footer style={{ backgroundColor: '#1e293b' }}>
        <div className="max-w-2xl mx-auto px-4 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <h4 className="font-bold text-base mb-4" style={{ color: primary }}>{t.contact}</h4>
              <div className="space-y-3">
                {location.address && (
                  <div className="flex items-start gap-2">
                    <MapPin size={14} style={{ color: primary, marginTop: 2, flexShrink: 0 }} />
                    <p className="text-sm" style={{ color: '#94a3b8' }}>{location.address}</p>
                  </div>
                )}
                {location.phone && (
                  <div className="flex items-center gap-2">
                    <Phone size={14} style={{ color: primary, flexShrink: 0 }} />
                    <p className="text-sm" style={{ color: '#94a3b8' }}>{location.phone}</p>
                  </div>
                )}
                {location.hours && (
                  <div className="flex items-center gap-2">
                    <Clock size={14} style={{ color: primary, flexShrink: 0 }} />
                    <p className="text-sm" style={{ color: '#94a3b8' }}>{location.hours}</p>
                  </div>
                )}
              </div>
            </div>
            {profile.about && (
              <div>
                <h4 className="font-bold text-base mb-4" style={{ color: primary }}>{t.ourStory}</h4>
                <p className="text-sm leading-relaxed" style={{ color: '#94a3b8' }}>{profile.about}</p>
              </div>
            )}
            {(profile.social?.instagram || profile.social?.facebook || profile.social?.twitter) && (
              <div>
                <h4 className="font-bold text-base mb-4" style={{ color: primary }}>{t.followUs}</h4>
                <div className="space-y-3">
                  {profile.social?.instagram && (
                    <a href={`https://instagram.com/${profile.social.instagram.replace('@', '')}`}
                      target="_blank" rel="noopener noreferrer" className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: primary }}>
                        <Instagram size={18} className="text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{tenant.name}</p>
                        <p className="text-xs" style={{ color: primary }}>{t.followIG}</p>
                      </div>
                    </a>
                  )}
                  {profile.social?.facebook && (
                    <a href={`https://facebook.com/${profile.social.facebook.replace('@', '')}`}
                      target="_blank" rel="noopener noreferrer" className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: primary }}>
                        <Facebook size={18} className="text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{tenant.name}</p>
                        <p className="text-xs" style={{ color: primary }}>{t.followFB}</p>
                      </div>
                    </a>
                  )}
                  {profile.social?.twitter && (
                    <a href={`https://twitter.com/${profile.social.twitter.replace('@', '')}`}
                      target="_blank" rel="noopener noreferrer" className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: primary }}>
                        <Twitter size={18} className="text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{tenant.name}</p>
                        <p className="text-xs" style={{ color: primary }}>{t.followTW}</p>
                      </div>
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t px-4 py-4 max-w-2xl mx-auto flex items-center justify-between gap-4"
          style={{ borderColor: primary + '20' }}>
          <p className="text-xs" style={{ color: '#475569' }}>
            © <span suppressHydrationWarning>{new Date().getFullYear()}</span> {tenant.name}. {t.rights}
          </p>
          <div className="flex items-center gap-3">
            <PoweredByTakeasy variant="dark" label="network" />
            <Link href={`/${tenant.slug}/admin`} className="opacity-20 hover:opacity-60 transition-opacity" title="Acceso administrador">
              <Settings size={14} style={{ color: '#94a3b8' }} />
            </Link>
          </div>
        </div>
      </footer>

      {/* ── Floating cart card ── */}
      {totalItems > 0 && !showCart && !likesOrderId && !customizingItem && upsellSuggestions.length === 0 && !promoSlotSelection && !translating && (
        <div className="fixed bottom-0 left-0 right-0 z-[70] pointer-events-none">
          <div
            className="max-w-2xl mx-auto pointer-events-auto"
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '24px 24px 0 0',
              boxShadow: '0 -4px 16px rgba(0,0,0,0.08)',
              padding: '16px 16px',
              paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent',
            }}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                {savings > 0 && (
                  <div
                    className="inline-block text-[11px] font-black px-2 py-0.5 rounded-full mb-1"
                    style={{ backgroundColor: '#dcfce7', color: '#15803d' }}>
                    🎉 {t.save} ${toPesos(savings).toLocaleString('es-AR')}
                  </div>
                )}
                {savings > 0 && (
                  <div className="text-[11px] leading-none text-neutral-400 line-through">
                    ${toPesos(originalTotal).toLocaleString('es-AR')}
                  </div>
                )}
                <div className="text-xl font-black leading-tight text-neutral-900">
                  ${toPesos(totalPrice).toLocaleString('es-AR')}
                </div>
                <div className="text-[11px] leading-tight text-neutral-500">
                  {totalItems} {totalItems === 1 ? t.product : t.products}
                </div>
              </div>
              <button
                onClick={goToCheckout}
                className="relative shrink-0 flex items-center justify-center font-bold text-sm"
                style={{
                  backgroundColor: primary,
                  color: '#FFFFFF',
                  minHeight: 44,
                  padding: '0 22px',
                  borderRadius: '999px',
                  touchAction: 'manipulation',
                  WebkitTapHighlightColor: 'transparent',
                }}>
                {t.viewOrder}
                <span
                  className="absolute -top-2.5 -right-1.5 flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black"
                  style={{ backgroundColor: '#FFFFFF', color: primary, boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }}>
                  {totalItems}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Customization Modal ── */}
      {customizingItem && (
        <CustomizationSheet
          item={{ ...customizingItem, price: getItemPrice(customizingItem), variants: customizingItem.variants ?? [] }}
          onConfirm={handleConfirmCustomization}
          onClose={() => {
            setCustomizingItem(null)
            setHalfPriceContext(null)
            bestSellerRef.current = false
          }}
          primaryColor={primary}
          bgColor={bg}
          textColor={text}
          mode={mode}
          hideQuantity={false}
          unitLabel={undefined}
          optionImageRegistry={menu.optionImageRegistry}
          isHalfAndHalf={halfPriceContext?.isHalfAndHalf ?? false}
          halfPriceItems={halfPriceContext?.halfPriceItems ?? []}
        />
      )}

      {/* ── Upsell Sheet ── */}
      {upsellSuggestions.length > 0 && (
        <UpsellSheet
          suggestions={upsellSuggestions}
          onAddPlain={(item) => { addPlainToCart(item, false, 'upsell_sheet'); setUpsellSuggestions([]) }}
          onOpenModal={handleUpsellOpenModal}
          onClose={() => { upsellDismissedRef.current = true; setUpsellSuggestions([]) }}
          primary={primary}
          bg={bg}
          text={text}
          locale={locale}
          source={upsellSource}
        />
      )}

      {/* ── Cart Drawer ── */}
      {showCart && !likesOrderId && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowCart(false)} />
          <div className="relative rounded-t-3xl p-6 max-h-[85dvh] overflow-y-auto"
            style={{ backgroundColor: bg, paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-lg">{t.yourOrder}</h3>
              <button onClick={() => setShowCart(false)} className="opacity-40 hover:opacity-70">
                <X size={20} style={{ color: text }} />
              </button>
            </div>
            <div className="space-y-3 mb-6">
              {cart.map(item => (
                <div key={item.cartItemId} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => removeFromCart(item.cartItemId)}
                        className="w-7 h-7 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: primary + '20', color: primary }}>
                        <Minus size={13} />
                      </button>
                      <span className="text-sm font-bold w-4 text-center">{item.quantity}</span>
                      {item.type !== 'reward' && item.customizations.length === 0 && (item.type !== 'promotion' || !!(item as any)._bundle) && (
                        <button onClick={() => {
                          if (item.type === 'promotion') {
                            // Bundle de promo: "+" = otro combo completo (price ya es promotion.price)
                            setCart(prev => prev.map(i => i.cartItemId === item.cartItemId ? { ...i, quantity: i.quantity + 1 } : i))
                            trackCartAdd({ promotionId: item.promotionId, name: item.name, price: item.price, quantity: 1, hasCustomizations: false, source: 'menu', locationId: location._id })
                          } else {
                            addPlainToCart(item)
                          }
                        }}
                          className="w-7 h-7 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: primary, color: bg }}>
                          <Plus size={13} />
                        </button>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {item.type === 'promotion' && (
                          <span className="text-[9px] font-black uppercase tracking-wider px-1 py-0.5 rounded leading-none"
                            style={{ backgroundColor: primary + '20', color: primary }}>
                            Promo
                          </span>
                        )}
                        {item.type === 'reward' && (
                          <span className="text-[9px] font-black uppercase tracking-wider px-1 py-0.5 rounded leading-none"
                            style={{ backgroundColor: primary + '20', color: primary }}>
                            Canje
                          </span>
                        )}
                        <span className="text-sm truncate block">{item.name}</span>
                      </div>
                      {item.type === 'reward' && item.pointsCost ? (
                        <span className="text-[10px] font-semibold block mt-0.5" style={{ color: primary }}>
                          Canje con {item.pointsCost} pts
                        </span>
                      ) : null}
                      {(item as any)._promotionShortDescription && (
                        <span className="text-[10px] opacity-40 truncate block italic">{(item as any)._promotionShortDescription}</span>
                      )}
                      {(item as any)._itemName && item.customizationSummary && (
                        <span className="text-xs opacity-50 truncate block">{(item as any)._itemName} · {item.customizationSummary}</span>
                      )}
                      {!(item as any)._itemName && item.customizationSummary && (
                        <span className="text-xs opacity-50 truncate block">{item.customizationSummary}</span>
                      )}
                      {!item.customizationSummary && item.selectedVariant && (
                        <span className="text-xs opacity-50 truncate block">{item.selectedVariant.name}</span>
                      )}
                      {(item as any)._itemName && !item.customizationSummary && !item.selectedVariant && (
                        <span className="text-xs opacity-50 truncate block">{(item as any)._itemName}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-bold flex-shrink-0">
                    ${toPesos(item.price * item.quantity).toLocaleString('es-AR')}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t pt-4 mb-5" style={{ borderColor: primary + '20' }}>
              <div className="flex justify-between font-bold text-lg">
                <span>{t.total}</span>
                <span style={{ color: primary }}>${toPesos(totalPrice).toLocaleString('es-AR')}</span>
              </div>
            </div>
            <button onClick={goToCheckout} className="w-full py-4 rounded-2xl font-bold text-base"
              style={{ backgroundColor: primary, color: bg }}>
              {t.confirm}
            </button>
          </div>
        </div>
      )}

      {/* ── Promo slot picker ── */}
      {promoSlotSelection && (() => {
        const { promo, slotStates, currentSlotIndex } = promoSlotSelection
        const allCompleted = promo.slots.every((_: any, idx: number) => slotStates[idx]?.completed)
        const currentSlot = promo.slots[currentSlotIndex]
        const currentState = slotStates[currentSlotIndex]

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60" onClick={() => setPromoSlotSelection(null)} />
            <div className="relative bg-background rounded-3xl w-full max-w-sm max-h-[85vh] overflow-y-auto p-6 border border-border">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-lg">{promo.title}</h3>
                  {promo.shortDescription && (
                    <p className="text-xs text-muted-foreground mt-0.5">{promo.shortDescription}</p>
                  )}
                </div>
                <button onClick={() => setPromoSlotSelection(null)} className="opacity-40 hover:opacity-70 ml-2 shrink-0">
                  <X size={20} />
                </button>
              </div>

              {/* Slot tabs */}
              <div className="flex gap-1 mb-4 overflow-x-auto">
                {promo.slots.map((slot: any, idx: number) => {
                  const state = slotStates[idx]
                  const isDone = state?.completed
                  const isCurrent = idx === currentSlotIndex
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setPromoSlotSelection(prev => prev ? { ...prev, currentSlotIndex: idx } : null)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all',
                        isCurrent
                          ? 'bg-primary text-white'
                          : isDone
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {slot.name || `Slot ${idx + 1}`} {isDone && '✓'}
                    </button>
                  )
                })}
              </div>

              {/* Current slot */}
              {currentSlot && currentState && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2 font-medium">
                    {currentSlot.name || 'Slot'} — elegí {currentSlot.requiredQuantity}
                  </p>
                  {currentState.selectedItems.length > 0 && (
                    <div className="mb-3 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">
                      {currentState.selectedItems.length} de {currentSlot.requiredQuantity} elegido{currentState.selectedItems.length !== 1 ? 's' : ''}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {(currentSlot.resolvedItems ?? []).map((item: any) => {
                      const isSelected = currentState.selectedItems.some((si: any) => si.itemId === item._id)
                      const isDisabled = !isSelected && currentState.selectedItems.length >= currentSlot.requiredQuantity
                      const slotMode: SlotCustomizationMode = resolveSlotCustomizationMode(currentSlot, promo.allowCustomization)
                      let effectiveSlotMode = slotMode
                      if (effectiveSlotMode === 'none') {
                        const hasVariants = (item.variants ?? []).length > 0
                        const hasRequiredGroups = (item.customizationGroups ?? []).filter((g: any) => g.required).length > 0
                        if (hasRequiredGroups) effectiveSlotMode = 'full'
                        else if (hasVariants) effectiveSlotMode = 'variant'
                      }
                      const slotHpItems = (currentSlot.resolvedItems ?? [])
                        .filter((i: any) => i.variants?.some((v: any) => v.name.toLowerCase() === 'grande' && v.price > 0))
                        .map((i: any) => {
                          const grande = i.variants.find((v: any) => v.name.toLowerCase() === 'grande')
                          return { _id: i._id, name: i.name, grandePrice: grande.price as number }
                        })
                      const isHalfSlot = slotHpItems.length >= 2
                      const halfCtx = isHalfSlot
                        ? { isHalfAndHalf: true, halfPriceItems: slotHpItems }
                        : undefined
                      return (
                        <button
                          key={item._id}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => {
                            if (effectiveSlotMode === 'full') {
                              openCustomizationModal({
                                ...item,
                                _promotionId: promo._id,
                                _promotionTitle: promo.title,
                                _itemName: item.name,
                                _slotName: currentSlot.name,
                                price: promo.price,
                                basePrice: promo.price,
                                isPromotion: true,
                                hideQuantity: true,
                                unitLabel: currentSlot.name,
                                variants: (item.variants ?? []).map((v: any) => ({
                                  ...v,
                                  price: promo.price,
                                  takeawayPrice: promo.price,
                                })),
                                customizationGroups: item.customizationGroups ?? [],
                              }, undefined, halfCtx)
                            } else if (effectiveSlotMode === 'variant') {
                              const availableVariants = (item.variants ?? []).map((v: any) => ({
                                ...v,
                                price: promo.price,
                                takeawayPrice: promo.price,
                              }))
                              if (availableVariants.length <= 1) {
                                const v = availableVariants[0]
                                const accepted = addPromoUnitToSlot({
                                  itemId: item._id,
                                  itemName: item.name,
                                  ...(v ? { selectedVariant: { name: v.name, price: v.price } } : {}),
                                  customizationSummary: v?.name || '',
                                })
                                if (accepted) {
                                  trackCartAdd({ menuItemId: item._id, name: v ? `${item.name} - ${v.name}` : item.name, price: promo.price, quantity: 1, hasCustomizations: false, source: 'menu', locationId: location._id })
                                  toast.success(`${item.name} seleccionado`)
                                } else {
                                  toast.info('Este paso ya está completo')
                                }
                              } else {
                                openCustomizationModal({
                                  ...item,
                                  _promotionId: promo._id,
                                  _promotionTitle: promo.title,
                                  _itemName: item.name,
                                  _slotName: currentSlot.name,
                                  price: promo.price,
                                  basePrice: promo.price,
                                  isPromotion: true,
                                  hideQuantity: true,
                                  unitLabel: currentSlot.name,
                                  variants: availableVariants,
                                  customizationGroups: [],
                                }, undefined, halfCtx)
                              }
                            } else {
                              const accepted = addPromoUnitToSlot({
                                itemId: item._id,
                                itemName: item.name,
                              })
                              if (accepted) {
                                trackCartAdd({ menuItemId: item._id, name: item.name, price: promo.price, quantity: 1, hasCustomizations: false, source: 'menu', locationId: location._id })
                                toast.success(`${item.name} seleccionado`)
                              } else {
                                toast.info('Este paso ya está completo')
                              }
                            }
                          }}
                          className={
                            'w-full text-left p-3 rounded-xl border transition-all ' +
                            (isSelected
                              ? 'border-emerald-200 bg-emerald-50 opacity-60'
                              : isDisabled
                                ? 'border-border opacity-30 cursor-not-allowed'
                                : 'border-border hover:border-primary/50 hover:bg-muted/30')
                          }
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold flex-1">{item.name}</span>
                            {isSelected && (
                              <span className="text-emerald-600 text-[10px] font-bold">✓ Elegido</span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Continue / Done button */}
              <button
                type="button"
                disabled={!allCompleted}
                onClick={() => confirmPromoBundle()}
                className={cn(
                  'w-full mt-4 py-2.5 rounded-xl font-bold text-sm transition-all',
                  allCompleted
                    ? 'bg-primary text-white'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                )}
                style={allCompleted && primary ? { backgroundColor: primary } : {}}
              >
                {allCompleted ? 'Listo, ir al pedido' : 'Completá todos los pasos'}
              </button>
            </div>
          </div>
        )
      })()}

      {showStories && !isAdminCorp && (
        <PromotionStories
          promotions={[...featuredPromotions, ...regularPromotions]}
          onClose={() => setShowStories(false)}
          primaryColor={primary}
          onAddToCart={addPromotionToCart}
          tenantSlug={tenant.slug}
        />
      )}

      {showAppStories && !isAdminCorp && (
        <AppStoryViewer
          stories={appStories}
          onClose={() => setShowAppStories(false)}
          primaryColor={primary}
        />
      )}

      {/* ── Geofence feedback ── */}
      <GeofenceFeedback tenantSlug={tenant.slug} />

      {/* ── Fly-to-cart animation ── */}
      {flyingItem && (
        <motion.div
          className="fixed z-[200] pointer-events-none"
          style={{
            left: flyingItem.startX,
            top: flyingItem.startY,
            width: flyingItem.startW,
            height: flyingItem.startH,
          }}
          initial={{ scale: 1, opacity: 1, x: 0, y: 0 }}
          animate={{
            scale: 0.35,
            opacity: 0.8,
            x: flyingItem.endX - flyingItem.startX,
            y: flyingItem.endY - flyingItem.startY,
          }}
          transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
          onAnimationComplete={() => setFlyingItem(null)}
        >
          <div className="w-full h-full rounded-full overflow-hidden" style={{ boxShadow: `0 0 8px ${primary}80` }}>
            {flyingItem.imageUrl ? (
              <img src={flyingItem.imageUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full" style={{ backgroundColor: primary }} />
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}

/* ── Cart control sub-component ── */
function CartControl({
  item, cart, onAdd, onOpenModal, onRemove, totalQty, primary, bg, compact = false, categoryGroups = [],
  onFlyToCart,
}: {
  item: any
  cart: CartItem[]
  onAdd: (item: any) => void
  onOpenModal: (item: any) => void
  onRemove: (cartItemId: string) => void
  totalQty: number
  primary: string
  bg: string
  compact?: boolean
  categoryGroups?: any[]
  onFlyToCart?: (item: any, rect: DOMRect) => void
}) {
  const [bounce, setBounce] = useState(false)
  const sz = compact ? 11 : 13
  const btnSz = compact ? 'w-6 h-6' : 'w-7 h-7'
  const hasVariants = (item.variants ?? []).length > 0
  const hasCustomizations = hasVariants || (item.customizationGroups ?? []).length > 0 || (categoryGroups ?? []).length > 0

  function handleAdd(e: React.MouseEvent) {
    e.stopPropagation()
    setBounce(true)
    setTimeout(() => setBounce(false), 300)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    onFlyToCart?.(item, rect)
    onAdd(item)
  }

  if (hasCustomizations) {
    if (compact) {
      return (
        <div className="relative flex-shrink-0">
          {totalQty > 0 && (
            <span
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center z-10"
              style={{ backgroundColor: primary, color: bg }}>
              {totalQty}
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onOpenModal(item); }}
            className={`${btnSz} rounded-full flex items-center justify-center flex-shrink-0 transition-transform`}
            style={{ backgroundColor: primary, color: bg, transform: bounce ? 'scale(1.3)' : 'scale(1)' }}>
            <Plus size={sz} />
          </button>
        </div>
      )
    }
    return (
      <div className="relative flex-shrink-0">
        {totalQty > 0 && (
          <span
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center z-10"
            style={{ backgroundColor: primary, color: bg }}>
            {totalQty}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onOpenModal(item); }}
          className="px-4 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 flex-shrink-0 transition-transform active:scale-95"
          style={{ backgroundColor: primary, color: bg, transform: bounce ? 'scale(1.05)' : 'scale(1)' }}>
          Agregar <Plus size={13} strokeWidth={2.5} />
        </button>
      </div>
    )
  }

  const plainId = `${item._id}:plain`
  const plainEntry = cart.find(i => i.cartItemId === plainId)

  if (plainEntry) {
    return (
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button onClick={(e) => { e.stopPropagation(); onRemove(plainId); }}
          className={`${btnSz} rounded-full flex items-center justify-center`}
          style={{ backgroundColor: primary + '20', color: primary }}>
          <Minus size={sz} />
        </button>
        <span className="text-sm font-bold w-4 text-center">{plainEntry.quantity}</span>
        <button onClick={handleAdd}
          className={`${btnSz} rounded-full flex items-center justify-center transition-transform`}
          style={{ backgroundColor: primary, color: bg, transform: bounce ? 'scale(1.3)' : 'scale(1)' }}>
          <Plus size={sz} />
        </button>
      </div>
    )
  }

  if (compact) {
    return (
      <button onClick={handleAdd}
        className={`${btnSz} rounded-full flex items-center justify-center flex-shrink-0 transition-transform`}
        style={{ backgroundColor: primary, color: bg, transform: bounce ? 'scale(1.3)' : 'scale(1)' }}>
        <Plus size={sz} />
      </button>
    )
  }

  return (
    <button onClick={handleAdd}
      className="px-4 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 flex-shrink-0 transition-transform active:scale-95"
      style={{ backgroundColor: primary, color: bg, transform: bounce ? 'scale(1.05)' : 'scale(1)' }}>
      Agregar <Plus size={13} strokeWidth={2.5} />
    </button>
  )
}

/* ── Like button sub-component ── */
function LikeButton({
  itemId, likesCount, liked, loading, onToggle, primary,
}: {
  itemId: string
  likesCount: number
  liked: boolean
  loading: boolean
  onToggle: (itemId: string) => void
  primary: string
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(itemId) }}
      disabled={loading}
      className="flex items-center gap-1 flex-shrink-0 transition-transform active:scale-110 disabled:opacity-50"
      title={liked ? 'Quitar like' : 'Dar like'}
    >
      <Heart
        size={18}
        className={loading ? 'animate-pulse' : ''}
        style={{ color: liked ? '#ef4444' : primary + '60' }}
        fill={liked ? '#ef4444' : 'transparent'}
      />
      {likesCount > 0 && (
        <span className="text-xs font-bold" style={{ color: primary + '80' }}>
          {likesCount}
        </span>
      )}
    </button>
  )
}
