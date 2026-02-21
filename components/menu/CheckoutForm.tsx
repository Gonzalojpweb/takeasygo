'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  tenantSlug: string
  locationId: string
  mode: 'takeaway' | 'dine-in'
}

export default function CheckoutForm({ tenantSlug, locationId, mode }: Props) {
  const router = useRouter()
  const [cart, setCart] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' })

  useEffect(() => {
    const saved = sessionStorage.getItem('cart')
    if (!saved) {
      router.back()
      return
    }
    setCart(JSON.parse(saved))
  }, [])

  const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('El nombre es obligatorio')
    setLoading(true)

    try {
      const res = await fetch(`/api/${tenantSlug}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId,
          customer: { name: form.name, phone: form.phone, email: form.email },
          items: cart,
          notes: form.notes,
        }),
      })

      if (!res.ok) throw new Error()

      const { order } = await res.json()
      sessionStorage.removeItem('cart')
      router.push(`/${tenantSlug}/tracking/${order.orderNumber}`)
    } catch {
      toast.error('Error al crear el pedido')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()}>
          <ArrowLeft size={20} className="text-zinc-600" />
        </button>
        <h1 className="font-bold text-lg">Tu pedido</h1>
      </header>

      <div className="max-w-md mx-auto px-4 py-6">
        {/* Resumen */}
        <div className="bg-zinc-50 rounded-2xl p-4 mb-6">
          <h2 className="font-semibold text-sm text-zinc-500 mb-3 uppercase tracking-wide">Resumen</h2>
          <div className="space-y-2">
            {cart.map((item: any) => (
              <div key={item.menuItemId} className="flex justify-between text-sm">
                <span className="text-zinc-700">{item.quantity}x {item.name}</span>
                <span className="font-medium">${(item.price * item.quantity).toLocaleString('es-AR')}</span>
              </div>
            ))}
          </div>
          <div className="border-t mt-3 pt-3 flex justify-between font-bold">
            <span>Total</span>
            <span>${total.toLocaleString('es-AR')}</span>
          </div>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <h2 className="font-semibold text-sm text-zinc-500 uppercase tracking-wide">Tus datos</h2>

          <input
            required
            placeholder="Nombre *"
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400"
          />
          <input
            placeholder="Teléfono (opcional)"
            value={form.phone}
            onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
            className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400"
          />
          <input
            placeholder="Email (opcional)"
            type="email"
            value={form.email}
            onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400"
          />
          <textarea
            placeholder="Notas o aclaraciones (opcional)"
            value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            rows={3}
            className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400 resize-none"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-2xl bg-zinc-900 text-white font-bold text-base disabled:opacity-50">
            {loading ? 'Enviando...' : 'Hacer pedido'}
          </button>
        </form>
      </div>
    </div>
  )
}