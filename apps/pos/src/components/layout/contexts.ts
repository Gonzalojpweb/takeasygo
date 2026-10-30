import type { ComponentType } from "react"
import { LayoutGrid, Utensils, Bike, Banknote, BarChart3, Gauge, FileText, Settings, UserRound, Contact } from "lucide-react"

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

export type ContextId = "counter" | "waiter" | "flota" | "caja" | "ventas" | "resumen" | "facturacion" | "config" | "usuario" | "clientes"

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
    // Fase H: dashboard del día (KPIs por canal, comensales, tendencias).
    // El cajero lo ve sin ingresos (el server los oculta).
    id: "resumen",
    label: "Resumen",
    title: "Resumen del día",
    icon: Gauge,
    roles: ALL_HUB_ROLES,
    empty: { title: "Ahora en el local", hint: "Mesas, comensales y pedidos en tiempo real." },
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
  {
    // Fase L: factura electrónica operada desde el POS (comprobantes,
    // reintento, reimpresión, nota de crédito, Libro IVA) + centro de ayuda.
    // La configuración (CUIT, certificado) sigue en el panel de admin.
    id: "facturacion",
    label: "Facturación",
    title: "Factura electrónica",
    icon: FileText,
    roles: ALL_HUB_ROLES,
    empty: { title: "Sin comprobante seleccionado", hint: "Elegí un comprobante para reintentarlo, reimprimirlo o emitir la nota de crédito." },
  },
  {
    // Fase 1 (29/10): configuración del POS — impresoras, comprobantes y,
    // en las fases siguientes, cajas, turnos, deliverys y dispositivos.
    id: "config",
    label: "Configuración",
    title: "Configuración",
    icon: Settings,
    roles: ["admin", "manager"],
    empty: { title: "Configuración", hint: "Elegí una sección y un elemento para editarlo." },
  },
  {
    // Fase 4 (29/10): ficha operativa del cliente, club y canjes a entregar.
    id: "clientes",
    label: "Clientes",
    title: "Clientes",
    icon: Contact,
    roles: ALL_HUB_ROLES,
    empty: { title: "Sin cliente seleccionado", hint: "Buscá por nombre o celular." },
  },
  {
    // Fase 3 (29/10): mi perfil (todos) y equipo de la sede (admin y encargado).
    id: "usuario",
    label: "Usuario",
    title: "Usuario",
    icon: UserRound,
    roles: KNOWN_ROLES,
    empty: { title: "Usuario", hint: "Tu perfil y, si sos encargado, el equipo de la sede." },
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
