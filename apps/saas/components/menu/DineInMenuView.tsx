'use client'

import { Fragment, useState, useEffect, useRef, useSyncExternalStore, useCallback } from 'react'
import { CategoryItemsLayout } from '@/components/menu/items/CategoryItemsLayout'
import { DineInItemCard } from '@/components/menu/items/DineInItemCard'
import { resolveCategoryLayout, resolveSubcategoryLayout, findAnchorCategoryId, type CategoryLayout } from '@/lib/menu-layout'
import { useRouter } from 'next/navigation'
import { Moon, Sun, Award, Wallet, X, Tag, ShoppingCart, Plus, Minus, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toPesos } from '@takeasygo/business/browser'
import { isAvailableNow } from '@/lib/availability'
import { motion, AnimatePresence } from 'framer-motion'
import { terminos, privacidad } from '@/lib/legal-content'
import { PromotionCard, PromotionCarousel } from '@/components/menu/PromotionCard'
import CustomizationSheet from '@/components/menu/CustomizationSheet'
import ReadOnlyCustomizationGroups from '@/components/menu/ReadOnlyCustomizationGroups'
import { useClubMembership } from '@/hooks/useClubMembership'
import { capturePromotionApplied } from '@/lib/tia/events'
import { trackMenuOpened, trackDishViewed, trackCartAdd, trackCartRemove } from '@/lib/track'
import LocationBar from '@/components/menu/LocationBar'
import { toast } from 'sonner'
import type { CartItem } from '@/types/cart'
import BestSellersSection from '@/components/menu/BestSellersSection'
import ComboCarousel, { type PublicCombo, type ComboCarouselSettings } from '@/components/menu/ComboCarousel'
import MenuClosing from '@/components/menu/MenuClosing'
import { categoryHasItems } from '@/lib/menu/has-items'
import { menuHref } from '@/lib/menu/location-ref'

interface Props {
  tenant: any
  location: any
  menu: any
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
    featuredTitle: 'Platos Destacados',
    featuredSubtitle: 'Una selección de nuestras creaciones más aclamadas, donde la técnica se encuentra con la pasión',
    contact: 'Contacto',
    ourStory: 'Nuestra Historia',
    followUs: 'Síguenos',
    followIG: 'Seguinos en Instagram',
    followFB: 'Seguinos en Facebook',
    followTW: 'Seguinos en Twitter',
    rights: 'Todos los derechos reservados.',
    terms: 'Términos y Condiciones',
    privacy: 'Política de Privacidad',
    translating: 'Traduciendo...',
    variantsSection: 'Variantes',
    customSection: 'Personalización',
  },
  en: {
    featuredTitle: 'Featured Dishes',
    featuredSubtitle: 'A selection of our most acclaimed creations, where technique meets passion',
    contact: 'Contact',
    ourStory: 'Our Story',
    followUs: 'Follow us',
    followIG: 'Follow us on Instagram',
    followFB: 'Follow us on Facebook',
    followTW: 'Follow us on Twitter',
    rights: 'All rights reserved.',
    terms: 'Terms & Conditions',
    privacy: 'Privacy Policy',
    translating: 'Translating...',
    variantsSection: 'Variants',
    customSection: 'Customization',
  },
}

