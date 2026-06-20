'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { Search, Package, Clock, CheckCircle, CookingPot, ShoppingBag, Truck, X, Loader2, ArrowLeft, Phone, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AnimatedGradientText } from '@/registry/magicui/animated-gradient-text'

type OrderStatus = 'awaiting_payment' | 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled'

interface OrderResult {
  orderNumber: string
  status: OrderStatus
  createdAt: string
  orderMode: string
  trackingUrl: string
}

type ViewState = 'collapsed' | 'form' | 'loading' | 'results' | 'empty' | 'error'

const statusConfig: Record<OrderStatus, { label: string; icon: any; color: string }> = {
  awaiting_payment: { label: 'Pendiente de pago', icon: Clock, color: 'text-amber-400' },
  pending:          { label: 'Pendiente', icon: Clock, color: 'text-amber-400' },
  confirmed:        { label: 'Confirmado', icon: CheckCircle, color: 'text-emerald-400' },
  preparing:        { label: 'Preparando', icon: CookingPot, color: 'text-sky-400' },
  ready:            { label: 'Listo', icon: ShoppingBag, color: 'text-emerald-400' },
  delivered:        { label: 'Entregado', icon: Truck, color: 'text-zinc-400' },
  cancelled:        { label: 'Cancelado', icon: X, color: 'text-red-400' },
}

