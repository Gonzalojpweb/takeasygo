'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toPesos } from '@takeasygo/business/browser'
import { toast } from 'sonner'

/**
 * Segunda salida para un pedido varado en `awaiting_payment`: cambiar el método
 * de pago SIN perder el pedido.
 *
 * Complementa a la cancelación. Cancelar obliga a rearmar el carrito desde cero;
 * acá el cliente conserva su pedido y su número, ve cuánto cambia el total y
 * elige. Efectivo y transferencia no dependen de que MP o Kripton estén
 * funcionando, que es justamente lo que falló en el incidente que motivó esto.
 *
 * ── LOS TOTALES VIENEN DEL SERVER ────────────────────────────────────────────
 * Este componente no multiplica precios: pide la cotización a
 * `GET .../payment-options`. Si el cliente calculara, el total mostrado podría
 * no ser el que `change-payment-method` persiste, y el cliente pagaría una cosa
 * distinta de la que se le cobró.
 *
 * ── ROLLBACK ─────────────────────────────────────────────────────────────────
 * Si la preferencia de MP/Kripton falla, la orden NO se cancela (se manda
 * `retry: true`). Se avisa, se vuelve a mostrar el panel y el cliente puede
 * elegir efectivo o transferencia.
 */

interface PaymentOption {
  id: 'mercadopago' | 'kripton' | 'transfer' | 'cash'
  label: string
  description: string
  enabled: boolean
  total: number
  delta: number
  cashDiscountPercent?: number
  isCurrent: boolean
}

interface TransferInfo {
  alias: string | null
  cbu: string | null
  cvu: string | null
  bankName: string | null
  holderName: string | null
}

interface Props {
  tenantSlug: string
  orderId: string
  orderNumber: string
  /** OBLIGATORIO: lo exigen `payment-options` y `change-payment-method`. */
  trackingToken: string | null
  primaryColor: string
  textColor: string
  /** Se dispara cuando el método cambió, para que el padre refresque el estado. */
  onChanged?: () => void
}

