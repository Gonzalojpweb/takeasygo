import { toPesos } from "@takeasygo/business/browser"

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(toPesos(amount))
}

export function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)

  if (seconds < 60) return "ahora"
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function formatOrderStatus(status: string): string {
  const labels: Record<string, string> = {
    pending: "Pendiente",
    confirmed: "Confirmado",
    preparing: "Preparando",
    ready: "Listo",
    delivered: "Entregado",
    cancelled: "Cancelado",
  }
  return labels[status] ?? status
}

export function getStatusClass(status: string): string {
  return status
}
