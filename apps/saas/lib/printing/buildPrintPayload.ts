import { renderOrderTicket } from './ticket-renderer'
import { safeDecrypt } from '@/lib/crypto'
import type { IPrintJob } from '@/models/Order'
import type { Types } from 'mongoose'

// ============================================================================
// buildPrintPayload
// ============================================================================
// Corre UNA vez, cuando la orden pasa a 'confirmed'. Desencripta PII una
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
  location?: { locationName?: string }
  toObject?: () => any
}

export async function buildPrintPayload(
  order: OrderForPrint,
  activePrinters: PrinterDoc[]
): Promise<IPrintJob[]> {
  // Desencriptar PII una sola vez
  const customer: DecryptedCustomer = order.customer
    ? {
        name: safeDecrypt(order.customer.name ?? ''),
        phone: safeDecrypt(order.customer.phone ?? ''),
        email: safeDecrypt(order.customer.email ?? ''),
        phoneHash: order.customer.phoneHash,
      }
    : { name: '', phone: '', email: '' }

  // Armar objeto order con customer desencriptado
  const orderData = {
    ...(order.toObject ? order.toObject() : order),
    customer,
  }

  const printJobs: IPrintJob[] = []

  for (const printer of activePrinters) {
    for (const role of printer.roles || []) {
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
      })
    }
  }

  return printJobs
}