export default function OrderLookupByPhone({ tenantSlug }: { tenantSlug: string }) {
  const [viewState, setViewState] = useState<ViewState>('collapsed')
  const [phone, setPhone] = useState('')
  const [orders, setOrders] = useState<OrderResult[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleToggle = () => {
    if (viewState === 'collapsed') {
      setViewState('form')
      setTimeout(() => inputRef.current?.focus(), 100)
    } else {
      setViewState('collapsed')
      setPhone('')
      setOrders([])
      setErrorMsg('')
    }
  }

  const handleSearch = async () => {
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 6) return

    setViewState('loading')
    setErrorMsg('')

    try {
      const res = await fetch(`/api/${tenantSlug}/orders/lookup-by-phone?phone=${encodeURIComponent(digits)}`)
      const data = await res.json()

      if (!res.ok) {
        setErrorMsg(data.error || 'Error al buscar')
        setViewState('error')
        return
      }

      if (data.orders.length === 0) {
        setViewState('empty')
        return
      }

      setOrders(data.orders)
      setViewState('results')
    } catch {
      setErrorMsg('Error de conexión. Verificá tu conexión e intentá de nuevo.')
      setViewState('error')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '')
    setPhone(digits)
  }

  return (
    <div className="border-t" style={{ backgroundColor: '#1e293b', borderColor: '#ffffff15' }}>
      <div className="max-w-2xl mx-auto px-4 py-6">
        {viewState === 'collapsed' && (
          <button
            onClick={handleToggle}
            className="group relative mx-auto flex w-full items-center justify-center rounded-full px-5 py-3 shadow-[inset_0_-8px_10px_#8fdfff1f] transition-shadow duration-500 ease-out hover:shadow-[inset_0_-5px_10px_#8fdfff3f] cursor-pointer"
          >
            <span
              className={cn(
                "animate-gradient absolute inset-0 block h-full w-full rounded-[inherit] bg-gradient-to-r from-[#ffaa40]/50 via-[#9c40ff]/50 to-[#ffaa40]/50 bg-[length:300%_100%] p-[1px]"
              )}
              style={{
                WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                WebkitMaskComposite: "destination-out",
                mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                maskComposite: "subtract",
                WebkitClipPath: "padding-box",
              }}
            />
            <span className="flex items-center gap-2">
              <span className="text-lg">🔍</span>
              <span className="mx-2 h-5 w-px shrink-0 bg-neutral-500" />
              <AnimatedGradientText className="text-sm font-semibold">
                ¿Ya pediste? Seguí tu pedido
              </AnimatedGradientText>
              <ChevronRight className="ml-1 size-4 stroke-neutral-400 transition-transform duration-300 ease-in-out group-hover:translate-x-0.5" />
            </span>
          </button>
        )}

        {(viewState === 'form' || viewState === 'loading') && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">Buscar mi pedido</h4>
              <button
                onClick={handleToggle}
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: '#ffffff10' }}
              >
                <X size={14} className="text-zinc-400" />
              </button>
            </div>
            <p className="text-xs text-zinc-500">
              Ingresá el número de teléfono que usaste al hacer el pedido.
            </p>
            <div className="flex gap-2">
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl flex-1"
                style={{ backgroundColor: '#ffffff08', border: '1px solid #ffffff15' }}>
                <Phone size={14} className="text-zinc-500 shrink-0" />
                <span className="text-xs text-zinc-500 font-medium shrink-0">+54</span>
                <input
                  ref={inputRef}
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={e => formatPhone(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="11 5012 3456"
                  className="bg-transparent text-sm text-white placeholder:text-zinc-600 outline-none w-full min-w-0"
                  disabled={viewState === 'loading'}
                  maxLength={15}
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={viewState === 'loading' || phone.replace(/\D/g, '').length < 6}
                className="px-4 py-2.5 rounded-xl font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                style={{ backgroundColor: '#f14722', color: '#fff' }}
              >
                {viewState === 'loading' ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Search size={16} />
                )}
                <span className="hidden sm:inline">Buscar</span>
              </button>
            </div>
          </div>
        )}

        {viewState === 'loading' && (
          <div className="flex items-center justify-center gap-2 py-6">
            <Loader2 size={16} className="animate-spin text-emerald-400" />
            <span className="text-sm text-zinc-400">Buscando pedidos...</span>
          </div>
        )}

        {viewState === 'results' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white">Tus pedidos</h4>
                <p className="text-xs text-zinc-500">Últimos 7 días</p>
              </div>
              <button
                onClick={() => { setViewState('form'); setOrders([]); }}
                className="text-xs font-semibold transition-opacity hover:opacity-70"
                style={{ color: '#f14722' }}
              >
                Buscar otro
              </button>
            </div>
            <div className="space-y-2">
              {orders.map(order => {
                const cfg = statusConfig[order.status] || statusConfig.cancelled
                const StatusIcon = cfg.icon
                return (
                  <Link
                    key={order.orderNumber}
                    href={order.trackingUrl}
                    className="flex items-center gap-3 p-3 rounded-xl transition-all hover:opacity-80 group"
                    style={{ backgroundColor: '#ffffff08' }}
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: '#ffffff10' }}>
                      <StatusIcon size={15} className={cfg.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        Pedido #{order.orderNumber}
                      </p>
                      <p className="text-xs flex items-center gap-1.5">
                        <span className={cfg.color}>{cfg.label}</span>
                        <span className="text-zinc-600">•</span>
                        <span className="text-zinc-500">
                          {new Date(order.createdAt).toLocaleDateString('es-AR', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </p>
                    </div>
                    <ArrowLeft size={16} className="text-zinc-600 rotate-180 group-hover:translate-x-0.5 transition-transform shrink-0" />
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {viewState === 'empty' && (
          <div className="text-center py-4 space-y-3">
            <Package size={28} className="mx-auto text-zinc-600" />
            <div>
              <p className="text-sm font-semibold text-white">No encontramos pedidos</p>
              <p className="text-xs text-zinc-500 mt-1">
                No hay pedidos recientes con ese número de teléfono. Verificá que sea el mismo número que usaste al pedir.
              </p>
            </div>
            <button
              onClick={() => setViewState('form')}
              className="text-xs font-semibold transition-opacity hover:opacity-70"
              style={{ color: '#f14722' }}
            >
              Intentar con otro número
            </button>
          </div>
        )}

        {viewState === 'error' && (
          <div className="text-center py-4 space-y-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto"
              style={{ backgroundColor: '#ef444420' }}>
              <X size={18} className="text-red-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Algo salió mal</p>
              <p className="text-xs text-zinc-500 mt-1">{errorMsg}</p>
            </div>
            <button
              onClick={handleSearch}
              className="text-xs font-semibold transition-opacity hover:opacity-70"
              style={{ color: '#f14722' }}
            >
              Intentar de nuevo
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
