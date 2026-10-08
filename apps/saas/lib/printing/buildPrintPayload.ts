import { renderOrderTicket } from './ticket-renderer'
import { safeDecrypt } from '@/lib/crypto'
import Location from '@/models/Location'
import type { IPrintJob } from '@/models/Order'
import type { Types } from 'mongoose'

// ============================================================================
// buildPrintPayload
// ============================================================================
// Genera los printJobs pre-renderizados. Corre al confirmar la orden y también
// en cada reimpresión (con options.isReprint = true). Desencripta PII una
// sola vez y renderiza un Buffer ESC/POS por cada impresora+rol que
// corresponda. Retorna un array de IPrintJob listos para guardar en Order.
// ============================================================================

interface DecryptedCustomer {
  name: string
  phone: string
  email: string
  phoneHash?: string
  pickupLocation?: { lat: number; lng: number }
}

interface PrinterDoc {
  _id: Types.ObjectId
  name: string
  paperWidth?: number
  roles?: string[]
  printSettings?: Record<string, any>
}

interface OrderForPrint {
  _id: Types.ObjectId
  tenantId: Types.ObjectId
  locationId: Types.ObjectId
  orderNumber: string
  status: string
  orderMode?: string
  items: any[]
  total: number
  notes?: string
  createdAt: Date | string
  promoCode?: string | null
  promoCreatedBy?: 'superadmin' | 'admin' | null
  promoSlug?: string | null
  discountAmount?: number
  orderTiming?: string
  scheduledPickupAt?: Date | string | null
  customer?: {
    name: string
    phone: string
    email: string
    phoneHash?: string
  }
  deliveryAddress?: {
    street: string
    number: string
    apt?: string
    city: string
  }
  payment?: { method?: string }
  location?: { locationName?: string; timezone?: string }
  toObject?: () => any
}

export async function buildPrintPayload(
  order: OrderForPrint,
  activePrinters: PrinterDoc[],
  options: {
    /** Limita la generación a un solo rol (ej. reimpresión selectiva a Cocina) */
    onlyRole?: string
    /** Marca los jobs generados como reimpresión explícita del admin */
    isReprint?: boolean
    /**
     * Fuerza UN ticket completo por impresora (todos los items, sin filtro de
     * rol). Solo para el pase BARRA de efectivo: si el pedido no tiene items
     * que matcheen los roles de la BARRA, igual tiene que llegar un ticket —
     * el cajero no puede perder la vista previa del pedido.
     */
    forceAllItems?: boolean
  } = {}
): Promise<IPrintJob[]> {
  const { onlyRole, isReprint = false, forceAllItems = false } = options
  // Desencriptar PII una sola vez
  const customer: DecryptedCustomer = order.customer
    ? {
        name: safeDecrypt(order.customer.name ?? ''),
        phone: safeDecrypt(order.customer.phone ?? ''),
        email: safeDecrypt(order.customer.email ?? ''),
        phoneHash: order.customer.phoneHash,
      }
    : { name: '', phone: '', email: '' }

  // Sede de la orden: nombre para el header del ticket y timezone para las
  // fechas (el renderer formatea en la zona de la sede, no en UTC).
  const location = await Location.findOne({ _id: order.locationId })
    .select('name timezone')
    .lean()

  // Armar objeto order con customer desencriptado
  const orderData = {
    ...(order.toObject ? order.toObject() : order),
    customer,
    location: {
      locationName: location?.name,
      timezone: location?.timezone,
    },
  }

  const printJobs: IPrintJob[] = []

  // ── Ticket resumen forzado: UN job por impresora, todos los items ────
  if (forceAllItems) {
    for (const printer of activePrinters) {
      // Preferir el rol BARRA (encabezado "BARRA / BEBIDAS"); si no lo tiene,
      // usar el primero configurado.
      const role = (printer.roles || []).includes('bar')
        ? 'bar'
        : printer.roles?.[0]
      if (!role) continue

      const buffer = renderOrderTicket(orderData, printer, role, { forceAllItems: true })
      if (!buffer) continue

      printJobs.push({
        printerId: printer._id,
        printerName: printer.name,
        role,
        payload: buffer.toString('base64'),
        status: 'pending',
        attempts: 0,
        lastError: null,
        printedAt: null,
        ...(isReprint ? { isReprint: true } : {}),
      })
    }
    return printJobs
  }

  for (const printer of activePrinters) {
    for (const role of printer.roles || []) {
      if (onlyRole && role !== onlyRole) continue
      // Verificar si hay items para este rol
      const hasItemsForRole = (orderData.items || []).some(
        (it: any) => it.printRole === role || it.printRole === 'both' || role === 'cashier'
      )
      if (!hasItemsForRole) continue

      const buffer = renderOrderTicket(orderData, printer, role)
      if (!buffer) continue

      printJobs.push({
        printerId: printer._id,
        printerName: printer.name,
        role,
        payload: buffer.toString('base64'),
        status: 'pending',
        attempts: 0,
        lastError: null,
        printedAt: null,
        ...(isReprint ? { isReprint: true } : {}),
      })
    }
  }

  return printJobs
}