export default function DineInMenuView({ tenant, location, menu, bestSellers }: Props) {
  const branding = tenant.branding
  const profile = tenant.profile ?? {}
  const applyGridToDineIn = branding.menuLayoutApplyTo === 'both' || branding.menuLayoutApplyTo === 'dine-in'
  const isGrid = applyGridToDineIn && branding.menuLayout === 'grid'
  const router = useRouter()

  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false)
  const [dark, setDark] = useState(false)
  const [locale, setLocale] = useState<'es' | 'en'>('es')
  const [activeLegal, setActiveLegal] = useState<'terminos' | 'privacidad' | null>(null)
  const [translating, setTranslating] = useState(false)
  const [menuData, setMenuData] = useState(menu)
  const [activeCategory, setActiveCategory] = useState<string>('')
  const [modalItem, setModalItem] = useState<any | null>(null)
  const [promotions, setPromotions] = useState<any[]>([])
  const [combos, setCombos] = useState<PublicCombo[]>([])
  const [promotionsLoading, setPromotionsLoading] = useState(true)
  const [showCartPopup, setShowCartPopup] = useState(false)
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
  const [customizingItem, setCustomizingItem] = useState<any | null>(null)
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

  useEffect(() => {
    fetch(`/api/${tenant.slug}/menu/${location._id}/combos?mode=dine-in`)
      .then(r => r.ok ? r.json() : { combos: [] })
      .then(data => setCombos(data.combos || []))
      .catch(() => setCombos([]))
  }, [tenant.slug, location._id])

  useEffect(() => {
    fetch(`/api/${tenant.slug}/menu/${location._id}/promotions?mode=dine-in`)
      .then(r => r.ok ? r.json() : { promotions: [] })
      .then(data => {
        setPromotions(data.promotions || [])
        setPromotionsLoading(false)
      })
      .catch(() => setPromotionsLoading(false))
  }, [tenant.slug, location._id])

  useEffect(() => {
    trackMenuOpened(location._id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!modalItem) return
    trackDishViewed({ _id: modalItem._id, name: tn(modalItem, 'name', locale), categoryName: modalItem.categoryName, price: modalItem.price })
  }, [modalItem]) // eslint-disable-line react-hooks/exhaustive-deps

  const clubMembership = useClubMembership(tenant.slug, location._id)

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const navRef = useRef<HTMLDivElement>(null)

  const t = UI[locale]

  const categories = (menuData.categories ?? [])
    // Sin productos para mostrar (p. ej. categorías vacías de la plantilla del rubro): no se muestra.
    .filter((c: any) => categoryHasItems(c) && c.isAvailable && (!mounted || isAvailableNow(c.availabilityMode, c.availabilitySchedule)))
    .sort((a: any, b: any) => {
      const diff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
      return diff !== 0 ? diff : String(a._id).localeCompare(String(b._id))
    })

  // ── Modal de detalle de plato (solo lectura, dine-in no se compra) ──
  // Mergea los grupos de personalización igual que el menú takeaway:
  // grupos heredados de la categoría + grupos propios del ítem.
  function openDishInfo(item, catGroups?) {
    setModalItem({
      ...item,
      _displayGroups: [
        ...(item._catGroups ?? []),
        ...(catGroups ?? []),
        ...(item.customizationGroups ?? []),
      ],
    })
  }

  const comboSettings: ComboCarouselSettings | undefined = tenant.branding?.combosCarousel
  // Si una categoría visible tiene «Mostrar combos después», esa ubicación pisa la posición general.
  const comboSection = (position: NonNullable<ComboCarouselSettings['position']> | 'afterCategory') =>
    (position === 'afterCategory' ? Boolean(combosAnchorId) : !combosAnchorId && (comboSettings?.position ?? 'afterBestsellers') === position) ? (
      <ComboCarousel combos={combos} settings={comboSettings} primary={branding.primaryColor} textColor={text} locationId={location._id} />
    ) : null

  const featuredPromotions = promotions.filter(p => p.isFeatured)
  const regularPromotions = promotions.filter(p => !p.isFeatured)

  // ── Promotion cart helpers ────────────────────────────────
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

  function addPromotionToCart(promotion: any) {
    // Solo las promociones de venta van al carrito: el server rechaza las demás.
    if (promotion.type !== 'sale') return
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
      setCustomizingItem({ ...virtualItem, customizationGroups: virtualItem.customizationGroups })
      return
    }

    const itemsWithCustomizations = linkedItems.filter(
      (li: any) => (li.customizationGroups?.length ?? 0) > 0 || (li.variants?.length ?? 0) > 0
    )

    if (itemsWithCustomizations.length === 0 || promotion.allowCustomization === false) {
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
      trackCartAdd({ promotionId: promotion._id, name: promotion.title, price: promotion.price, quantity: 1, hasCustomizations: false, source: 'menu', locationId: location._id })
      toast.success(`${promotion.title} agregado al pedido`)
      capturePromotionApplied({ _id: promotion._id, type: promotion.type, title: promotion.title }, promotion.originalPrice ? Math.round(((promotion.originalPrice - promotion.price) / promotion.originalPrice) * 100) : 0)
      return
    }

    if (itemsWithCustomizations.length === 1) {
      const item = itemsWithCustomizations[0]
      setPromoQtyInput({ item, promotion })
      return
    }

    setPromoItemSelection({
      promo: promotion,
      items: itemsWithCustomizations,
      completedItemIds: [],
    })
  }

  function handleConfirmCustomization(cartItem: CartItem) {
    if ((cartItem as any).isPromotion) {
      const promoId = (cartItem as any)._promotionId
      const itemName = (cartItem as any)._itemName || ''

      if (promoUnitFlow) {
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
          capturePromotionApplied({ _id: cartItem.menuItemId, type: 'promotion', title: itemName }, 0)
        }
        setCart(prev => [...prev, taggedItem])
        trackCartAdd({ menuItemId: cartItem.menuItemId, name: itemName, price: cartItem.price, quantity: 1, hasCustomizations: true, source: 'menu', locationId: location._id })
        setCustomizingItem(null)

        if (promoUnitFlow.currentUnit < promoUnitFlow.totalUnits) {
          setPromoUnitFlow(prev => prev ? { ...prev, currentUnit: prev.currentUnit + 1 } : null)
          toast.success(`${itemName} unidad ${promoUnitFlow.currentUnit} de ${promoUnitFlow.totalUnits} agregada`)
        } else {
          setPromoUnitFlow(null)
          toast.success(`${promoUnitFlow.totalUnits} × ${itemName} agregados a ${(cartItem as any)._promotionTitle}`)
        }
        return
      }

      const uniqueId = `promo:${promoId}:${itemName.replace(/\s+/g, '_') || Date.now()}`
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
      setCart(prev => {
        const existing = prev.find(i => i.cartItemId === uniqueId)
        if (existing) return prev.map(i => i.cartItemId === uniqueId ? { ...i, quantity: i.quantity + 1 } : i)
        return [...prev, taggedItem]
      })
      trackCartAdd({ menuItemId: cartItem.menuItemId, name: itemName, price: cartItem.price, quantity: cartItem.quantity, hasCustomizations: true, source: 'menu', locationId: location._id })
      setCustomizingItem(null)
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
    setCustomizingItem(null)
  }

  function removeFromCart(cartItemId: string) {
    const existing = cart.find(i => i.cartItemId === cartItemId)
    // cart_remove = el producto sale del carrito por completo
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

  function goToCheckout() {
    sessionStorage.setItem(`cart_${tenant.slug}`, JSON.stringify(cart))
    sessionStorage.setItem('mode', 'dine-in')
    router.push(menuHref(tenant.slug, location, 'dine-in/checkout'))
  }

  const totalCartItems = cart.reduce((sum, i) => sum + i.quantity, 0)
  const totalCartPrice = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)

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
        // fallback to Spanish if translation fails
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

  // Detect which section is visible
  useEffect(() => {
    if (categories.length === 0) return
    setActiveCategory(categories[0]._id)

    const observers: IntersectionObserver[] = []
    categories.forEach((cat: any) => {
      const el = sectionRefs.current[cat._id]
      if (!el) return
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveCategory(cat._id) },
        { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
      )
      obs.observe(el)
      observers.push(obs)
    })
    return () => observers.forEach(o => o.disconnect())
  }, [menuData])

  function scrollToCategory(id: string) {
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function scrollNavToActive(id: string) {
    const nav = navRef.current
    if (!nav) return
    const btn = nav.querySelector(`[data-cat="${id}"]`) as HTMLElement
    if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }

  useEffect(() => { scrollNavToActive(activeCategory) }, [activeCategory])

  // Colors that switch with dark mode
  const bg = dark ? '#0f172a' : branding.backgroundColor
  const text = dark ? '#e2e8f0' : branding.textColor
  const cardBg = dark ? '#1e293b' : '#ffffff'
  const cardBorder = dark ? branding.primaryColor + '25' : branding.primaryColor + '20'
  const mutedText = dark ? '#94a3b8' : text + '99'

  const isDineInItemVisible = (i: any) => i.isAvailable && (!mounted || isAvailableNow(i.availabilityMode, i.availabilitySchedule))
  // Combos anclados a una categoría visible (si la marcada está oculta, vuelven a su lugar).
  const combosAnchorId = findAnchorCategoryId(categories, (c: any) => c.combosAfter)

  function renderDineInItem(item: any, cat: any, layout: CategoryLayout) {
    return (
      <DineInItemCard
        layout={layout}
        name={tn(item, 'name', locale)}
        description={item.description ? tn(item, 'description', locale) : ''}
        imageUrl={item.imageUrl}
        tags={item.tags ?? []}
        price={item.price}
        variantPrices={(item.variants ?? []).map((v: any) => v.price)}
        customizable={(item.variants ?? []).length > 0 || (item.customizationGroups ?? []).length > 0 || (cat.customizationGroups ?? []).length > 0}
        primary={branding.primaryColor}
        text={text}
        mutedText={mutedText}
        cardBg={cardBg}
        cardBorder={cardBorder}
        logoUrl={branding.logoUrl}
        onOpen={() => openDishInfo(item, cat.customizationGroups)}
      />
    )
  }

  const navBg = dark ? '#0f172a' : branding.backgroundColor
  const navBorder = dark ? branding.primaryColor + '30' : branding.primaryColor + '20'

  const hasHeroMedia = location.hero?.mediaType !== 'none' && !!location.hero?.url
  const showLogoOnHero = location.hero?.showLogo !== false

  return (
    <div style={{ backgroundColor: bg, color: text, minHeight: '100dvh', fontFamily: 'var(--font-body)' }}>

      {/* ── Translating overlay ── */}
      {translating && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <div className="flex items-center gap-3 px-5 py-3 rounded-2xl font-semibold text-base text-white"
            style={{ backgroundColor: branding.primaryColor }}>
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            {t.translating}
          </div>
        </div>
      )}

      {/* ── Hero ─────────────────────────────────────────── */}
      <section
        className="relative text-center overflow-hidden flex items-center justify-center"
        style={{
          minHeight: hasHeroMedia ? '40dvh' : undefined,
          paddingTop: hasHeroMedia ? 0 : '4rem',
          paddingBottom: hasHeroMedia ? 0 : '4rem',
          backgroundColor: bg,
        }}
      >
        {hasHeroMedia && location.hero.mediaType === 'image' && (
          <img src={location.hero.url} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        {hasHeroMedia && location.hero.mediaType === 'video' && (
          <video autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover">
            <source src={location.hero.url} type="video/mp4" />
          </video>
        )}
        {hasHeroMedia && (
          <div className="absolute inset-0"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.40) 0%, rgba(0,0,0,0.65) 100%)' }} />
        )}

        <div className="relative z-10 px-4 py-16 w-full flex flex-col items-center">
          {showLogoOnHero && branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={tenant.name}
              className="h-20 object-contain mx-auto mb-6"
              style={{ filter: hasHeroMedia ? 'drop-shadow(0 2px 8px rgba(0,0,0,0.4))' : undefined }}
            />
          ) : !branding.logoUrl && !hasHeroMedia ? (
            <h1 className="text-4xl font-bold mb-2" style={{ color: branding.primaryColor, fontFamily: 'var(--font-heading)' }}>
              {tenant.name}
            </h1>
          ) : null}

          <h2 className="text-2xl font-bold mb-3"
            style={{ color: hasHeroMedia ? '#ffffff' : branding.primaryColor, fontFamily: 'var(--font-heading)' }}>
            Menu
          </h2>

          {profile.menuDescription && (
            <p className="max-w-2xl mx-auto text-base leading-relaxed mb-4"
              style={{ color: hasHeroMedia ? 'rgba(255,255,255,0.78)' : mutedText, fontFamily: 'var(--font-body)', fontStyle: 'italic' }}>
              {profile.menuDescription}
            </p>
          )}
        </div>

        {hasHeroMedia && (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center" style={{ animation: 'bounce 2s infinite' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
            <svg width="28" height="20" viewBox="0 0 24 16" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: -10 }}>
              <polyline points="6 1 12 7 18 1" />
            </svg>
          </div>
        )}
        <style>{`@keyframes bounce { 0%,100%{transform:translateX(-50%) translateY(0)} 50%{transform:translateX(-50%) translateY(6px)} }`}</style>
      </section>

      {/* ── Sticky category nav ───────────────────────────── */}
      <div
        className="sticky top-0 z-50 border-b"
        style={{ backgroundColor: navBg + 'f2', borderColor: navBorder, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
        <div className="px-3 py-1.5 border-b flex items-center" style={{ borderColor: navBorder }}>
          <LocationBar tenantSlug={tenant.slug} location={location} />
        </div>
        <div className="max-w-4xl mx-auto flex items-center gap-2 px-3 py-2.5">
          <div
            ref={navRef}
            className="flex-1 flex items-center gap-2 overflow-x-auto"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {categories.map((cat: any) => {
              const isActive = activeCategory === cat._id
              return (
                <button
                  key={cat._id}
                  data-cat={cat._id}
                  onClick={() => scrollToCategory(cat._id)}
                  className="whitespace-nowrap flex-shrink-0 transition-all"
                  style={{
                    padding: '5px 14px',
                    fontSize: '12px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    borderRadius: '9999px',
                    border: `1.5px solid ${branding.primaryColor}`,
                    backgroundColor: isActive ? branding.primaryColor : 'transparent',
                    color: isActive ? '#ffffff' : branding.primaryColor,
                    cursor: 'pointer',
                  }}>
                  {tn(cat, 'name', locale)}
                </button>
              )
            })}
          </div>

          {/* Language toggle — right next to dark mode */}
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              onClick={() => handleLocaleToggle('es')}
              className="px-1.5 py-1 rounded transition-opacity"
              style={{
                fontSize: '11px', fontWeight: 700, border: 'none', background: 'none', cursor: 'pointer',
                color: branding.primaryColor, opacity: locale === 'es' ? 1 : 0.35,
              }}>
              ES
            </button>
            <span style={{ opacity: 0.25, color: text, fontSize: '11px' }}>|</span>
            <button
              onClick={() => handleLocaleToggle('en')}
              className="px-1.5 py-1 rounded transition-opacity"
              style={{
                fontSize: '11px', fontWeight: 700, border: 'none', background: 'none', cursor: 'pointer',
                color: branding.primaryColor, opacity: locale === 'en' ? 1 : 0.35,
              }}>
              EN
            </button>
          </div>

          {/* Dark mode toggle */}
          <button
            onClick={() => setDark(d => !d)}
            className="p-2 rounded-full transition-colors flex-shrink-0"
            style={{ color: mutedText, border: `1.5px solid ${branding.primaryColor}40` }}>
            {dark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
</div>

        {comboSection('afterFeatured')}

        {/* Promotions Section */}
        {promotions.length > 0 && (
          <section className="mb-8 px-1">
            <div className="flex items-center gap-2 mb-4">
              <Tag size={18} style={{ color: branding.primaryColor }} strokeWidth={2.5} />
              <h2 className="text-base font-bold tracking-tight" style={{ color: text }}>Promociones</h2>
            </div>
            
            <PromotionCarousel
              promotions={[...featuredPromotions, ...regularPromotions]}
              tenantSlug={tenant.slug}
              locationId={location._id}
              onAdd={addPromotionToCart}
              primary={branding.primaryColor}
              bg={bg}
              textColor={text}
              mode="dine-in"
              typeLabels={tenant.promotionLabels}
              loyaltyMessaging={tenant.loyaltyMessaging}
            />
          </section>
        )}

      </div>
      {/* ── Menu sections ─────────────────────────────────── */}
      <main className="max-w-4xl mx-auto px-4 pt-8 pb-0">
        {comboSection('beforeCategories')}
        {categories.map((cat: any) => {
          const layout = resolveCategoryLayout(cat, 'dine-in', isGrid)
          const directItems = (cat.items ?? []).filter(isDineInItemVisible)
          const subcategories = [...(cat.subcategories ?? [])].sort((a: any, b: any) => a.sortOrder - b.sortOrder)
          const categoryId = String(cat._id)
          return (
            <Fragment key={categoryId}>
              <section
                ref={el => { sectionRefs.current[cat._id] = el }}
                className="mb-12 scroll-mt-20">
                <div className="text-center mb-8">
                  <h3 className="text-xl font-bold mb-2" style={{ color: branding.primaryColor, fontFamily: 'var(--font-heading)' }}>
                    {tn(cat, 'name', locale)}
                  </h3>
                  <div className="flex items-center justify-center gap-3">
                    <div className="h-px w-12" style={{ backgroundColor: branding.primaryColor + '50' }} />
                    <div className="w-1 h-1 rounded-full" style={{ backgroundColor: branding.primaryColor + '80' }} />
                    <div className="h-px w-12" style={{ backgroundColor: branding.primaryColor + '50' }} />
                  </div>
                </div>

                <CategoryItemsLayout
                  items={directItems}
                  layout={layout}
                  getKey={(item: any) => String(item._id)}
                  renderItem={(item: any, l) => renderDineInItem(item, cat, l)}
                  primary={branding.primaryColor}
                  listClassName="space-y-3"
                />

                {subcategories.map((sub: any) => {
                  const subItems = (sub.items ?? []).filter(isDineInItemVisible)
                  if (subItems.length === 0) return null
                  return (
                    <div key={sub._id}>
                      <div className="flex items-center gap-3 my-4">
                        <div className="h-px flex-1" style={{ backgroundColor: branding.primaryColor + '25' }} />
                        <span className="text-sm font-semibold uppercase tracking-wider" style={{ color: branding.primaryColor }}>
                          {tn(sub, 'name', locale)}
                        </span>
                        <div className="h-px flex-1" style={{ backgroundColor: branding.primaryColor + '25' }} />
                      </div>
                      <CategoryItemsLayout
                        items={subItems}
                        layout={resolveSubcategoryLayout(sub, 'dine-in', layout)}
                        getKey={(item: any) => String(item._id)}
                        renderItem={(item: any, l) => renderDineInItem(item, cat, l)}
                        primary={branding.primaryColor}
                        listClassName="space-y-3"
                      />
                    </div>
                  )
                })}
              </section>
              {combosAnchorId === categoryId && comboSection('afterCategory')}
            </Fragment>
          )
        })}

        {comboSection('afterCategories')}
      </main>

      {/* ── End of Menu: Club + TGO Network ── */}

      {/* Best Sellers */}
      {bestSellers && bestSellers.length > 0 && tenant.branding?.bestSellers?.showSection !== false && (
        <BestSellersSection
          bestSellers={bestSellers}
          styles={tenant.branding?.bestSellers}
          locationName={location.name}
          primaryColor={branding.primaryColor}
          mode="dine-in"
          onAdd={(item) => {
            const enriched = categories.flatMap((c: any) => [
              ...(c.items ?? []),
              ...(c.subcategories ?? []).flatMap((s: any) => s.items ?? [])
            ]).find((i: any) => String(i._id) === item._id)
            if (enriched) {
              setCustomizingItem(enriched)
            }
          }}
        />
      )}

      <div className="max-w-4xl mx-auto px-4">{comboSection('afterBestsellers')}</div>

      {/* ── Cierre del menú: club, datos del local, red TakeasyGO y pie (con la marca del local) ── */}
      <MenuClosing
        tenantSlug={tenant.slug}
        tenantName={tenant.name}
        logoUrl={branding.logoUrl}
        clubName={tenant.loyalty?.clubName || `Club ${tenant.name}`}
        primary={branding.primaryColor}
        bg={bg}
        text={text}
        locale={locale}
        location={{
          address: location.address,
          phone: location.phone,
          hours: location.hours,
          mapsUrl: location.mapsUrl,
        }}
        about={profile.about}
        social={profile.social}
        club={{ show: true, isMember: clubMembership.isMember, name: clubMembership.name, walletEnabled: clubMembership.walletEnabled }}
      />

      {/* ── Dish detail modal (solo lectura — dine-in no se compra) ── */}
      {modalItem && (() => {
        const disabledVariantNames: string[] = modalItem.disabledVariantNames ?? []
        const visibleVariants = (modalItem.variants ?? []).filter(
          (v) => !disabledVariantNames.includes(v.name)
        )
        const displayGroups = modalItem._displayGroups ?? []
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
            onClick={() => setModalItem(null)}>
            <div className="max-w-sm w-full max-h-[85vh] flex flex-col rounded-2xl overflow-hidden"
              style={{ backgroundColor: cardBg }}
              onClick={e => e.stopPropagation()}>
              <div className="overflow-y-auto overscroll-contain">
                {modalItem.imageUrl && (
                  <img src={modalItem.imageUrl} alt={tn(modalItem, 'name', locale)} className="w-full aspect-square object-cover" />
                )}
                <div className="p-4">
                  <p className="font-bold uppercase tracking-wide" style={{ color: text }}>{tn(modalItem, 'name', locale)}</p>
                  {modalItem.description && (
                    <p className="text-sm mt-1" style={{ color: mutedText }}>{tn(modalItem, 'description', locale)}</p>
                  )}
                  <p className="font-bold text-lg mt-2" style={{ color: branding.primaryColor }}>
                    ${(() => {
                      if (visibleVariants.length > 0) {
                        const prices = visibleVariants.map((v) => v.price)
                        const minPrice = Math.min(...prices)
                        const maxPrice = Math.max(...prices)
                        return minPrice === maxPrice
                          ? toPesos(minPrice).toLocaleString('es-AR')
                          : `${toPesos(minPrice).toLocaleString('es-AR')} - ${toPesos(maxPrice).toLocaleString('es-AR')}`
                      }
                      return toPesos(modalItem.price).toLocaleString('es-AR')
                    })()}
                  </p>

                  {/* Variantes (solo lectura) */}
                  {visibleVariants.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: branding.primaryColor }}>
                        {t.variantsSection}
                      </p>
                      <div className="space-y-1.5">
                        {visibleVariants.map((v) => (
                          <div key={v.name}>
                            <div className="flex items-center justify-between text-sm px-2 py-1 rounded-lg"
                              style={{ backgroundColor: branding.primaryColor + '10' }}>
                              <span style={{ color: text }}>{v.name}</span>
                              <span className="font-semibold" style={{ color: branding.primaryColor }}>
                                ${toPesos(v.price).toLocaleString('es-AR')}
                              </span>
                            </div>
                            {!!v.customizationGroups?.length && (
                              <div className="ml-3 mt-1.5 pl-3 border-l-2 space-y-1"
                                style={{ borderColor: branding.primaryColor + '30' }}>
                                <ReadOnlyCustomizationGroups
                                  groups={v.customizationGroups}
                                  disabledGroupIds={modalItem.disabledGroupIds}
                                  disabledOptionIds={modalItem.disabledOptionIds}
                                  primaryColor={branding.primaryColor}
                                  textColor={text}
                                  mutedText={mutedText}
                                  optionImageRegistry={menu.optionImageRegistry}
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Personalizaciones del plato (solo lectura) */}
                  {displayGroups.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: branding.primaryColor }}>
                        {t.customSection}
                      </p>
                      <ReadOnlyCustomizationGroups
                        groups={displayGroups}
                        disabledGroupIds={modalItem.disabledGroupIds}
                        disabledOptionIds={modalItem.disabledOptionIds}
                        primaryColor={branding.primaryColor}
                        textColor={text}
                        mutedText={mutedText}
                        optionImageRegistry={menu.optionImageRegistry}
                      />
                    </div>
                  )}

                  {modalItem.tags?.length > 0 && (
                    <div className="flex gap-1.5 mt-4 flex-wrap">
                      {modalItem.tags.map((tag: string) => (
                        <span key={tag} className="text-xs px-2 py-0.5 rounded-full border"
                          style={{ borderColor: branding.primaryColor + '50', color: branding.primaryColor }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

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
                  style={{ backgroundColor: branding.primaryColor + '20', color: branding.primaryColor }}
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
                  style={{ backgroundColor: branding.primaryColor, color: bg }}
                >
                  <Plus size={16} />
                </button>
              </div>
              <p className="text-center text-sm font-semibold mb-4" style={{ color: branding.primaryColor }}>
                ${toPesos(promotion.price * promoQtyValue).toLocaleString('es-AR')}
              </p>
              <button
                type="button"
                onClick={() => {
                  const builtItem = buildPromoCustomizationItem(item, promotion)
                  setPromoUnitFlow({ item: builtItem, promotion, totalUnits: promoQtyValue, currentUnit: 1 })
                  setPromoQtyInput(null)
                  setPromoQtyValue(1)
                  setCustomizingItem(builtItem)
                }}
                className="w-full py-3 rounded-2xl font-bold text-sm"
                style={{ backgroundColor: branding.primaryColor, color: bg }}
              >
                Personalizar {promoQtyValue} unidad{promoQtyValue !== 1 ? 'es' : ''}
              </button>
            </div>
          </div>
        )
      })()}

      {/* ── Customization modal ──────────────────────────── */}
      {customizingItem && (
        <CustomizationSheet
          item={{ ...customizingItem, price: customizingItem.price ?? 0, variants: customizingItem.variants ?? [] }}
          onConfirm={handleConfirmCustomization}
          onClose={() => {
            setCustomizingItem(null)
            setPromoUnitFlow(null)
          }}
          primaryColor={branding.primaryColor}
          bgColor={bg}
          textColor={text}
          mode="dine-in"
          hideQuantity={!!promoUnitFlow}
          unitLabel={promoUnitFlow ? `Unidad ${promoUnitFlow.currentUnit} de ${promoUnitFlow.totalUnits}` : undefined}
          optionImageRegistry={menu.optionImageRegistry}
        />
      )}

      {/* ── Legal modal ────────────────────────────────────── */}
      <AnimatePresence>
        {activeLegal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={() => setActiveLegal(null)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 30 }}
              transition={{ type: 'spring', damping: 28, stiffness: 380 }}
              className="w-full max-w-md bg-white rounded-3xl max-h-[80dvh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-white border-b border-zinc-100 p-4 flex items-center justify-between rounded-t-3xl z-10">
                <h2 className="font-bold text-base text-zinc-900">
                  {activeLegal === 'terminos' ? 'Términos y Condiciones' : 'Política de Privacidad'}
                </h2>
                <button
                  onClick={() => setActiveLegal(null)}
                  className="w-8 h-8 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-500 hover:bg-zinc-200 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                {(activeLegal === 'terminos' ? terminos : privacidad).map((section, i) => (
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
    </div>
  )
}
