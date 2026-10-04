import { useRef } from 'react'

/**
 * Hook para mejorar la UX de inputs numéricos nativos.
 * Selecciona automáticamente el contenido al recibir foco cuando el usuario interactúa con el input.
 * Permite edición normal (posicionamiento de cursor, selección parcial) en interacciones subsiguientes.
 *
 * @returns {Object} - Objeto con onFocus y onBlur handlers para aplicar al input
 */
export function useNumberInputFocus() {
  const hadFocus = useRef(false)

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (!hadFocus.current) {
      e.target.select()
    }
    hadFocus.current = true
  }

  const handleBlur = () => {
    hadFocus.current = false
  }

  return { onFocus: handleFocus, onBlur: handleBlur }
}