export default function PaymentMethodRetry({
  tenantSlug,
  orderId,
  orderNumber,
  trackingToken,
  primaryColor,
  textColor,
  onChanged,
}: Props) {
  const [open, setOpen] = useState(false)
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [options, setOptions] = useState<PaymentOption[]>([])
  const [currentTotal, setCurrentTotal] = useState<number | null>(null)
  const [transfer, setTransfer] = useState<TransferInfo | null>(null)
  const router = useRouter()

  // Si el padre no pasa `onChanged` (páginas de servidor, que no pueden pasar
  // funciones), refrescamos igual: sin esto el cliente quedaría mirando "pago
  // rechazado" después de haber pagado en efectivo.
  const notifyChanged = useCallback(() => {
    if (onChanged) onChanged()
    else router.refresh()
  }, [onChanged, router])

  const loadOptions = useCallback(async () => {
    if (!trackingToken) return
    setLoadingOptions(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/orders/${orderId}/payment-options`, {
        headers: { 'x-tracking-token': trackingToken },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'No se pudieron cargar los métodos de pago')
      }
      const data = await res.json()
      setOptions((data.options || []).filter((o: PaymentOption) => o.enabled))
      setCurrentTotal(data.currentTotal)
      setTransfer(data.transfer || null)
    } catch (err: any) {
      toast.error(err.message || 'No se pudieron cargar los métodos de pago')
    } finally {
      setLoadingOptions(false)
    }
  }, [tenantSlug, orderId, trackingToken])

  // Se pide la cotización recién cuando el cliente abre el panel: antes no
  // hace falta y cada página de tracking dispara un request de más.
  useEffect(() => {
    if (open) loadOptions()
  }, [open, loadOptions])

  async function choose(option: PaymentOption) {
    if (!trackingToken || submitting) return

    // ── Confirmación antes de tocar el pedido ──────────────────────────────
    // Cambiar el método recalcula el total del pedido. El cliente tiene que ver
    // la diferencia y confirmar, no que el precio le cambie solo.
    const from = currentTotal
    const detail =
      from === null
        ? `El total pasa a $${toPesos(option.total).toLocaleString('es-AR')}.`
        : `El total pasa de $${toPesos(from).toLocaleString('es-AR')} a $${toPesos(
            option.total
          ).toLocaleString('es-AR')}.`
    const action =
      option.id === 'mercadopago' || option.id === 'kripton'
        ? ' Se abrirá el pago en otra pantalla.'
        : ''
    if (
      !confirm(
        `¿Cambiar a ${option.label}?\n\n${detail}${option.delta !== 0 ? ` ${deltaLabel(option.delta).trim()}.` : ''}${action}`
      )
    ) {
      return
    }

    setSubmitting(option.id)

    try {
      const res = await fetch(`/api/${tenantSlug}/orders/${orderId}/change-payment-method`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tracking-token': trackingToken,
        },
        body: JSON.stringify({ method: option.id }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || 'No se pudo cambiar el método de pago')
      }

      // Efectivo y transferencia no necesitan preferencia externa: la orden
      // ya quedó lista (confirmada o esperando la transferencia).
      if (!data.requiresPreference) {
        toast.success(
          option.id === 'cash'
            ? 'Listo: vas a pagar en efectivo al retirar'
            : 'Listo: seguí con los datos de la transferencia'
        )
        setOpen(false)
        notifyChanged()
        return
      }

      // MP / Kripton: hay que generar la preferencia. `retry: true` evita que
      // un fallo acá cancele la orden.
      const endpoint =
        option.id === 'mercadopago'
          ? `/api/${tenantSlug}/payments/create-preference`
          : `/api/${tenantSlug}/payments/create-kripton-preference`

      const prefRes = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, retry: true }),
      })

      if (!prefRes.ok) {
        const prefData = await prefRes.json().catch(() => null)
        // La orden sigue viva: se reintenta con otro método sin perder nada.
        toast.error(
          prefData?.error ||
            'No pudimos abrir el pago. Tu pedido sigue reservado: elegí otro método.'
        )
        setSubmitting(null)
        await loadOptions()
        return
      }

      const prefData = await prefRes.json()
      const redirectUrl =
        option.id === 'mercadopago'
          ? process.env.NODE_ENV === 'development'
            ? prefData.sandboxInitPoint || prefData.initPoint
            : prefData.initPoint
          : prefData.url

      if (!redirectUrl) {
        toast.error('No pudimos abrir el pago. Tu pedido sigue reservado: elegí otro método.')
        setSubmitting(null)
        await loadOptions()
        return
      }

      window.location.href = redirectUrl
    } catch (err: any) {
      toast.error(err.message || 'No se pudo cambiar el método de pago')
      setSubmitting(null)
    }
  }

  const deltaLabel = (delta: number) => {
    if (delta === 0) return 'Mismo precio que ahora'
    const sign = delta > 0 ? '+' : '−'
    return `${sign}$${toPesos(Math.abs(delta)).toLocaleString('es-AR')}`
  }

  if (!trackingToken) return null

  return (
    <div className="space-y-3">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full py-3 rounded-2xl font-bold text-sm transition-opacity hover:opacity-90 text-white"
          style={{ backgroundColor: primaryColor }}
        >
          Probar otro método de pago
        </button>
      ) : (
        <div
          className="rounded-2xl border-2 p-4 space-y-3"
          style={{ borderColor: primaryColor + '40', backgroundColor: primaryColor + '08' }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-bold text-sm" style={{ color: textColor }}>
              Elegí cómo pagar el pedido #{orderNumber}
            </p>
            <button
              onClick={() => setOpen(false)}
              className="text-xs underline opacity-60 hover:opacity-100"
              style={{ color: primaryColor }}
            >
              Cerrar
            </button>
          </div>

          {loadingOptions && (
            <div className="flex items-center gap-2 text-xs opacity-60">
              <Loader2 size={14} className="animate-spin" />
              Calculando totales...
            </div>
          )}

          {!loadingOptions && options.length === 0 && (
            <p className="text-xs opacity-60">
              No hay métodos de pago disponibles en este momento.
            </p>
          )}

          {!loadingOptions &&
            options.map((opt) => {
              const busy = submitting === opt.id
              const blocked = !!submitting && !busy
              return (
                <button
                  key={opt.id}
                  onClick={() => choose(opt)}
                  disabled={!!submitting}
                  className="w-full text-left rounded-xl border-2 p-3 transition-colors disabled:opacity-50"
                  style={{
                    borderColor: opt.isCurrent ? primaryColor + '60' : primaryColor + '25',
                    backgroundColor: opt.isCurrent ? primaryColor + '10' : 'transparent',
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold text-sm" style={{ color: textColor }}>
                      {opt.label}
                    </span>
                    <span className="text-sm font-bold" style={{ color: primaryColor }}>
                      ${toPesos(opt.total).toLocaleString('es-AR')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-1">
                    <span className="text-xs opacity-60">{opt.description}</span>
{opt.delta !== 0 && (
                        <span
                          className={`text-xs font-semibold ${
                            opt.delta > 0 ? 'text-red-600' : 'text-emerald-600'
                          }`}
                        >
                          {deltaLabel(opt.delta)}
                        </span>
                      )}
                  </div>
                  {opt.id === 'transfer' && transfer?.alias && (
                    <p className="text-xs opacity-70 mt-1">Alias: {transfer.alias}</p>
                  )}
                  {opt.id === 'cash' && opt.cashDiscountPercent ? (
                    <p className="text-xs opacity-70 mt-1">
                      Descuento en efectivo: {opt.cashDiscountPercent}%
                    </p>
                  ) : null}
                  {opt.isCurrent && (
                    <p className="text-xs opacity-60 mt-1">
                      Es el método actual — elegilo para reintentar
                    </p>
                  )}
                  {busy && (
                    <span className="flex items-center gap-1 text-xs mt-2" style={{ color: primaryColor }}>
                      <Loader2 size={12} className="animate-spin" />
                      Procesando...
                    </span>
                  )}
                  {blocked && <span className="sr-only">Esperando...</span>}
                </button>
              )
            })}

          <p className="text-xs opacity-60 leading-relaxed">
            Tu pedido no se cobra hasta que elijas un método. Si alguno falla, podés
            probar otro sin perder el pedido.
          </p>
        </div>
      )}
    </div>
  )
}