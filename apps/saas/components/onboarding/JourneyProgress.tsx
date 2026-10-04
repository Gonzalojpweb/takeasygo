/**
 * components/onboarding/JourneyProgress.tsx
 * Header unificado de progreso para las 7 fases del onboarding (fase A + fase B).
 * Muestra: barra goal‑gradient, contador "Paso X de 7", hito actual con hint,
 * pasos pendientes, ETA restante, estado "Guardado ✓" y (opcional) botón continuar.
 * Acepta dos modos:
 *   - mode 'A': current = paso local 1‑3 (fase A, /empezar) → completados = current‑1
 *   - mode 'B': current = step server 3‑7 (fase B, admin/onboarding) → completados = current
 */
import { useCelebrate } from '@/hooks/useCelebrate'
import { useHaptic } from '@/components/tgo/useHaptic'
import {
  copyFor,
  currentHito,
  etaMinutes,
  progressFor,
  remaining,
} from '@/lib/onboarding-journey'

// — tipos -------------------------------------------------------
type Mode = 'A' | 'B'

interface Props {
  /** Modo 'A': paso local 1‑3 (fase A). Modo 'B': step server 3‑7 (fase B). */
  mode: Mode
  /** Paso actual según el modo. */
  current: number
  /** ¿Ya se persiste el paso en servidor/localStorage? */
  saved?: boolean
  /** Si se provee, renderiza el botón "Guardar y continuar". */
  onContinue?: () => void
}

// — componente ---------------------------------------------------
export function JourneyProgress({ mode, current, saved = false, onContinue }: Props) {
  const { fire: celebrate } = useCelebrate()
  const haptic = useHaptic()

  // ── derivados ------------------------------------------------
  // Semántica: "completados" = hitos terminados.
  //   Fase A: en el paso N se completaron N‑1.
  //   Fase B: el step server N significa que N hitos quedaron guardados.
  const completed = mode === 'A' ? Math.max(current - 1, 0) : current
  const position = Math.min(completed + 1, 7)
  const progress = progressFor(completed)
  const pasos = copyFor(completed)
  const hito = currentHito(position)
  const etaRest = etaMinutes(7) - etaMinutes(completed)
  const done = remaining(completed) === 0

  // ── render -------------------------------------------------
  return (
    <div className="mb-6 border-b border-gray-200 pt-4">
      {/* 1️⃣ Barra goal‑gradient */}
      <div className="relative h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
        <div
          className="absolute left-0 top-0 bottom-0 rounded-full bg-gradient-to-r from-[var(--tgo-brand)] to-[var(--tgo-state-reward)] transition-all duration-700"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* 2️⃣ Contador + hito actual + ETA */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm text-gray-600">
        <span className="font-medium">Paso {position} de 7</span>
        {hito && !done && <span className="text-gray-700">· {hito.label}</span>}
        {etaRest > 0 && <span className="text-gray-500">· ≈ {etaRest} min restantes</span>}
      </div>

      {/* 3️⃣ “Te quedan N pasos” + hint del hito (anti‑incertidumbre) */}
      <p className="mt-1 text-xs text-gray-400">
        {pasos}
        {hito && !done ? ` · ${hito.hint}` : ''}
      </p>

      {/* 4️⃣ Guardado ✓ (cuando aplica) */}
      {saved && <p className="mt-1 text-xs text-emerald-600">Guardado ✓</p>}

      {/* 5️⃣ Botón de continuar (solo si el caller lo pide) */}
      {onContinue && (
        <button
          onClick={() => {
            haptic.success()
            celebrate()
            onContinue()
          }}
          className="mt-2 rounded-lg bg-[var(--tgo-brand)] text-white px-4 py-2 text-sm font-medium hover:bg-[var(--tgo-brand-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--tgo-brand)] focus:ring-offset-2"
        >
          {saved ? 'Continuar' : 'Guardar y continuar'}
        </button>
      )}
    </div>
  )
}
