/**
 * components/onboarding/JourneyProgress.tsx
 * Header unificado de progreso para las 7 fases del onboarding (fase A + fase B).
 * Muestra: barra goal‑gradient, contador "Paso X de 7", pasos pendientes,
 * ETA, estado "Guardado ✓" y chips de finalización.
 * Acepta dos modos:
 *   - modoA: localStep 1‑3 (fase A, /empezar)
 *   - modoB: serverStep 3‑7 (fase B, admin/onboarding)
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useCelebrate } from '@/hooks/useCelebrate'
import { useHaptic } from '@/components/tgo/useHaptic'
import { cn } from '@/lib/utils'

// — tipos -------------------------------------------------------
type Mode = 'A' | 'B'

interface Props {
  /** Modo 'A': localStep 1‑3 (fase A). Modo 'B': serverStep 3‑7 (fase B). */
  mode: Mode
  /** Paso actual según el modo. */
  current: number
  /** ¿Ya se persiste el paso en servidor/localStorage? */
  saved?: boolean
  /** Callback disparado al hacer clic en “Guardar” o “Continuar”. */
  onContinue?: () => void
}

/** Devoluciones de la UI (solo lectura). */
interface State {
  progress: number    // 0‑100 % (con piso 6 %)
  label: string       // "Paso X de 7"
  remaining: string   // "Te quedan N pasos"
  eta: string         // "≈ N min restantes" o ""
  saved: boolean
}

/** Mapeo de los 7 hitos a su label/hint (usado por la UI). */
const HITO = [
  { label: 'Datos del negocio',    hint: 'Nombre, slug y email del restaurante' },
  { label: 'Verificá tu email',    hint: 'Llegó a tu bandeja (revistá Spam si no aparece)' },
  { label: 'Creá tu clave',        hint: 'Contraseña segura de 8+ dígitos' },
  { label: 'Plan elegido',         hint: 'Trial 30 días sin cargo o Plan con cargo' },
  { label: 'Sede',                 hint: 'Dirección y tipo de comida' },
  { label: 'Identidad visual',     hint: 'Color principal y branding' },
  { label: 'Revisión',             hint: 'Enviado al equipo, pronto listo' },
] as const

// — componente ---------------------------------------------------
export function JourneyProgress({ mode, current, saved = false, onContinue }: Props) {
  const { fire: celebrate } = useCelebrate()
  const haptic = useHaptic()

  // ── derivados ------------------------------------------------
  const globalIdx = mode === 'A' ? current : (() => {
    // server step → global index
    const map: Record<number, number> = {
      3: 3, // fase A step 3 → global 3 (clave)
      4: 4, // plan
      5: 5, // sede
      6: 6, // identidad
      7: 7, // revisión
    }
    return map[current] ?? 0
  })()

  const reached = Math.min(globalIdx, 7)
  const progress = progressFor(reached) // 6‑100 % (piso 6)
  const resto = remaining(reached)
  const eta = etaMinutes(reached)
  const copy = copyFor(reached)

  // actualizar UI cuando cambia current/saved
  useEffect(() => {
    // nada aquí – los valores se calculan arriba por simplicity
  }, [current, globalIdx, saved])

  // ── render -------------------------------------------------
  return (
    <div className="mb-6 border-b border-gray-200 pt-4">
      {/* 1️⃣ Barra goal‑gradient */}
      <div className="relative h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
        <div
          className="absolute left-0 top-0 bottom-0 rounded-full bg-gradient-to-r from-[var(--tgo-brand)] to-[var(--tgo-state-reward)] transition-colors duration-700"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* 2️⃣ Contador + ETA */}
      <div className="flex items-center gap-3 mt-2 text-sm text-gray-600">
        <span className="font-medium">{labelFor(reached)}</span>
        <span className="ml-2">{costo(reached)}</span>
        {eta !== '' && <span className="ml-2 text-gray-500">· {eta}</span>}
      </div>

      {/* 3️⃣ “Te quedan N pasos” */}
      <p className="mt-1 text-xs text-gray-400">{resto === 1 ? 'Queda 1 paso' : `Te quedan ${resto} pasos`}</p>

      {/* 4️⃣ Guardado ✓ (cuando aplica) */}
      {saved && (
        <p className="mt-1 text-xs text-emerald-600">Guardado ✓</p>
      )}

      {/* 5️⃣ Botón de continuar */}
      <button
        onClick={() => {
          haptic.success()
          celebrate(undefined) // origen opcional lo pasa el caller
          onContinue?.()
        }}
        className="mt-2 rounded-lg bg-[var(--tgo-brand)] text-white px-4 py-2 text-sm font-medium hover:bg-[var(--tgo-brand-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--tgo-brand)] focus:ring-offset-2"
      >
        {saved ? 'Continuar' : 'Guardar y continuar'}
      </button>
    </div>
  )
}

/** Devuelve el label “Paso X de 7” a partir del índice global. */
function labelFor(reached: number): string {
  return `Paso ${reached} de 7`
}

/** Devuelve el costo/ETA según el hito alcanzado. */
function costo(reached: number): string {
  return remaining(reached) === 1 ? '1 paso restante' : `Te quedan ${remaining(reached)} pasos`
}