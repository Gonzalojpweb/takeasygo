import { connectDB } from '@/lib/mongoose'
import Location from '@/models/Location'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, getSessionUser } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { encrypt } from '@/lib/crypto'
import { normalizeSpacesInput, validateSpacesInput } from '@/lib/space-capacity'

async function resolveTenant(tenantSlug: string) {
  await connectDB()
  return Tenant.findOne({ slug: tenantSlug, isActive: true })
}

/**
 * Aislamiento por sede en la escritura: un usuario NO admin con sedes
 * asignadas no puede modificar otras sedes. Chequeo directo en el endpoint
 * (403), sin depender de flags — a diferencia de los guards de lectura que
 * devuelven 404.
 */
async function enforceSedeWriteScope(
  request: NextRequest,
  locationId: string
): Promise<NextResponse | null> {
  const sessionUser = await getSessionUser(request)
  if (!sessionUser) return null
  if (sessionUser.role === 'admin' || sessionUser.role === 'superadmin') return null
  const locs = sessionUser.assignedLocations ?? []
  if (locs.length > 0 && !locs.includes(locationId)) {
    return NextResponse.json(
      { error: 'No tenés permiso para modificar esta sede' },
      { status: 403 }
    )
  }
  return null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenant: string; locationId: string }> }
) {
  try {
    const { tenant: tenantSlug, locationId } = await params
    const tenant = await resolveTenant(tenantSlug)
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const location = await Location.findOne({ _id: locationId, tenantId: tenant._id, isActive: true })
      .select(
        'name scheduledOrdersConfig serviceHours timezone deliveryConfig prefix ' +
        'settings.acceptsOrders settings.orderModes settings.estimatedPickupTime ' +
        'settings.delayAnnouncement settings.cash settings.mpAccountId ' +
        'settings.whatsappPhone settings.transferAccountId ' +
        'settings.notifyOnOrder settings.notifyOnReservation ' +
        'settings.paymentSurcharges settings.kriptonEnabled settings.clubDiscountEnabled'
      )
      .lean() as any
    if (!location) return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })

    const baseTime = location.settings?.estimatedPickupTime ?? 20

    return NextResponse.json({ location, effectiveEstimatedTime: baseTime, tenantName: tenant.name })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; locationId: string }> }
) {
  try {
    const { tenant: tenantSlug, locationId } = await params
    const tenant = await resolveTenant(tenantSlug)
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const scopeError = await enforceSedeWriteScope(request, locationId)
    if (scopeError) return scopeError

    // Configuración de sede (pagos, recargos, horarios): solo roles de gestión.
    const sessionUser = await getSessionUser(request)
    if (!sessionUser || !['admin', 'manager', 'superadmin'].includes(sessionUser.role ?? '')) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }
    const permError = await enforcePermissionForRequest(request, {
      tenant,
      tenantId: tenant._id.toString(),
      locationId,
      permission: 'settings.write',
    })
    if (permError) return permError

    const rawBody = await request.json()
    // Pertenencia y credenciales del agente no se editan por esta vía.
    const { _id: _ignoredId, tenantId: _ignoredTenant, printerAgent: _ignoredAgent, ...body } = rawBody ?? {}

    // ── Encriptar apiToken de Rapiboy si se está guardando en texto plano ──
    if (body?.rapiboyConfig?.apiToken && !body.rapiboyConfig.apiToken.includes(':')) {
      body.rapiboyConfig.apiToken = encrypt(body.rapiboyConfig.apiToken)
    }
    if (body?.rapiboyConfig?.webhookSecret && !body.rapiboyConfig.webhookSecret.includes(':')) {
      body.rapiboyConfig.webhookSecret = encrypt(body.rapiboyConfig.webhookSecret)
    }

    // ── Validate mpAccountId if provided ─────────────────────────────────────
    if (body?.settings?.mpAccountId) {
      const mpAccountId = body.settings.mpAccountId
      // Reload tenant to get mpAccounts (not in select above)
      const fullTenant = await Tenant.findById(tenant._id).select('mpAccounts').lean() as any
      const validAccount = fullTenant?.mpAccounts?.some(
        (a: any) => a._id?.toString() === mpAccountId
      )
      if (!validAccount) {
        return NextResponse.json(
          { error: 'mpAccountId no pertenece a ninguna cuenta MP de este tenant' },
          { status: 400 }
        )
      }
    }

    // ── Validate transferAccountId si viene ─────────────────────────────────
    if (body?.settings && 'transferAccountId' in body.settings) {
      const transferAccountId = body.settings.transferAccountId
      if (transferAccountId === null || transferAccountId === '' || transferAccountId === undefined) {
        body.settings.transferAccountId = null
      } else if (
        typeof transferAccountId !== 'string' ||
        !tenant.transferAccounts?.some(a => a._id?.toString() === transferAccountId)
      ) {
        return NextResponse.json(
          { error: 'transferAccountId no pertenece a ninguna cuenta de transferencia de este tenant' },
          { status: 400 }
        )
      }
    }

    // ── Normalize whatsappPhone por sede (mismo criterio que el global:
    //    vacío/espacios → null = hereda el WhatsApp general) ─────────────────
    if (body?.settings && 'whatsappPhone' in body.settings) {
      const v = body.settings.whatsappPhone
      body.settings.whatsappPhone = typeof v === 'string' && v.trim() ? v.trim() : null
    }

    // ── Validate overrides de notificación por sede (boolean | null = hereda) ─
    if (body?.settings) {
      const validateFlag = (name: string, value: unknown) =>
        value === undefined || value === null || typeof value === 'boolean'
          ? null
          : `${name} debe ser verdadero, falso o null (heredar la configuración general)`
      const flagError =
        validateFlag('notifyOnOrder', body.settings.notifyOnOrder) ??
        validateFlag('notifyOnReservation', body.settings.notifyOnReservation) ??
        validateFlag('kriptonEnabled', body.settings.kriptonEnabled) ??
        validateFlag('clubDiscountEnabled', body.settings.clubDiscountEnabled)
      if (flagError) {
        return NextResponse.json({ error: flagError }, { status: 400 })
      }

      // Recargo propio por medio de pago: número 0-100 o null (hereda).
      if ('paymentSurcharges' in body.settings) {
        const raw = body.settings.paymentSurcharges
        if (raw === null) {
          body.settings.paymentSurcharges = null
        } else if (typeof raw !== 'object') {
          return NextResponse.json({ error: 'paymentSurcharges inválido' }, { status: 400 })
        } else {
          const normalized: Record<string, { feePercent: number | null }> = {}
          for (const method of ['mercadopago', 'kripton', 'transfer'] as const) {
            const v = raw?.[method]?.feePercent
            if (v === undefined || v === null || v === '') {
              normalized[method] = { feePercent: null }
            } else if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) {
              return NextResponse.json({ error: `Recargo de ${method} inválido: debe estar entre 0 y 100` }, { status: 400 })
            } else {
              normalized[method] = { feePercent: v }
            }
          }
          body.settings.paymentSurcharges = normalized
        }
      }
    }

    // ── Validate prefix si viene ─────────────────────────────────────────────
    if (body?.prefix !== undefined && body.prefix !== null && body.prefix !== '') {
      const prefix = String(body.prefix).toUpperCase().trim()
      if (!/^[A-Z0-9]{2,4}$/.test(prefix)) {
        return NextResponse.json(
          { error: 'El prefijo debe tener 2-4 caracteres alfanuméricos mayúsculas' },
          { status: 400 }
        )
      }

      // ── Bloquear cambio de prefijo después del primer número emitido ──
      const currentLoc = await Location.findById(locationId).select('prefix').lean() as { prefix?: string } | null
      if (currentLoc?.prefix && currentLoc.prefix !== prefix) {
        // ¿Ya hay órdenes o reservas con números que usen este prefijo?
        const Order = (await import('@/models/Order')).default
        const Reservation = (await import('@/models/Reservation')).default
        const prefixRegex = new RegExp(`^${currentLoc.prefix}-`)
        const [orderCount, resCount] = await Promise.all([
          Order.countDocuments({ tenantId: tenant._id, locationId, orderNumber: prefixRegex }),
          Reservation.countDocuments({ tenantId: tenant._id, locationId, reservationNumber: prefixRegex }),
        ])
        if (orderCount > 0 || resCount > 0) {
          return NextResponse.json(
            { error: `No se puede cambiar el prefijo: ya se emitieron ${orderCount + resCount} números con "${currentLoc.prefix}"` },
            { status: 409 }
          )
        }
      }

      const existing = await Location.findOne({
        tenantId: tenant._id,
        prefix,
        _id: { $ne: locationId },
      }).select('_id').lean()
      if (existing) {
        return NextResponse.json(
          { error: `El prefijo "${prefix}" ya está en uso en otra sede` },
          { status: 409 }
        )
      }
      body.prefix = prefix
    }

    // ── Validate reservationConfig.minAdvanceMinutes si viene ──────────────
    if (body?.reservationConfig && 'minAdvanceMinutes' in body.reservationConfig) {
      const v = body.reservationConfig.minAdvanceMinutes
      if (!Number.isInteger(v) || v < 0 || v > 720) {
        return NextResponse.json(
          { error: 'La antelación mínima debe ser un número entero entre 0 y 720 minutos' },
          { status: 400 }
        )
      }
    }

    // ── Validate reservationConfig.paymentsEnabled si viene ────────────────
    if (body?.reservationConfig && 'paymentsEnabled' in body.reservationConfig) {
      if (typeof body.reservationConfig.paymentsEnabled !== 'boolean') {
        return NextResponse.json(
          { error: 'El estado de cobro de reservas debe ser verdadero o falso' },
          { status: 400 }
        )
      }
    }

    // ── Validate spaces (espacios/sectores de aforo) si viene ───────────────
    if (body && 'spaces' in body) {
      const spacesError = validateSpacesInput(body.spaces)
      if (spacesError) {
        return NextResponse.json({ error: spacesError }, { status: 400 })
      }
      body.spaces = normalizeSpacesInput(body.spaces as Array<Record<string, unknown>>)
    }

    // Merge profundo: preservar subdocumentos existentes (deliveryConfig, settings, serviceHours)
    // cuando el body solo trae parciales
    const existing = await Location.findOne({ _id: locationId, tenantId: tenant._id }).lean() as Record<string, any> | null
    const merged: Record<string, any> = {}
    const subdocKeys = ['deliveryConfig', 'rapiboyConfig', 'settings', 'serviceHours', 'scheduledOrdersConfig', 'reservationConfig', 'hero', 'gallery']

    for (const [key, value] of Object.entries(body)) {
      if (subdocKeys.includes(key) && typeof value === 'object' && value !== null && !Array.isArray(value) && existing?.[key]) {
        merged[key] = { ...existing[key], ...value }
      } else {
        merged[key] = value
      }
    }

    const location = await Location.findOneAndUpdate(
      { _id: locationId, tenantId: tenant._id },
      { $set: merged },
      { returnDocument: 'after', runValidators: true }
    )

    if (!location) return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })

    logAudit({ tenantId: tenant._id.toString(), action: 'settings.location.updated', entity: 'location', entityId: locationId, details: { fields: Object.keys(body) }, request })
    return NextResponse.json({ location })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; locationId: string }> }
) {
  try {
    const { tenant: tenantSlug, locationId } = await params
    const tenant = await resolveTenant(tenantSlug)
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const scopeError = await enforceSedeWriteScope(request, locationId)
    if (scopeError) return scopeError

    // Soft delete
    const location = await Location.findOneAndUpdate(
      { _id: locationId, tenantId: tenant._id },
      { $set: { isActive: false } },
      { new: true }
    )

    if (!location) return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
