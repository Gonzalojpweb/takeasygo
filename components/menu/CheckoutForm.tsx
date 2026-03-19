'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Minus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { CartItem } from '@/types/cart'

interface Props {
  tenantSlug: string
  locationId: string
  mode: 'takeaway' | 'dine-in'
}

export default function CheckoutForm({ tenantSlug, locationId, mode }: Props) {
  const router = useRouter()
  const [cart, setCart] = useState<CartItem[]>([])
  const [upsellHints, setUpsellHints] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' })
  const [activeOrderNumber, setActiveOrderNumber] = useState<string | null>(null)

  useEffect(() => {
    const saved = sessionStorage.getItem('cart')
    if (!saved) {
      router.back()
      return
    }
    setCart(JSON.parse(saved))

    const hints = sessionStorage.getItem('upsellHints')
    if (hints) {
      setUpsellHints(JSON.parse(hints))
      sessionStorage.removeItem('upsellHints')
    }
  }, [])

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
      }]
    })
    setUpsellHints(prev => prev.filter(h => h._id !== item._id))
  }

  const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
  // total se recalcula automáticamente al agregar hints (cart es estado)

async function handleSubmit(e: React.FormEvent) {
  e.preventDefault()
  if (!form.name.trim()) return toast.error('El nombre es obligatorio')
  setLoading(true)

  try {
    // 1. Crear la orden
    const orderRes = await fetch(`/api/${tenantSlug}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locationId,
        customer: { name: form.name, phone: form.phone, email: form.email },
        items: cart,
        notes: form.notes,
        clientToken: localStorage.getItem('tgo-client-token') ?? undefined,
      }),
    })

    if (orderRes.status === 409) {
      const data = await orderRes.json()
      setActiveOrderNumber(data.activeOrderNumber)
      setLoading(false)
      return
    }

    if (!orderRes.ok) throw new Error('Error al crear el pedido')
    const { order } = await orderRes.json()

    // 2. Crear preferencia de MP
    const prefRes = await fetch(`/api/${tenantSlug}/payments/create-preference`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: order._id }),
    })
    if (!prefRes.ok) throw new Error('Error al crear el pago')
    const { sandboxInitPoint, initPoint } = await prefRes.json()

    sessionStorage.removeItem('cart')

    // En desarrollo usamos sandbox, en producción initPoint
    const redirectUrl = process.env.NODE_ENV === 'development' ? sandboxInitPoint : initPoint
    window.location.href = redirectUrl

  } catch (err: any) {
    toast.error(err.message || 'Error al procesar el pedido')
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
                  <div key={item.cartItemId} className="flex items-center gap-3">
                    {/* Controles de cantidad */}
                    <div className="flex items-center gap-2 flex-shrink-0">
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
                      <p className="text-sm font-medium text-zinc-700 truncate">{item.name}</p>
                      {item.customizationSummary && (
                        <p className="text-xs text-zinc-400 truncate">{item.customizationSummary}</p>
                      )}
                    </div>

                    {/* Subtotal */}
                    <span className="text-sm font-semibold text-zinc-800 flex-shrink-0">
                      ${(item.price * item.quantity).toLocaleString('es-AR')}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {cart.length > 0 && (
            <div className="border-t border-zinc-200 mt-4 pt-3 flex justify-between font-bold">
              <span>Total</span>
              <span>${total.toLocaleString('es-AR')}</span>
            </div>
          )}
        </div>

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
          <input
            placeholder="Teléfono (opcional)"
            type="tel"
            value={form.phone}
            onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
            className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-zinc-400"
          />
          <input
            placeholder="Email (opcional)"
            type="email"
            value={form.email}
            onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-zinc-400"
          />
          <textarea
            placeholder="Notas o aclaraciones (opcional)"
            value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            rows={3}
            className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-zinc-400 resize-none"
          />

<button
  type="submit"
  disabled={loading || cart.length === 0}
  className="w-full py-4 rounded-2xl bg-zinc-900 text-white font-bold text-base disabled:opacity-50">
  {loading ? 'Procesando...' : '💳 Pagar con MercadoPago'}
</button>
        </form>
      </div>
    </div>
  )
}