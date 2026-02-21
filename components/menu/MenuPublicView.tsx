'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ShoppingCart, X, Plus, Minus } from 'lucide-react'
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

export default function MenuPublicView({ tenant, location, menu, mode }: Props) {
  const [cart, setCart] = useState<CartItem[]>([])
  const [showCart, setShowCart] = useState(false)
  const branding = tenant.branding
  const router = useRouter()

  function addToCart(item: any) {
    setCart(prev => {
      const existing = prev.find(i => i.menuItemId === item._id)
      if (existing) {
        return prev.map(i => i.menuItemId === item._id
          ? { ...i, quantity: i.quantity + 1 }
          : i
        )
      }
      return [...prev, { menuItemId: item._id, name: item.name, price: item.price, quantity: 1 }]
    })
  }

  function removeFromCart(menuItemId: string) {
    setCart(prev => {
      const existing = prev.find(i => i.menuItemId === menuItemId)
      if (existing && existing.quantity > 1) {
        return prev.map(i => i.menuItemId === menuItemId
          ? { ...i, quantity: i.quantity - 1 }
          : i
        )
      }
      return prev.filter(i => i.menuItemId !== menuItemId)
    })
  }

  const totalItems = cart.reduce((sum, i) => sum + i.quantity, 0)
  const totalPrice = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)

  const cssVars = {
    '--color-primary': branding.primaryColor,
    '--color-bg': branding.backgroundColor,
    '--color-text': branding.textColor,
  } as React.CSSProperties

  return (
    <div style={{ ...cssVars, backgroundColor: branding.backgroundColor, color: branding.textColor }}
      className="min-h-screen pb-32">

      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md border-b"
        style={{ borderColor: branding.primaryColor + '20', backgroundColor: branding.backgroundColor + 'ee' }}>
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/${tenant.slug}/menu/${location._id}`}>
              <ArrowLeft size={20} style={{ color: branding.primaryColor }} />
            </Link>
            {branding.logoUrl
              ? <img src={branding.logoUrl} alt={tenant.name} className="h-8 object-contain" />
              : <span className="font-bold text-lg" style={{ color: branding.primaryColor }}>{tenant.name}</span>
            }
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs opacity-50">{mode === 'takeaway' ? '🥡 Para llevar' : '🍽️ En local'}</span>
            {totalItems > 0 && !showCart && mode === 'takeaway' && (
              <button onClick={() => setShowCart(true)}
                className="relative flex items-center gap-2 px-3 py-2 rounded-xl font-semibold text-sm"
                style={{ backgroundColor: branding.primaryColor, color: branding.backgroundColor }}>
                <ShoppingCart size={16} />
                <span>{totalItems}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Menu */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        {menu.categories
          .filter((cat: any) => cat.isAvailable)
          .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
          .map((category: any) => (
            <section key={category._id} className="mb-8">
              <h2 className="text-xl font-bold mb-3 pb-2 border-b"
                style={{ borderColor: branding.primaryColor + '40', color: branding.primaryColor }}>
                {category.name}
              </h2>
              <div className={branding.menuLayout === 'grid' ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-3'}>
                {category.items
                  .filter((item: any) => item.isAvailable)
                  .map((item: any) => {
                    const cartItem = cart.find(i => i.menuItemId === item._id)
                    return (

<div key={item._id}
  className="border rounded-xl overflow-hidden"
  style={{
    borderColor: branding.primaryColor + '20',
    borderRadius: branding.borderRadius === 'sharp' ? '0' : branding.borderRadius === 'pill' ? '16px' : '12px'
  }}>
  {item.imageUrl && (
    <img src={item.imageUrl} alt={item.name} className="w-full h-32 object-cover" />
  )}
  <div className="p-3">
    <p className="font-semibold text-sm">{item.name}</p>
    {item.description && (
      <p className="text-xs opacity-50 mt-1 line-clamp-2">{item.description}</p>
    )}
    <div className="flex items-center justify-between mt-2">
      <p className="font-bold text-sm" style={{ color: branding.primaryColor }}>
        ${item.price.toLocaleString('es-AR')}
      </p>
      {mode === 'takeaway' && (
        cartItem ? (
          <div className="flex items-center gap-2">
            <button onClick={() => removeFromCart(item._id)}
              className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{ backgroundColor: branding.primaryColor + '20', color: branding.primaryColor }}>
              <Minus size={12} />
            </button>
            <span className="text-sm font-bold w-4 text-center">{cartItem.quantity}</span>
            <button onClick={() => addToCart(item)}
              className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{ backgroundColor: branding.primaryColor, color: branding.backgroundColor }}>
              <Plus size={12} />
            </button>
          </div>
        ) : (
          <button onClick={() => addToCart(item)}
            className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{ backgroundColor: branding.primaryColor, color: branding.backgroundColor }}>
            <Plus size={14} />
          </button>
        )
      )}
    </div>
  </div>
</div>
                    )
                  })}
              </div>
            </section>
          ))}
      </main>

      {/* Cart button fijo */}
      {totalItems > 0 && !showCart && (
        <div className="fixed bottom-6 left-0 right-0 flex justify-center px-4 z-40">
<button
  onClick={() => {
    // Guardamos el carrito en sessionStorage para recuperarlo en checkout
    sessionStorage.setItem('cart', JSON.stringify(cart))
    sessionStorage.setItem('mode', mode)
    router.push(`/${tenant.slug}/menu/${location._id}/${mode}/checkout`)
  }}
  className="w-full py-4 rounded-2xl font-bold text-base"
  style={{ backgroundColor: branding.primaryColor, color: branding.backgroundColor }}>
  {mode === 'takeaway' ? 'Confirmar pedido' : 'Pedir a la mesa'}
</button>
        </div>
      )}

      {/* Cart drawer */}
      {showCart && mode === 'takeaway' && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCart(false)} />
          <div className="relative rounded-t-3xl p-6 max-h-[80vh] overflow-y-auto"
            style={{ backgroundColor: branding.backgroundColor }}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-lg">Tu pedido</h3>
              <button onClick={() => setShowCart(false)}>
                <X size={20} className="opacity-50" />
              </button>
            </div>

            <div className="space-y-3 mb-6">
              {cart.map(item => (
                <div key={item.menuItemId} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => removeFromCart(item.menuItemId)}
                        className="w-6 h-6 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: branding.primaryColor + '20', color: branding.primaryColor }}>
                        <Minus size={12} />
                      </button>
                      <span className="text-sm font-bold w-4 text-center">{item.quantity}</span>
                      <button onClick={() => addToCart({ _id: item.menuItemId, name: item.name, price: item.price })}
                        className="w-6 h-6 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: branding.primaryColor, color: branding.backgroundColor }}>
                        <Plus size={12} />
                      </button>
                    </div>
                    <span className="text-sm">{item.name}</span>
                  </div>
                  <span className="text-sm font-bold">${(item.price * item.quantity).toLocaleString('es-AR')}</span>
                </div>
              ))}
            </div>

            <div className="border-t pt-4 mb-6" style={{ borderColor: branding.primaryColor + '20' }}>
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span style={{ color: branding.primaryColor }}>${totalPrice.toLocaleString('es-AR')}</span>
              </div>
            </div>

            <button
              className="w-full py-4 rounded-2xl font-bold text-base"
              style={{ backgroundColor: branding.primaryColor, color: branding.backgroundColor }}>
              {mode === 'takeaway' ? 'Confirmar pedido' : 'Pedir a la mesa'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}