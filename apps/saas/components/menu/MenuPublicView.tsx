'use client'

import { useState, useEffect, useRef, useSyncExternalStore, useCallback } from 'react'
import Link from 'next/link'
import {
  ShoppingCart, X, Plus, Minus, Leaf, UtensilsCrossed,
  Settings, MapPin, Phone, Clock, Instagram, Facebook, Twitter,
  Award, Wallet, Tag, Heart,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { CartItem } from '@/types/cart'
import type { ICoOccurrencePair } from '@/models/MenuInsights'
import PoweredByTakeasy from '@/components/PoweredByTakeasy'
import CustomizationModal from '@/components/menu/CustomizationModal'
import UpsellSheet from '@/components/menu/UpsellSheet'
import { PromotionCard, PromotionCarousel } from '@/components/menu/PromotionCard'
import StoreCarousel from '@/components/menu/StoreCarousel'
import GeofenceFeedback from '@/components/feedback/GeofenceFeedback'
import { isAvailableNow } from '@/lib/availability'
import BestSellersSection from '@/components/menu/BestSellersSection'
import { getSuggestions } from '@/lib/upsell-menu'
import { useNotificationSound } from '@/hooks/useNotificationSound'
import { useClubMembership } from '@/hooks/useClubMembership'
import { captureMenuOpened, captureDishAdded } from '@/lib/tia/events'
import { motion } from 'framer-motion'
import LocationBar from '@/components/menu/LocationBar'
import OrderLookupByPhone from '@/components/menu/OrderLookupByPhone'
import PromotionStories from '@/components/menu/PromotionStories'

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
      if (saved) {
        const parsed = JSON.parse(saved)
        return parsed.map((item: any) => ({
          ...item,
          type: item.type || (item.promotionId ? 'promotion' : 'menuItem'),
        }))
      }
    } catch {}
    return []
  })
  const [showCart, setShowCart] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string>('')
  const [customizingItem, setCustomizingItem] = useState<any | null>(null)
  const [upsellSuggestions, setUpsellSuggestions] = useState<any[]>([])
  const [insights, setInsights] = useState<ICoOccurrencePair[] | null>(null)
  const skipUpsellRef = useRef(false)
  const upsellModalRef = useRef(false)
  const upsellDismissedRef = useRef(false)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const navRef = useRef<HTMLDivElement>(null)
  const { play: playAddSound } = useNotificationSound('/pop.mp3')
  const [flyingItem, setFlyingItem] = useState<{
    startX: number; startY: number; startW: number; startH: number
    endX: number; endY: number
    imageUrl?: string
  } | null>(null)
  const cartBtnRef = useRef<HTMLButtonElement>(null)
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
  const [promoItemSelection, setPromoItemSelection] = useState<{
    promo: any
    items: any[]
    completedItemIds: string[]
  } | null>(null)

  const [promoQtyInput, setPromoQtyInput] = useState<{
    item: any
    promotion: any
  } | null>(null)

  const [promoUnitFlow, setPromoUnitFlow] = useState<{
    item: any
    promotion: any
    totalUnits: number
    currentUnit: number
  } | null>(null)

  const [promoQtyValue, setPromoQtyValue] = useState(1)

  const [likesOrderId, setLikesOrderId] = useState<string | null>(null)
  const [likesToken, setLikesToken] = useState<string | null>(null)
  const [likedItems, setLikedItems] = useState<Set<string>>(new Set())
  const [likesLoading, setLikesLoading] = useState<Set<string>>(new Set())
  const [showStories, setShowStories] = useState(false)

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
    captureMenuOpened(location._id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const clubMembership = useClubMembership(tenant.slug)

  // Sincronizar memberPoints desde el hook para StoreCarousel
  useEffect(() => {
    if (clubMembership.isMember) {
      setMemberPoints(clubMembership.points)
    }
  }, [clubMembership.isMember, clubMembership.points])

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
    const direct = cat.items.filter((i: any) => {
      if (mode === 'business') return i.isFeatured && i.isBusinessAvailable && i.businessPrice != null
      return i.isFeatured
    })
    const sub = (cat.subcategories ?? []).flatMap((sub: any) =>
      sub.items.filter((i: any) => {
        if (mode === 'business') return i.isFeatured && i.isBusinessAvailable && i.businessPrice != null
        return i.isFeatured
      })
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
    if (hasVariants) {
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
      const suggestions = getSuggestions(categories, cart, String(item._id), insights)
      if (suggestions.length > 0) setUpsellSuggestions(suggestions)
    }
    captureDishAdded({ _id: item._id, name: item.name, price: getItemPrice(item) }, 1, false)
    // Momento 01: feedback de posesión
    playAddSound()
    if (navigator.vibrate) navigator.vibrate(50)
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
    // Determine linked items: nuevo array linkedItems o legacy linkedItem
    const linkedItems = promotion.linkedItems || (promotion.linkedItem ? [promotion.linkedItem] : [])

    // Edge case: overrideCustomizationGroups without linked items
    if (linkedItems.length === 0 && (promotion.overrideCustomizationGroups?.length ?? 0) > 0) {
      const virtualItem = {
        _id: `override:${promotion._id}`,
        name: promotion.title,
        price: promotion.price,
        basePrice: promotion.price,
        isPromotion: true,
        _promotionId: promotion._id,
        _promotionTitle: promotion.title,
        _itemName: promotion.title,
        customizationGroups: promotion.overrideCustomizationGroups.map((g: any, i: number) => ({
          ...g,
          _id: g._id || `og_${i}`,
        })),
      }
      openCustomizationModal(virtualItem)
      return
    }

    const itemsWithCustomizations = linkedItems.filter(
      (li: any) => (li.customizationGroups?.length ?? 0) > 0 || (li.variants?.length ?? 0) > 0
    )

    if (itemsWithCustomizations.length === 0 || promotion.allowCustomization === false) {
      // Sin customizaciones (o deshabilitadas) — agregar directo
      const promoId = `promo:${promotion._id}`
      setCart(prev => {
        const existing = prev.find(i => i.cartItemId === promoId)
        if (existing) return prev.map(i => i.cartItemId === promoId ? { ...i, quantity: i.quantity + 1 } : i)
        return [...prev, {
          cartItemId: promoId,
          promotionId: promotion._id,
          name: promotion.title,
          basePrice: promotion.price,
          extraPrice: 0,
          price: promotion.price,
          quantity: 1,
          customizations: [],
          customizationSummary: '',
          addedFrom: 'menu',
          type: 'promotion',
        }]
      })
      toast.success(`${promotion.title} agregado al pedido`)
      return
    }

    // Un solo item — preguntar cantidad primero, luego personalizar una por una
    if (itemsWithCustomizations.length === 1) {
      const item = itemsWithCustomizations[0]
      setPromoQtyInput({ item, promotion })
      return
    }

    // Múltiples items — mostrar selector con info de la promo
    setPromoItemSelection({
      promo: promotion,
      items: itemsWithCustomizations,
      completedItemIds: [],
    })
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
      const promoId = (cartItem as any)._promotionId
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

      if (promoUnitFlow) {
        // Per-unit flow: each unit is a separate cart item with unique ID
        const unitId = `promo:${promoId}:${itemName.replace(/\s+/g, '_')}:unit${promoUnitFlow.currentUnit}:${Date.now()}`
        const enrichedSummary = itemName && cartItem.customizationSummary
          ? `${itemName} · ${cartItem.customizationSummary}`
          : itemName || cartItem.customizationSummary || ''
        const taggedItem: CartItem = {
          ...cartItem,
          cartItemId: unitId,
          promotionId: promoId,
          quantity: 1,
          name: (cartItem as any)._promotionTitle,
          customizationSummary: enrichedSummary,
          type: 'promotion',
          addedFrom: 'menu',
        }
        if (cartItem.menuItemId) {
          captureDishAdded({ _id: cartItem.menuItemId, name: itemName, price: cartItem.price }, 1, true)
        }
        setCart(prev => [...prev, taggedItem])
        setCustomizingItem(null)

        if (promoUnitFlow.currentUnit < promoUnitFlow.totalUnits) {
          // Advance to next unit
          setPromoUnitFlow(prev => prev ? { ...prev, currentUnit: prev.currentUnit + 1 } : null)
          toast.success(`${itemName} unidad ${promoUnitFlow.currentUnit} de ${promoUnitFlow.totalUnits} agregada`)
        } else {
          // All units done
          setPromoUnitFlow(null)
          toast.success(`${promoUnitFlow.totalUnits} × ${itemName} agregados a ${(cartItem as any)._promotionTitle}`)
        }
        return
      }

      const uniqueId = `promo:${promoId}:${itemName.replace(/\s+/g, '_') || Date.now()}`
      // Incluir nombre del item en el summary para que viaje hasta la DB y el print agent
      const enrichedSummary = itemName && cartItem.customizationSummary
        ? `${itemName} · ${cartItem.customizationSummary}`
        : itemName || cartItem.customizationSummary || ''
      const taggedItem: CartItem = {
        ...cartItem,
        cartItemId: uniqueId,
        promotionId: promoId,
        name: (cartItem as any)._promotionTitle,
        customizationSummary: enrichedSummary,
        type: 'promotion',
        addedFrom: 'menu',
      }
      if (cartItem.menuItemId) {
        captureDishAdded({ _id: cartItem.menuItemId, name: itemName, price: cartItem.price }, cartItem.quantity, true)
      }
      setCart(prev => {
        const existing = prev.find(i => i.cartItemId === uniqueId)
        if (existing) return prev.map(i => i.cartItemId === uniqueId ? { ...i, quantity: i.quantity + 1 } : i)
        return [...prev, taggedItem]
      })
      setCustomizingItem(null)
      // Keep picker open for multi-item selection — mark item as completed
      if (promoItemSelection) {
        const itemId = (cartItem as any)._id || itemName
        setPromoItemSelection(prev => prev ? {
          ...prev,
          completedItemIds: [...prev.completedItemIds, itemId],
        } : null)
      }
      toast.success(`${itemName} agregado a ${(cartItem as any)._promotionTitle}`)
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
      captureDishAdded({ _id: cartItem.menuItemId, name: cartItem.name, price: cartItem.price }, cartItem.quantity, true)
    }
    const taggedItem: CartItem = upsellModalRef.current
      ? { ...cartItem, addedFrom: 'upsell_sheet' }
      : cartItem
    setCart(prev => [...prev, taggedItem])
    setCustomizingItem(null)
    if (!skipUpsellRef.current && !upsellDismissedRef.current && cartItem.menuItemId) {
      const suggestions = getSuggestions(categories, cart, cartItem.menuItemId, insights)
      if (suggestions.length > 0) setUpsellSuggestions(suggestions)
    }
    skipUpsellRef.current = false
    upsellModalRef.current = false
  }

  function handleUpsellOpenModal(item: any) {
    setUpsellSuggestions([])
    skipUpsellRef.current = true
    upsellModalRef.current = true
    openCustomizationModal(item)
  }

  function removeFromCart(cartItemId: string) {
    setCart(prev => {
      const existing = prev.find(i => i.cartItemId === cartItemId)
      if (existing && existing.quantity > 1) return prev.map(i => i.cartItemId === cartItemId ? { ...i, quantity: i.quantity - 1 } : i)
      return prev.filter(i => i.cartItemId !== cartItemId)
    })
  }

  function openCustomizationModal(item: any, categoryGroups?: any[]) {
    setShowCart(false)
    const mergedGroups = [
      ...(categoryGroups ?? []),
      ...(item.customizationGroups ?? []),
    ]
    setCustomizingItem({ ...item, customizationGroups: mergedGroups })
  }

  function goToCheckout() {
    if (!isOperational) {
      toast.info('Este local está en modo catálogo. Próximamente habilitaremos pedidos.')
      return
    }

    // Group session: don't go to checkout, items are added directly to session
    if (groupSessionToken) {
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
      {!isOperational && (
        <div className="sticky top-0 z-[100] w-full px-4 py-2 text-center text-[10px] font-black uppercase tracking-[0.2em] shadow-lg animate-in slide-in-from-top duration-500"
          style={{ backgroundColor: '#f59e0b', color: '#fff' }}>
          ✨ Modo Catálogo · Próximamente Takeaway en TakeasyGO
        </div>
      )}

      {/* ── Translating overlay ── */}
      {translating && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <div className="flex items-center gap-3 px-5 py-3 rounded-2xl font-semibold text-sm text-white"
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
        style={{ backgroundColor: bg + 'ee', borderColor: primary + '20' }}>

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
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl font-semibold text-sm"
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
                <span className="hidden sm:inline">${totalPrice.toLocaleString('es-AR')}</span>
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
                      ? <img src={cat.imageUrl} alt={tn(cat, 'name', locale)} className="w-full h-full object-cover" />
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

      {/* ── Main menu content ── */}
      <main className="max-w-2xl mx-auto px-4 pt-6 pb-10">

        {likesOrderId && (
          <div className="mb-6 p-4 rounded-2xl text-center" style={{ backgroundColor: primary + '12' }}>
            <Heart size={20} className="inline-block mb-1" style={{ color: primary }} fill={primary} />
            <p className="font-bold text-sm" style={{ color: primary }}>¡Dale like a tus platos favoritos!</p>
            <p className="text-xs opacity-50 mt-0.5">Cada like ayuda a otros a descubrir los mejores platos</p>
          </div>
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
        {!isAdminCorp && <StoreCarousel tenantSlug={tenant.slug} memberPoints={memberPoints} locationId={location._id} />}

        {/* Featured strip at top */}
        {featuredItems.length > 0 && (
          <section className="mb-8 rounded-2xl overflow-hidden border" style={{ borderColor: primary + '25' }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: primary + '25', backgroundColor: primary + '10' }}>
              <p className="text-md font-semibold uppercase tracking-widest" style={{ color: primary }}>
                {t.featured}
              </p>
            </div>
            <div>
              {featuredItems.map((item: any) => {
                const veg = isVegetarian(item.tags || [])
                return (
                  <div key={item._id} className="flex items-center gap-3 px-4 py-3 border-b last:border-0 cursor-pointer active:scale-[0.99] transition-transform"
                    style={{ borderColor: primary + '12' }}
                    onClick={() => openCustomizationModal(item)}>
                    {item.imageUrl
                      ? <img src={item.imageUrl} alt={tn(item, 'name', locale)} className="w-14 h-14 object-cover rounded-xl flex-shrink-0" />
                      : <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: primary + '15' }}>
                          {veg ? <Leaf size={16} style={{ color: '#22c55e' }} /> : <UtensilsCrossed size={14} style={{ color: primary + '80' }} />}
                        </div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{tn(item, 'name', locale)}</p>
                      {item.description && <p className="text-md opacity-50 truncate">{tn(item, 'description', locale)}</p>}
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="font-bold text-sm" style={{ color: primary }}>
                          ${getItemPrice(item).toLocaleString('es-AR')}
                        </span>
                        {(item.tags || []).map((tag: string) => (
                          <span key={tag} className="text-xs px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: primary + '15', color: primary }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    {likesOrderId ? (
                      <LikeButton itemId={item._id} likesCount={item.likesCount ?? 0} liked={likedItems.has(item._id)} loading={likesLoading.has(item._id)} onToggle={handleLikeToggle} primary={primary} />
                    ) : isOperational ? (
                      <CartControl item={item} cart={cart} onAdd={addPlainToCart} onOpenModal={openCustomizationModal} onRemove={removeFromCart} totalQty={itemTotalQty(item._id)} primary={primary} bg={bg} onFlyToCart={handleFlyToCart} />
                    ) : (
                      <div className="px-3 py-1.5 rounded-lg border border-dashed text-[10px] font-bold opacity-40" style={{ borderColor: primary }}>
                        CATÁLOGO
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Best Sellers */}
        {bestSellers && bestSellers.length > 0 && tenant.branding?.bestSellers?.showSection !== false && (
          <BestSellersSection
            bestSellers={bestSellers}
            styles={tenant.branding?.bestSellers}
            locationName={location.name}
            primaryColor={primary}
            onAdd={(item) => {
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
                <h2 className="text-xs font-bold tracking-widest uppercase" style={{ color: primary }}>
                  {tn(category, 'name', locale)}
                </h2>
                {tn(category, 'description', locale) && (
                  <p className="text-xs mt-1 italic" style={{ color: primary + 'aa' }}>
                    {tn(category, 'description', locale)}
                  </p>
                )}
              </div>

              <div className={isGridForTakeaway ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-0'}>
                {hasSubcategories ? (
                  <>
                    {category.items
                      .filter((item: any) => {
                        if (mode === 'business') return item.isAvailable && item.isBusinessAvailable && item.businessPrice != null && (!mounted || isAvailableNow(item.availabilityMode, item.availabilitySchedule))
                        return item.isAvailable && item.isTakeawayAvailable !== false && (!mounted || isAvailableNow(item.availabilityMode, item.availabilitySchedule))
                      })
                      .length > 0 && (
                      <>
                        <div className="col-span-full flex items-center gap-2 mb-2 mt-1">
                          <div className="h-px flex-1" style={{ backgroundColor: primary + '15' }} />
                        </div>
                        {category.items
                          .filter((item: any) => {
                            if (mode === 'business') return item.isAvailable && item.isBusinessAvailable && item.businessPrice != null && (!mounted || isAvailableNow(item.availabilityMode, item.availabilitySchedule))
                            return item.isAvailable && item.isTakeawayAvailable !== false && (!mounted || isAvailableNow(item.availabilityMode, item.availabilitySchedule))
                          })
                          .map((item: any) => {
                            const veg = isVegetarian(item.tags || [])
                            const qty = itemTotalQty(item._id)
                            const catGroups = category.customizationGroups ?? []

                            if (isGridForTakeaway) {
                              return (
                                <div key={item._id} className="border overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
                                  style={{ borderColor: primary + '20', borderRadius: borderStyle }}
                                  onClick={() => openCustomizationModal(item, catGroups)}>
                                  {item.imageUrl && (
                                    <img src={item.imageUrl} alt={tn(item, 'name', locale)} className="w-full h-28 object-cover" />
                                  )}
                                  <div className="p-3">
                                    <div className="flex items-center gap-1.5 mb-1">
                                      {veg
                                        ? <Leaf size={11} className="flex-shrink-0" style={{ color: '#22c55e' }} />
                                        : <UtensilsCrossed size={11} className="flex-shrink-0" style={{ color: primary + '60' }} />}
                                      <p className="font-semibold text-xs leading-tight">{tn(item, 'name', locale)}</p>
                                    </div>
                                    {item.description && (
                                      <p className="text-xs opacity-40 line-clamp-2 mb-1.5">{tn(item, 'description', locale)}</p>
                                    )}
                                    <div className="flex items-center justify-between">
                                      <p className="font-bold text-sm" style={{ color: primary }}>
                                        ${getItemPrice(item).toLocaleString('es-AR')}
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
                                  ? <img src={item.imageUrl} alt={tn(item, 'name', locale)} className="w-16 h-16 object-cover rounded-xl flex-shrink-0" />
                                  : <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                                      style={{ backgroundColor: primary + '10' }}>
                                      {veg
                                        ? <Leaf size={14} style={{ color: '#22c55e' }} />
                                        : <UtensilsCrossed size={13} style={{ color: primary + '60' }} />}
                                    </div>
                                }
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-sm">{tn(item, 'name', locale)}</p>
                                  {item.description && (
                                    <p className="text-xs opacity-50 line-clamp-2 mt-0.5">{tn(item, 'description', locale)}</p>
                                  )}
                                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                    <span className="font-bold text-sm" style={{ color: primary }}>
                                      ${getItemPrice(item).toLocaleString('es-AR')}
                                    </span>
                                    {(item.tags || []).map((tag: string) => (
                                      <span key={tag} className="text-xs px-1.5 py-0.5 rounded-full"
                                        style={{ backgroundColor: primary + '10', color: primary + 'cc' }}>
                                        {tag}
                                      </span>
                                    ))}
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
                          if (mode === 'business') return item.isAvailable && item.isBusinessAvailable && item.businessPrice != null && (!mounted || isAvailableNow(item.availabilityMode, item.availabilitySchedule))
                          return item.isAvailable && item.isTakeawayAvailable !== false && (!mounted || isAvailableNow(item.availabilityMode, item.availabilitySchedule))
                        })
                        if (subItems.length === 0) return null
                        return (
                          <div key={subcategory._id} className={isGridForTakeaway ? 'col-span-2' : ''}>
                            <div className="flex items-center gap-2 mb-2 mt-4">
                              <div className="h-px flex-1" style={{ backgroundColor: primary + '15' }} />
                              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: primary + 'cc' }}>
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
                                  <div key={item._id} className="border overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
                                    style={{ borderColor: primary + '20', borderRadius: borderStyle }}
                                    onClick={() => openCustomizationModal(item, catGroups)}>
                                    {item.imageUrl && (
                                      <img src={item.imageUrl} alt={tn(item, 'name', locale)} className="w-full h-28 object-cover" />
                                    )}
                                    <div className="p-3">
                                      <div className="flex items-center gap-1.5 mb-1">
                                        {veg
                                          ? <Leaf size={11} className="flex-shrink-0" style={{ color: '#22c55e' }} />
                                          : <UtensilsCrossed size={11} className="flex-shrink-0" style={{ color: primary + '60' }} />}
                                        <p className="font-semibold text-xs leading-tight">{tn(item, 'name', locale)}</p>
                                      </div>
                                      {item.description && (
                                        <p className="text-xs opacity-40 line-clamp-2 mb-1.5">{tn(item, 'description', locale)}</p>
                                      )}
                                      <div className="flex items-center justify-between">
                                        <p className="font-bold text-sm" style={{ color: primary }}>
                                          ${getItemPrice(item).toLocaleString('es-AR')}
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
                                    ? <img src={item.imageUrl} alt={tn(item, 'name', locale)} className="w-16 h-16 object-cover rounded-xl flex-shrink-0" />
                                    : <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                                        style={{ backgroundColor: primary + '10' }}>
                                        {veg
                                          ? <Leaf size={14} style={{ color: '#22c55e' }} />
                                          : <UtensilsCrossed size={13} style={{ color: primary + '60' }} />}
                                      </div>
                                  }
                                  <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-sm">{tn(item, 'name', locale)}</p>
                                    {item.description && (
                                      <p className="text-xs opacity-50 line-clamp-2 mt-0.5">{tn(item, 'description', locale)}</p>
                                    )}
                                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                      <span className="font-bold text-sm" style={{ color: primary }}>
                                        ${getItemPrice(item).toLocaleString('es-AR')}
                                      </span>
                                      {(item.tags || []).map((tag: string) => (
                                        <span key={tag} className="text-xs px-1.5 py-0.5 rounded-full"
                                          style={{ backgroundColor: primary + '10', color: primary + 'cc' }}>
                                          {tag}
                                        </span>
                                      ))}
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
                      if (mode === 'business') return item.isAvailable && item.isBusinessAvailable && item.businessPrice != null && (!mounted || isAvailableNow(item.availabilityMode, item.availabilitySchedule))
                      return item.isAvailable && item.isTakeawayAvailable !== false && (!mounted || isAvailableNow(item.availabilityMode, item.availabilitySchedule))
                    })
                    .map((item: any) => {
                      const veg = isVegetarian(item.tags || [])
                      const qty = itemTotalQty(item._id)
                      const catGroups = category.customizationGroups ?? []

                      if (isGridForTakeaway) {
                        return (
                          <div key={item._id} className="border overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
                            style={{ borderColor: primary + '20', borderRadius: borderStyle }}
                            onClick={() => openCustomizationModal(item, catGroups)}>
                            {item.imageUrl && (
                              <img src={item.imageUrl} alt={tn(item, 'name', locale)} className="w-full h-28 object-cover" />
                            )}
                            <div className="p-3">
                              <div className="flex items-center gap-1.5 mb-1">
                                {veg
                                  ? <Leaf size={11} className="flex-shrink-0" style={{ color: '#22c55e' }} />
                                  : <UtensilsCrossed size={11} className="flex-shrink-0" style={{ color: primary + '60' }} />}
                                <p className="font-semibold text-xs leading-tight">{tn(item, 'name', locale)}</p>
                              </div>
                              {item.description && (
                                <p className="text-xs opacity-40 line-clamp-2 mb-1.5">{tn(item, 'description', locale)}</p>
                              )}
                              <div className="flex items-center justify-between">
                                <p className="font-bold text-sm" style={{ color: primary }}>
                                  ${getItemPrice(item).toLocaleString('es-AR')}
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
                            ? <img src={item.imageUrl} alt={tn(item, 'name', locale)} className="w-16 h-16 object-cover rounded-xl flex-shrink-0" />
                            : <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ backgroundColor: primary + '10' }}>
                                {veg
                                  ? <Leaf size={14} style={{ color: '#22c55e' }} />
                                  : <UtensilsCrossed size={13} style={{ color: primary + '60' }} />}
                              </div>
                          }
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm">{tn(item, 'name', locale)}</p>
                            {item.description && (
                              <p className="text-xs opacity-50 line-clamp-2 mt-0.5">{tn(item, 'description', locale)}</p>
                            )}
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className="font-bold text-sm" style={{ color: primary }}>
                                ${getItemPrice(item).toLocaleString('es-AR')}
                              </span>
                              {(item.tags || []).map((tag: string) => (
                                <span key={tag} className="text-xs px-1.5 py-0.5 rounded-full"
                                  style={{ backgroundColor: primary + '10', color: primary + 'cc' }}>
                                  {tag}
                                </span>
                              ))}
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

      {/* ── Platos Destacados — photo grid ── */}
      {featuredItems.length > 0 && (
        <section className="py-16 px-4" style={{ backgroundColor: '#1e293b' }}>
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-10">
              <h3 className="text-3xl font-bold mb-3" style={{ color: primary, fontFamily: 'var(--font-heading)' }}>
                {t.featuredTitle}
              </h3>
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="h-px w-12" style={{ backgroundColor: primary + '50' }} />
                <div className="w-1 h-1 rounded-full" style={{ backgroundColor: primary }} />
                <div className="h-px w-12" style={{ backgroundColor: primary + '50' }} />
              </div>
              <p className="text-sm max-w-sm mx-auto" style={{ color: '#94a3b8' }}>
                {t.featuredSubtitle}
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {featuredItems.slice(0, 8).map((item: any) => (
                <div key={item._id} className="rounded-xl overflow-hidden aspect-square relative group">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={tn(item, 'name', locale)}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-3"
                      style={{ backgroundColor: primary + '20', border: `1px solid ${primary}30` }}>
                      <p className="text-xs font-bold text-center leading-tight" style={{ color: primary }}>
                        {tn(item, 'name', locale)}
                      </p>
                      <p className="text-xs font-bold" style={{ color: primary }}>
                        ${getItemPrice(item).toLocaleString('es-AR')}
                      </p>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                    <p className="text-white text-xs font-bold text-left">{tn(item, 'name', locale)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Order Lookup ── */}
      <OrderLookupByPhone tenantSlug={tenant.slug} />

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

        {/* ── Club membership badge (hidden for company admin in business mode) ── */}
        {mounted && clubMembership.isMember && !isAdminCorp && (
          <div className="border-t px-4 py-3 max-w-2xl mx-auto"
            style={{ borderColor: primary + '20' }}>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <Link
                href={`/${tenant.slug}/club/lookup`}
                className="flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-80"
                style={{ color: primary }}
              >
                <Award size={16} />
                Socio del Club — {clubMembership.name}
              </Link>
              {clubMembership.walletEnabled && (
                <Link
                  href={`/${tenant.slug}/club/lookup`}
                  className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-80"
                  style={{ color: '#94a3b8' }}
                >
                  <Wallet size={14} />
                  Añadir a billetera digital
                </Link>
              )}
            </div>
          </div>
        )}

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

      {/* ── Fixed bottom cart bar ── */}
      {totalItems > 0 && !showCart && !likesOrderId && (
        <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-6 pt-2">
          <button
            onClick={goToCheckout}
            className="w-full max-w-2xl mx-auto flex items-center justify-between px-5 py-4 rounded-2xl font-bold text-base shadow-2xl"
            style={{ backgroundColor: primary, color: bg, display: 'flex' }}>
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-black"
                style={{ backgroundColor: bg + '30' }}>
                {totalItems}
              </span>
              <span>{t.viewOrder}</span>
            </div>
            <span>${totalPrice.toLocaleString('es-AR')}</span>
          </button>
        </div>
      )}

      {/* ── Customization Modal ── */}
      {customizingItem && (
        <CustomizationModal
          item={{ ...customizingItem, price: getItemPrice(customizingItem), variants: customizingItem.variants ?? [] }}
          onConfirm={handleConfirmCustomization}
          onClose={() => {
            setCustomizingItem(null)
            setPromoUnitFlow(null)
          }}
          primaryColor={primary}
          bgColor={bg}
          textColor={text}
          mode={mode}
          hideQuantity={!!promoUnitFlow}
          unitLabel={promoUnitFlow ? `Unidad ${promoUnitFlow.currentUnit} de ${promoUnitFlow.totalUnits}` : undefined}
          optionImageRegistry={menu.optionImageRegistry}
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
        />
      )}

      {/* ── Cart Drawer ── */}
      {showCart && !likesOrderId && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowCart(false)} />
          <div className="relative rounded-t-3xl p-6 max-h-[85dvh] overflow-y-auto" style={{ backgroundColor: bg }}>
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
                      {item.customizations.length === 0 && (
                        <button onClick={() => addPlainToCart(item)}
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
                        <span className="text-sm truncate block">{item.name}</span>
                      </div>
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
                    ${(item.price * item.quantity).toLocaleString('es-AR')}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t pt-4 mb-5" style={{ borderColor: primary + '20' }}>
              <div className="flex justify-between font-bold text-lg">
                <span>{t.total}</span>
                <span style={{ color: primary }}>${totalPrice.toLocaleString('es-AR')}</span>
              </div>
            </div>
            <button onClick={goToCheckout} className="w-full py-4 rounded-2xl font-bold text-base"
              style={{ backgroundColor: primary, color: bg }}>
              {t.confirm}
            </button>
          </div>
        </div>
      )}

      {/* ── Promo quantity input ── */}
      {promoQtyInput && (() => {
        const { item, promotion } = promoQtyInput
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60" onClick={() => { setPromoQtyInput(null); setPromoQtyValue(1) }} />
            <div className="relative bg-background rounded-3xl w-full max-w-sm p-6 border border-border">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-lg">{promotion.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.name}</p>
                </div>
                <button onClick={() => { setPromoQtyInput(null); setPromoQtyValue(1) }} className="opacity-40 hover:opacity-70 ml-2 shrink-0">
                  <X size={20} />
                </button>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Cada unidad se personaliza por separado
              </p>
              <div className="flex items-center justify-center gap-4 mb-6">
                <button
                  type="button"
                  onClick={() => setPromoQtyValue(q => Math.max(1, q - 1))}
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: primary + '20', color: primary }}
                >
                  <Minus size={16} />
                </button>
                <span className="text-2xl font-bold w-8 text-center" style={{ color: text }}>
                  {promoQtyValue}
                </span>
                <button
                  type="button"
                  onClick={() => setPromoQtyValue(q => q + 1)}
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: primary, color: bg }}
                >
                  <Plus size={16} />
                </button>
              </div>
              <p className="text-center text-sm font-semibold mb-4" style={{ color: primary }}>
                ${(promotion.price * promoQtyValue).toLocaleString('es-AR')}
              </p>
              <button
                type="button"
                onClick={() => {
                  const builtItem = buildPromoCustomizationItem(item, promotion)
                  setPromoUnitFlow({ item: builtItem, promotion, totalUnits: promoQtyValue, currentUnit: 1 })
                  setPromoQtyInput(null)
                  setPromoQtyValue(1)
                  openCustomizationModal(builtItem)
                }}
                className="w-full py-3 rounded-2xl font-bold text-sm"
                style={{ backgroundColor: primary, color: bg }}
              >
                Personalizar {promoQtyValue} unidad{promoQtyValue !== 1 ? 'es' : ''}
              </button>
            </div>
          </div>
        )
      })()}

      {/* ── Promo item picker ── */}
      {promoItemSelection && (() => {
        const { promo, items, completedItemIds } = promoItemSelection
        // Agrupar items por categoría
        const grouped: Record<string, any[]> = {}
        for (const it of items) {
          const cat = it.categoryName || 'Productos'
          if (!grouped[cat]) grouped[cat] = []
          grouped[cat].push(it)
        }
        // Categorías que ya tienen un item seleccionado (máximo 1 por categoría)
        const completedCats = new Set<string>()
        for (const it of items) {
          if (completedItemIds.includes(it._id || it.name)) {
            completedCats.add(it.categoryName || 'Productos')
          }
        }
        const totalCompleted = completedItemIds.length
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60" onClick={() => setPromoItemSelection(null)} />
            <div className="relative bg-background rounded-3xl w-full max-w-sm max-h-[80vh] overflow-y-auto p-6 border border-border">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-lg">{promo.title}</h3>
                  {promo.shortDescription && (
                    <p className="text-xs text-muted-foreground mt-0.5">{promo.shortDescription}</p>
                  )}
                  {promo.description && (
                    <p className="text-xs text-muted-foreground/60 mt-0.5 line-clamp-2">{promo.description}</p>
                  )}
                </div>
                <button onClick={() => setPromoItemSelection(null)} className="opacity-40 hover:opacity-70 ml-2 shrink-0">
                  <X size={20} />
                </button>
              </div>
              {totalCompleted > 0 && (
                <div className="mb-3 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">
                  {totalCompleted} producto{totalCompleted !== 1 ? 's' : ''} agregado{totalCompleted !== 1 ? 's' : ''}
                </div>
              )}
              <p className="text-xs text-muted-foreground mb-3 font-medium">Elegí un producto de cada categoría:</p>
              <div className="space-y-3">
                {Object.entries(grouped).map(([catName, catItems]) => {
                  const catDone = completedCats.has(catName)
                  return (
                    <div key={catName}>
                      <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1.5">
                        {catName} {catDone && <span className="text-emerald-600 normal-case">✓</span>}
                      </p>
                      <div className="space-y-1.5">
                        {catItems.map((it: any) => {
                          const itemId = it._id || it.name
                          const isCompleted = completedItemIds.includes(itemId)
                          const isDisabled = catDone && !isCompleted
                          return (
                            <button
                              key={itemId}
                              type="button"
                              disabled={isDisabled}
                              onClick={() => {
                                openCustomizationModal(buildPromoCustomizationItem(it, promo))
                              }}
                              className={
                                'w-full text-left p-3 rounded-xl border transition-all ' +
                                (isCompleted
                                  ? 'border-emerald-200 bg-emerald-50 opacity-60'
                                  : isDisabled
                                    ? 'border-border opacity-30 cursor-not-allowed'
                                    : 'border-border hover:border-primary/50 hover:bg-muted/30')
                              }
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold flex-1">{it.name}</span>
                                {isCompleted && (
                                  <span className="text-emerald-600 text-[10px] font-bold">✓ Agregado</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs font-bold text-primary">${promo.price}</span>
                                {it.variants?.length > 0 && (
                                  <span className="text-[10px] text-muted-foreground">{it.variants.length} var</span>
                                )}
                                {it.customizationGroups?.length > 0 && (
                                  <span className="text-[10px] text-muted-foreground">{it.customizationGroups.length} pers</span>
                                )}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
              <button
                type="button"
                onClick={() => setPromoItemSelection(null)}
                className="w-full mt-4 py-2.5 rounded-xl bg-primary text-white font-bold text-sm"
                style={primary ? { backgroundColor: primary } : {}}
              >
                {totalCompleted > 0 ? 'Listo, ir al pedido' : 'Cancelar'}
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

  return (
    <button onClick={handleAdd}
      className={`${btnSz} rounded-full flex items-center justify-center flex-shrink-0 transition-transform`}
      style={{ backgroundColor: primary, color: bg, transform: bounce ? 'scale(1.3)' : 'scale(1)' }}>
      <Plus size={sz} />
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
