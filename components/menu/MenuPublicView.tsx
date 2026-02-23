'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  ShoppingCart, X, Plus, Minus, Leaf, UtensilsCrossed,
  Settings, MapPin, Phone, Clock, Instagram, Facebook, Twitter,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { CartItem } from '@/types/cart'
import CustomizationModal from '@/components/menu/CustomizationModal'

interface Props {
  tenant: any
  location: any
  menu: any
  mode: 'takeaway' | 'dine-in'
}

const VEGETARIAN_TAGS = ['vegetariano', 'vegano', 'vegan', 'vegetarian']
function isVegetarian(tags: string[]): boolean {
  return tags.some(t => VEGETARIAN_TAGS.includes(t.toLowerCase()))
}

export default function MenuPublicView({ tenant, location, menu, mode }: Props) {
  const [cart, setCart] = useState<CartItem[]>([])
  const [showCart, setShowCart] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string>('')
  const [customizingItem, setCustomizingItem] = useState<any | null>(null)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const navRef = useRef<HTMLDivElement>(null)
  const branding = tenant.branding
  const profile = tenant.profile ?? {}
  const router = useRouter()

  const categories = menu.categories
    .filter((cat: any) => cat.isAvailable)
    .sort((a: any, b: any) => a.sortOrder - b.sortOrder)

  const featuredItems = categories.flatMap((cat: any) =>
    cat.items.filter((i: any) => i.isFeatured)
  )

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
  }, [menu])

  // Auto-scroll nav circle to active
  useEffect(() => {
    if (!navRef.current || !activeCategory) return
    const btn = navRef.current.querySelector(`[data-cat="${activeCategory}"]`) as HTMLElement
    if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [activeCategory])

  // Items without customization groups: merge by stable cartItemId (`${id}:plain`)
  function addPlainToCart(item: any) {
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
      }]
    })
  }

  // Called from CustomizationModal — each configured instance is unique
  function handleConfirmCustomization(cartItem: CartItem) {
    setCart(prev => [...prev, cartItem])
    setCustomizingItem(null)
  }

  function removeFromCart(cartItemId: string) {
    setCart(prev => {
      const existing = prev.find(i => i.cartItemId === cartItemId)
      if (existing && existing.quantity > 1) return prev.map(i => i.cartItemId === cartItemId ? { ...i, quantity: i.quantity - 1 } : i)
      return prev.filter(i => i.cartItemId !== cartItemId)
    })
  }

  function openCustomizationModal(item: any) {
    setShowCart(false)
    setCustomizingItem(item)
  }

  function goToCheckout() {
    sessionStorage.setItem('cart', JSON.stringify(cart))
    sessionStorage.setItem('mode', mode)
    router.push(`/${tenant.slug}/menu/${location._id}/${mode}/checkout`)
  }

  function scrollTo(categoryId: string) {
    sectionRefs.current[categoryId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const totalItems = cart.reduce((sum, i) => sum + i.quantity, 0)
  const totalPrice = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)

  // Total quantity of a specific menu item across all cart entries (for badge in CartControl)
  function itemTotalQty(menuItemId: string) {
    return cart.filter(i => i.menuItemId === menuItemId).reduce((s, i) => s + i.quantity, 0)
  }

  const primary = branding.primaryColor
  const bg = branding.backgroundColor
  const text = branding.textColor
  const borderStyle = branding.borderRadius === 'sharp' ? '0px'
    : branding.borderRadius === 'pill' ? '16px' : '10px'

  return (
    <div style={{ backgroundColor: bg, color: text }} className="min-h-screen">

      {/* ── Sticky Header ── */}
      <header className="sticky top-0 z-40 backdrop-blur-md border-b"
        style={{ backgroundColor: bg + 'ee', borderColor: primary + '20' }}>

        {/* Top bar: logo + cart button */}
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {branding.logoUrl
              ? <img src={branding.logoUrl} alt={tenant.name} className="h-8 object-contain" />
              : <span className="font-bold text-lg" style={{ color: primary }}>{tenant.name}</span>}
            <span className="text-xs opacity-40 hidden sm:block">{location.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs opacity-40">🥡 Para llevar</span>
            {totalItems > 0 && (
              <button
                onClick={() => setShowCart(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl font-semibold text-sm"
                style={{ backgroundColor: primary, color: bg }}>
                <ShoppingCart size={15} />
                <span>{totalItems}</span>
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
            {categories.map((cat: any) => {
              const isActive = activeCategory === cat._id
              return (
                <button
                  key={cat._id}
                  data-cat={cat._id}
                  onClick={() => scrollTo(cat._id)}
                  className="flex flex-col items-center gap-1.5 flex-shrink-0 transition-opacity"
                  style={{ opacity: isActive ? 1 : 0.55 }}>
                  {/* Circle with category image */}
                  <div
                    className="w-14 h-14 rounded-full overflow-hidden transition-all"
                    style={{
                      border: `2.5px solid ${isActive ? primary : primary + '25'}`,
                      boxShadow: isActive ? `0 0 0 2px ${primary}25` : 'none',
                    }}>
                    {cat.imageUrl
                      ? <img src={cat.imageUrl} alt={cat.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"
                          style={{ backgroundColor: primary + '12' }}>
                          <UtensilsCrossed size={18} style={{ color: primary + '60' }} />
                        </div>
                    }
                  </div>
                  {/* Category label */}
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
                    {cat.name}
                  </span>
                </button>
              )
            })}
          </div>
        </nav>
      </header>

      {/* ── Main menu content ── */}
      <main className="max-w-2xl mx-auto px-4 pt-6 pb-10">

        {/* Featured strip at top */}
        {featuredItems.length > 0 && (
          <section className="mb-8 rounded-2xl overflow-hidden border" style={{ borderColor: primary + '25' }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: primary + '25', backgroundColor: primary + '10' }}>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: primary }}>
                ⭐ Destacados
              </p>
            </div>
            <div>
              {featuredItems.map((item: any) => {
                const veg = isVegetarian(item.tags || [])
                return (
                  <div key={item._id} className="flex items-center gap-3 px-4 py-3 border-b last:border-0"
                    style={{ borderColor: primary + '12' }}>
                    {item.imageUrl
                      ? <img src={item.imageUrl} alt={item.name} className="w-14 h-14 object-cover rounded-xl flex-shrink-0" />
                      : <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: primary + '15' }}>
                          {veg ? <Leaf size={16} style={{ color: '#22c55e' }} /> : <UtensilsCrossed size={14} style={{ color: primary + '80' }} />}
                        </div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{item.name}</p>
                      {item.description && <p className="text-xs opacity-50 truncate">{item.description}</p>}
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="font-bold text-sm" style={{ color: primary }}>
                          ${item.price.toLocaleString('es-AR')}
                        </span>
                        {(item.tags || []).map((tag: string) => (
                          <span key={tag} className="text-xs px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: primary + '15', color: primary }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <CartControl item={item} cart={cart} onAdd={addPlainToCart} onOpenModal={openCustomizationModal} onRemove={removeFromCart} totalQty={itemTotalQty(item._id)} primary={primary} bg={bg} />
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* All categories */}
        {categories.map((category: any) => (
          <section
            key={category._id}
            ref={el => { sectionRefs.current[category._id] = el }}
            className="mb-8 scroll-mt-44">
            <h2 className="text-xs font-bold mb-3 pb-2 border-b tracking-widest uppercase"
              style={{ borderColor: primary + '30', color: primary }}>
              {category.name}
            </h2>

            <div className={branding.menuLayout === 'grid' ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-0'}>
              {category.items
                .filter((item: any) => item.isAvailable)
                .map((item: any) => {
                  const veg = isVegetarian(item.tags || [])
                  const qty = itemTotalQty(item._id)

                  if (branding.menuLayout === 'grid') {
                    return (
                      <div key={item._id} className="border overflow-hidden"
                        style={{ borderColor: primary + '20', borderRadius: borderStyle }}>
                        {item.imageUrl && (
                          <img src={item.imageUrl} alt={item.name} className="w-full h-28 object-cover" />
                        )}
                        <div className="p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            {veg
                              ? <Leaf size={11} className="flex-shrink-0" style={{ color: '#22c55e' }} />
                              : <UtensilsCrossed size={11} className="flex-shrink-0" style={{ color: primary + '60' }} />}
                            <p className="font-semibold text-xs leading-tight">{item.name}</p>
                          </div>
                          {item.description && (
                            <p className="text-xs opacity-40 line-clamp-2 mb-1.5">{item.description}</p>
                          )}
                          <div className="flex items-center justify-between">
                            <p className="font-bold text-sm" style={{ color: primary }}>
                              ${item.price.toLocaleString('es-AR')}
                            </p>
                            <CartControl item={item} cart={cart} onAdd={addPlainToCart} onOpenModal={openCustomizationModal} onRemove={removeFromCart} totalQty={qty} primary={primary} bg={bg} compact />
                          </div>
                        </div>
                      </div>
                    )
                  }

                  // List layout
                  return (
                    <div key={item._id}
                      className="flex items-center gap-3 py-3 border-b"
                      style={{ borderColor: primary + '12' }}>
                      {item.imageUrl
                        ? <img src={item.imageUrl} alt={item.name} className="w-16 h-16 object-cover rounded-xl flex-shrink-0" />
                        : <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: primary + '10' }}>
                            {veg
                              ? <Leaf size={14} style={{ color: '#22c55e' }} />
                              : <UtensilsCrossed size={13} style={{ color: primary + '60' }} />}
                          </div>
                      }
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{item.name}</p>
                        {item.description && (
                          <p className="text-xs opacity-50 line-clamp-2 mt-0.5">{item.description}</p>
                        )}
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="font-bold text-sm" style={{ color: primary }}>
                            ${item.price.toLocaleString('es-AR')}
                          </span>
                          {(item.tags || []).map((tag: string) => (
                            <span key={tag} className="text-xs px-1.5 py-0.5 rounded-full"
                              style={{ backgroundColor: primary + '10', color: primary + 'cc' }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <CartControl item={item} cart={cart} onAdd={addPlainToCart} onOpenModal={openCustomizationModal} onRemove={removeFromCart} totalQty={qty} primary={primary} bg={bg} />
                    </div>
                  )
                })}
            </div>
          </section>
        ))}
      </main>

      {/* ── Platos Destacados — photo grid (same as dine-in) ── */}
      {featuredItems.length > 0 && (
        <section className="py-16 px-4" style={{ backgroundColor: '#1e293b' }}>
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-10">
              <h3 className="text-3xl font-bold mb-3" style={{ color: primary, fontFamily: 'Georgia, Cambria, serif' }}>
                Platos Destacados
              </h3>
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="h-px w-12" style={{ backgroundColor: primary + '50' }} />
                <div className="w-1 h-1 rounded-full" style={{ backgroundColor: primary }} />
                <div className="h-px w-12" style={{ backgroundColor: primary + '50' }} />
              </div>
              <p className="text-sm max-w-sm mx-auto" style={{ color: '#94a3b8' }}>
                Una selección de nuestras creaciones más aclamadas, donde la técnica se encuentra con la pasión
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {featuredItems.slice(0, 8).map((item: any) => (
                <div key={item._id} className="rounded-xl overflow-hidden aspect-square relative group">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-3"
                      style={{ backgroundColor: primary + '20', border: `1px solid ${primary}30` }}>
                      <p className="text-xs font-bold text-center leading-tight" style={{ color: primary }}>
                        {item.name}
                      </p>
                      <p className="text-xs font-bold" style={{ color: primary }}>
                        ${item.price.toLocaleString('es-AR')}
                      </p>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                    <p className="text-white text-xs font-bold text-left">{item.name}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Footer (same structure as dine-in) ── */}
      <footer style={{ backgroundColor: '#1e293b' }}>
        <div className="max-w-2xl mx-auto px-4 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

            {/* Contact */}
            <div>
              <h4 className="font-bold text-base mb-4" style={{ color: primary }}>Contacto</h4>
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

            {/* About */}
            {profile.about && (
              <div>
                <h4 className="font-bold text-base mb-4" style={{ color: primary }}>Nuestra Historia</h4>
                <p className="text-sm leading-relaxed" style={{ color: '#94a3b8' }}>{profile.about}</p>
              </div>
            )}

            {/* Social */}
            {(profile.social?.instagram || profile.social?.facebook || profile.social?.twitter) && (
              <div>
                <h4 className="font-bold text-base mb-4" style={{ color: primary }}>Síguenos</h4>
                <div className="space-y-3">
                  {profile.social?.instagram && (
                    <a href={`https://instagram.com/${profile.social.instagram.replace('@', '')}`}
                      target="_blank" rel="noopener noreferrer" className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: primary }}>
                        <Instagram size={18} className="text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{tenant.name}</p>
                        <p className="text-xs" style={{ color: primary }}>Seguinos en Instagram</p>
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
                        <p className="text-xs" style={{ color: primary }}>Seguinos en Facebook</p>
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
                        <p className="text-xs" style={{ color: primary }}>Seguinos en Twitter</p>
                      </div>
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t px-4 py-4 max-w-2xl mx-auto flex items-center justify-between"
          style={{ borderColor: primary + '20' }}>
          <p className="text-xs" style={{ color: '#475569' }}>
            © {new Date().getFullYear()} {tenant.name}. Todos los derechos reservados.
          </p>
          <Link href={`/${tenant.slug}/admin`} className="opacity-20 hover:opacity-60 transition-opacity" title="Acceso administrador">
            <Settings size={14} style={{ color: '#94a3b8' }} />
          </Link>
        </div>
      </footer>

      {/* ── Fixed bottom cart bar ── */}
      {totalItems > 0 && !showCart && (
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
              <span>Ver pedido</span>
            </div>
            <span>${totalPrice.toLocaleString('es-AR')}</span>
          </button>
        </div>
      )}

      {/* ── Customization Modal ── */}
      {customizingItem && (
        <CustomizationModal
          item={customizingItem}
          onConfirm={handleConfirmCustomization}
          onClose={() => setCustomizingItem(null)}
          primaryColor={primary}
          bgColor={bg}
          textColor={text}
        />
      )}

      {/* ── Cart Drawer ── */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowCart(false)} />
          <div className="relative rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto" style={{ backgroundColor: bg }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-lg">Tu pedido</h3>
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
                        <button onClick={() => addPlainToCart({ _id: item.menuItemId, name: item.name, price: item.basePrice })}
                          className="w-7 h-7 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: primary, color: bg }}>
                          <Plus size={13} />
                        </button>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm truncate block">{item.name}</span>
                      {item.customizationSummary && (
                        <span className="text-xs opacity-50 truncate block">{item.customizationSummary}</span>
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
                <span>Total</span>
                <span style={{ color: primary }}>${totalPrice.toLocaleString('es-AR')}</span>
              </div>
            </div>

            <button onClick={goToCheckout} className="w-full py-4 rounded-2xl font-bold text-base"
              style={{ backgroundColor: primary, color: bg }}>
              Confirmar pedido →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Cart control sub-component ── */
function CartControl({
  item, cart, onAdd, onOpenModal, onRemove, totalQty, primary, bg, compact = false,
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
}) {
  const sz = compact ? 11 : 13
  const btnSz = compact ? 'w-6 h-6' : 'w-7 h-7'
  const hasCustomizations = (item.customizationGroups ?? []).length > 0

  if (hasCustomizations) {
    // Always show "+" that opens the modal; badge shows total qty across all instances
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
          onClick={() => onOpenModal(item)}
          className={`${btnSz} rounded-full flex items-center justify-center flex-shrink-0`}
          style={{ backgroundColor: primary, color: bg }}>
          <Plus size={sz} />
        </button>
      </div>
    )
  }

  // No customizations: inline +/- using the stable :plain cartItemId
  const plainId = `${item._id}:plain`
  const plainEntry = cart.find(i => i.cartItemId === plainId)

  if (plainEntry) {
    return (
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button onClick={() => onRemove(plainId)}
          className={`${btnSz} rounded-full flex items-center justify-center`}
          style={{ backgroundColor: primary + '20', color: primary }}>
          <Minus size={sz} />
        </button>
        <span className="text-sm font-bold w-4 text-center">{plainEntry.quantity}</span>
        <button onClick={() => onAdd(item)}
          className={`${btnSz} rounded-full flex items-center justify-center`}
          style={{ backgroundColor: primary, color: bg }}>
          <Plus size={sz} />
        </button>
      </div>
    )
  }

  return (
    <button onClick={() => onAdd(item)}
      className={`${btnSz} rounded-full flex items-center justify-center flex-shrink-0`}
      style={{ backgroundColor: primary, color: bg }}>
      <Plus size={sz} />
    </button>
  )
}
