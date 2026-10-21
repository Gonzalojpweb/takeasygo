import { useEffect, useState } from "react"

/**
 * Reloj de la UI para antigüedades ("hace 12 min"). Date.now() en render es
 * impuro (React lo marca) y además congelaba el valor hasta el próximo
 * re-render; acá se refresca solo cada `intervalMs`.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
