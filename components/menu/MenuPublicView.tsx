'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ShoppingCart, X, Plus, Minus, Leaf, UtensilsCrossed, Settings } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface CartItem {
  menuItemId: string
  name: string
  price: number
  quantity: number
}

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
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const branding = tenant.branding
  const router = useRouter()

  const categories = menu.categories
    .filter((cat: any) => cat.isAvailable)
    .sort((a: any, b: any) => a.sortOrder - b.sortOrder)

  const featuredItems = categories.flatMap((cat: any) =>
    cat.items.filter((i: any) => i.isAvailable && i.isFeatured)
  )

  // Intersection observer for sticky nav active tracking
  useEffect(() => {
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
  }, [categories])

  function addToCart(item: any) {
    setCart(prev => {
      const existing = prev.find(i => i.menuItemId === item._id)
      if (existing) {
        return prev.map(i => i.menuItemId === item._id ? { ...i, quantity: i.quantity + 1 } : i)
      }
      return [...prev, { menuItemId: item._id, name: item.name, price: item.price, quantity: 1 }]
    })
  }

  function removeFromCart(menuItemId: string) {
    setCart(prev => {
      const existing = prev.find(i => i.menuItemId === menuItemId)
      if (existing && existing.quantity > 1) {
        return prev.map(i => i.menuItemId === menuItemId ? { ...i, quantity: i.quantity - 1 } : i)
      }
      return prev.filter(i => i.menuItemId !== menuItemId)
    })
  }

  function goToCheckout() {
    sessionStorage.setItem('cart', JSON.stringify(cart))
    sessionStorage.setItem('mode', mode)
    router.push(`/${tenant.slug}/menu/${location._id}/${mode}/checkout`)
  }

  const totalItems = cart.reduce((sum, i) => sum + i.quantity, 0)
  const totalPrice = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)

  const primary = branding.primaryColor
  const bg = branding.backgroundColor
  const text = branding.textColor

  const borderStyle = branding.borderRadius === 'sharp' ? '0px'
    : branding.borderRadius === 'pill' ? '16px' : '10px'

  function scrollTo(categoryId: string) {
    const el = sectionRefs.current[categoryId]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div style={{ backgroundColor: bg, color: text }} className="min-h-screen">

      {/* ── Sticky Header ── */}
      <header className="sticky top-0 z-40 backdrop-blur-md border-b"
        style={{ backgroundColor: bg + 'ee', borderColor: primary + '20' }}>
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

        {/* Category nav */}
        <nav className="border-t overflow-x-auto scrollbar-hide" style={{ borderColor: primary + '15' }}>
          <div className="flex gap-1 px-4 py-2 max-w-2xl mx-auto w-max min-w-full">
            {categories.map((cat: any) => (
              <button
                key={cat._id}
                onClick={() => scrollTo(cat._id)}
                className="whitespace-nowrap text-xs font-medium px-3 py-1.5 rounded-full transition-all"
                style={{
                  backgroundColor: activeCategory === cat._id ? primary : 'transparent',
                  color: activeCategory === cat._id ? bg : text + '80',
                  border: `1px solid ${activeCategory === cat._id ? primary : primary + '30'}`,
                }}>
                {cat.name}
              </button>
            ))}
          </div>
        </nav>
      </header>

      {/* ── Main Menu ── */}
      <main className="max-w-2xl mx-auto px-4 pt-6 pb-32">

        {/* Featured items */}
        {featuredItems.length > 0 && (
          <section className="mb-8 rounded-2xl overflow-hidden border" style={{ borderColor: primary + '25' }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: primary + '25', backgroundColor: primary + '10' }}>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: primary }}>
                ⭐ Destacados
              </p>
            </div>
            <div className="divide-y" style={{ '--divider': primary + '15' } as React.CSSProperties}>
              {featuredItems.map((item: any) => {
                const cartItem = cart.find(i => i.menuItemId === item._id)
                const veg = isVegetarian(item.tags || [])
                return (
                  <div key={item._id} className="flex items-center gap-3 px-4 py-3"
                    style={{ borderColor: primary + '15' }}>
                    {item.imageUrl
                      ? <img src={item.imageUrl} alt={item.name} className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
                      : <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: primary + '15' }}>
                          {veg
                            ? <Leaf size={16} style={{ color: '#22c55e' }} />
                            : <UtensilsCrossed size={14} style={{ color: primary + '80' }} />}
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
                    <CartControl item={item} cartItem={cartItem} onAdd={addToCart} onRemove={removeFromCart} primary={primary} bg={bg} />
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
            className="mb-8 scroll-mt-32">
            <h2 className="text-base font-bold mb-3 pb-2 border-b tracking-wide uppercase text-xs"
              style={{ borderColor: primary + '30', color: primary }}>
              {category.name}
            </h2>
            <div className={branding.menuLayout === 'grid' ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-2'}>
              {category.items
                .filter((item: any) => item.isAvailable)
                .map((item: any) => {
                  const cartItem = cart.find(i => i.menuItemId === item._id)
                  const veg = isVegetarian(item.tags || [])

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
                            <CartControl item={item} cartItem={cartItem} onAdd={addToCart} onRemove={removeFromCart} primary={primary} bg={bg} compact />
                          </div>
                          {(item.tags || []).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {(item.tags || []).map((tag: string) => (
                                <span key={tag} className="text-xs px-1 py-0.5 rounded-full"
                                  style={{ backgroundColor: primary + '12', color: primary + 'cc' }}>
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  }

                  // List layout
                  return (
                    <div key={item._id}
                      className="flex items-center gap-3 py-3 border-b"
                      style={{ borderColor: primary + '15' }}>
                      {item.imageUrl
                        ? <img src={item.imageUrl} alt={item.name} className="w-16 h-16 object-cover rounded-xl flex-shrink-0" />
                        : <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: primary + '12' }}>
                            {veg
                              ? <Leaf size={14} style={{ color: '#22c55e' }} />
                              : <UtensilsCrossed size={13} style={{ color: primary + '70' }} />}
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
                              style={{ backgroundColor: primary + '12', color: primary + 'cc' }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <CartControl item={item} cartItem={cartItem} onAdd={addToCart} onRemove={removeFromCart} primary={primary} bg={bg} />
                    </div>
                  )
                })}
            </div>
          </section>
        ))}

        {/* Admin access */}
        <div className="pt-6 pb-2 text-center border-t" style={{ borderColor: primary + '15' }}>
          <Link href={`/${tenant.slug}/admin`} className="opacity-20 hover:opacity-50 transition-opacity inline-block">
            <Settings size={16} style={{ color: text }} />
          </Link>
        </div>
      </main>

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

      {/* ── Cart Drawer ── */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowCart(false)} />
          <div className="relative rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto"
            style={{ backgroundColor: bg }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-lg">Tu pedido</h3>
              <button onClick={() => setShowCart(false)} className="opacity-40 hover:opacity-70">
                <X size={20} style={{ color: text }} />
              </button>
            </div>

            <div className="space-y-3 mb-6">
              {cart.map(item => (
                <div key={item.menuItemId} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <button onClick={() => removeFromCart(item.menuItemId)}
                        className="w-7 h-7 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: primary + '20', color: primary }}>
                        <Minus size={13} />
                      </button>
                      <span className="text-sm font-bold w-4 text-center">{item.quantity}</span>
                      <button onClick={() => addToCart({ _id: item.menuItemId, name: item.name, price: item.price })}
                        className="w-7 h-7 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: primary, color: bg }}>
                        <Plus size={13} />
                      </button>
                    </div>
                    <span className="text-sm truncate">{item.name}</span>
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

            <button
              onClick={goToCheckout}
              className="w-full py-4 rounded-2xl font-bold text-base"
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
  item, cartItem, onAdd, onRemove, primary, bg, compact = false,
}: {
  item: any
  cartItem: CartItem | undefined
  onAdd: (item: any) => void
  onRemove: (id: string) => void
  primary: string
  bg: string
  compact?: boolean
}) {
  const sz = compact ? 11 : 13
  const btnSz = compact ? 'w-6 h-6' : 'w-7 h-7'

  if (cartItem) {
    return (
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button onClick={() => onRemove(item._id)}
          className={`${btnSz} rounded-full flex items-center justify-center`}
          style={{ backgroundColor: primary + '20', color: primary }}>
          <Minus size={sz} />
        </button>
        <span className="text-sm font-bold w-4 text-center">{cartItem.quantity}</span>
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
