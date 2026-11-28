import { useEffect, useRef, useState } from "react"
import { Gift, Loader2, ScanLine } from "lucide-react"
import { previewNetworkBenefit, type NetworkBenefitPreview } from "../../services/order"
import { PosApiError } from "../../services/pos-api"
import { formatCurrency } from "../../utils/format"

// ============================================================================
// Beneficio de la red de comercios (multi-rubro, etapa 6)
// ============================================================================
// 1) Escanear el QR del cliente (lector como teclado) o tipear el código.
// 2) Validar: el servidor muestra el descuento sobre esta cuenta.
// 3) Aplicar: se canjea (uso único) y el descuento entra a la cuenta como uno
//    más (reporte de descuentos, cierre Z). Necesita internet.
// ============================================================================

interface Props {
  tenantId: string
  orderId: string
  target: string
  busy: boolean
  onConfirm: (code: string) => void
  onCancel: () => void
}

export function NetworkBenefitDialog({ tenantId, orderId, target, busy, onConfirm, onCancel }: Props) {
  const [code, setCode] = useState("")
  const [preview, setPreview] = useState<NetworkBenefitPreview | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const online = typeof navigator === "undefined" ? true : navigator.onLine

  useEffect(() => { inputRef.current?.focus() }, [])

  async function validate() {
    if (!code.trim()) { setError("Escaneá el QR del cliente o tipeá el código"); return }
    setChecking(true)
    setError(null)
    try {
      setPreview(await previewNetworkBenefit(tenantId, orderId, code.trim()))
    } catch (err) {
      setPreview(null)
      setError(err instanceof PosApiError && err.status >= 400 && err.status < 500 && err.status !== 401 ? err.message || "No se pudo validar el beneficio" : "No se pudo validar el beneficio")
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Beneficio de la red">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 text-slate-900 shadow-xl">
        <div className="mb-3 flex items-center gap-2">
          <Gift size={20} className="text-violet-600" />
          <div>
            <h2 className="text-lg font-bold leading-tight">Beneficio de la red</h2>
            <p className="text-xs text-slate-500">{target}</p>
          </div>
        </div>

        {!online ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">El beneficio se valida en línea. Esperá a tener internet.</p>
        ) : (
          <>
            <label className="block">
              <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500"><ScanLine size={14} /> Código del cliente</span>
              <input
                ref={inputRef}
                className="min-h-12 w-full rounded-lg border border-slate-300 px-3 font-mono text-base tracking-wider outline-none focus:border-violet-500"
                value={code}
                onChange={(e) => { setCode(e.target.value); setPreview(null); setError(null) }}
                onKeyDown={(e) => { if (e.key === "Enter" && !preview) { e.preventDefault(); void validate() } }}
                placeholder="Escaneá el QR o tipeá ABCD2345-123456"
                autoComplete="off"
                autoCapitalize="characters"
              />
            </label>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            {preview && (
              <div className="mt-3 rounded-xl bg-violet-50 p-3 text-sm">
                <p className="font-bold">{preview.title}</p>
                <p>Descuento: <b>{formatCurrency(preview.discountCents)}</b></p>
                <p>El cliente paga: <b>{formatCurrency(preview.discountedTotalCents)}</b></p>
                <p className="mt-1 text-[11px] text-slate-500">Si el código vence antes de aplicar, pedile al cliente que lo muestre de nuevo.</p>
              </div>
            )}
          </>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold">Cancelar</button>
          {online && (preview ? (
            <button type="button" disabled={busy} onClick={() => onConfirm(code.trim())} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-violet-600 px-4 text-sm font-bold text-white disabled:opacity-50">
              {busy && <Loader2 size={16} className="animate-spin" />} Aplicar beneficio
            </button>
          ) : (
            <button type="button" disabled={checking} onClick={() => void validate()} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-violet-600 px-4 text-sm font-bold text-white disabled:opacity-50">
              {checking && <Loader2 size={16} className="animate-spin" />} Validar
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
