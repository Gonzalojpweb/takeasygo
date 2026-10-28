import type { ComponentType } from "react"
import { LayoutGrid, Utensils, Bike, Banknote, BarChart3 } from "lucide-react"

// ============================================================================
// Contextos operativos del ROS — definición única
// ============================================================================
// ROS Design System:
//   · Navigation representa CONTEXTOS, nunca escenas (W0S §3).
//   · "Los roles no cambian el sistema. Cambian el acceso al sistema."
//     (Operational Roles Matrix): cada contexto declara qué roles lo operan.
//   · El Context Panel nunca desaparece (Scene Architecture DD-001): cuando no
//     hay entidad activa muestra un estado vacío PROPIO del contexto, no el
//     de otro ("Seleccioná una mesa" en Caja era incorrecto).
//
// Roles POS: admin | manager | cashier (terminal de caja, token hub) y
// waiter (celular del mozo, token handheld). Reportes (Ventas) es
// Manager/Admin; el mozo solo opera el Salón (Roles Matrix).
// ============================================================================

export type ContextId = "counter" | "waiter" | "flota" | "caja" | "ventas"

export interface RosContext {
  id: ContextId
  /** Etiqueta corta de la navegación. */
  label: string
  /** Título del Header: "¿dónde estoy?". */
  title: string
  icon: ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>
  roles: readonly string[]
  /** Estado vacío del Context Panel en este contexto. */
  empty: { title: string; hint: string }
}

const ALL_HUB_ROLES = ["admin", "manager", "cashier"] as const
const KNOWN_ROLES = ["admin", "manager", "cashier", "waiter"] as const

export const ROS_CONTEXTS: readonly RosContext[] = [
  {
    id: "counter",
    label: "Counter",
    title: "Counter",
    icon: LayoutGrid,
    roles: ALL_HUB_ROLES,
    empty: { title: "Sin mesa seleccionada", hint: "Tocá una mesa del salón o empezá una venta de mostrador." },
  },
  {
    id: "waiter",
    label: "Salón",
    title: "Salón — Mesas",
    icon: Utensils,
    roles: [...ALL_HUB_ROLES, "waiter"],
    empty: { title: "Sin mesa seleccionada", hint: "Elegí una mesa para tomar el pedido o ver su estado en cocina." },
  },
  {
    id: "flota",
    label: "Flota",
    title: "Flota",
    icon: Bike,
    roles: ALL_HUB_ROLES,
    empty: { title: "Sin trabajo seleccionado", hint: "Elegí un pedido listo o un repartidor para ver el detalle." },
  },
  {
    id: "caja",
    label: "Caja",
    title: "Caja",
    icon: Banknote,
    roles: ALL_HUB_ROLES,
    empty: { title: "Sin caja activa", hint: "Abrí la caja del turno para empezar a registrar movimientos." },
  },
  {
    id: "ventas",
    label: "Ventas",
    title: "Ventas del día",
    icon: BarChart3,
    roles: ["admin", "manager"],
    empty: { title: "Sin venta seleccionada", hint: "Elegí una venta para ver su detalle." },
  },
]

/** Contextos visibles para un rol. Sin rol conocido (Sync viejo) se muestran los de caja. */
export function contextsForRole(role: string | undefined): RosContext[] {
  const effective = role && KNOWN_ROLES.includes(role as (typeof KNOWN_ROLES)[number]) ? role : "cashier"
  return ROS_CONTEXTS.filter((c) => c.roles.includes(effective))
}

export function findContext(id: string): RosContext {
  return ROS_CONTEXTS.find((c) => c.id === id) ?? ROS_CONTEXTS[0]
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  manager: "Encargado",
  cashier: "Cajero",
  waiter: "Mozo",
}

export function roleLabel(role: string | undefined): string {
  return (role && ROLE_LABELS[role]) || "Operador"
}
