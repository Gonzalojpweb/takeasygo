import { describe, it, expect, beforeEach, vi } from 'vitest'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { loadPaymentMethodContext, buildPaymentMethodCatalog } from '@/lib/payment-methods'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

/**
 * La cuenta de transferencia del checkout se resuelve por sede con el MISMO
 * resolutor único (lib/location-resolvers.ts): override de la sede → cuenta
 * activa del tenant → legacy. El override funciona aunque la cuenta no esté
 * activa globalmente, y si la cuenta ya no existe hace fallback.
 */

const SLUG = 'transfer-tenant'
const ACTIVE_ID = '64b0000000000000000000b1'
const INACTIVE_ID = '64b0000000000000000000b2'
const DELETED_ID = '64b0000000000000000000b9'

let tenant!: Awaited<ReturnType<typeof Tenant.create>>
let location!: Awaited<ReturnType<typeof Location.create>>

function transferMethod(catalog: ReturnType<typeof buildPaymentMethodCatalog>) {
  return catalog.methods.find(m => m.id === 'transfer')!
}

beforeEach(async () => {
  tenant = await Tenant.create({
    name: 'Tenant transfer',
    slug: SLUG,
    plan: 'full',
    status: 'active',
    isActive: true,
    transfer: { enabled: true, alias: 'legacy.alias', cbu: '0000000000000000000000' },
    transferAccounts: [
      {
        _id: ACTIVE_ID,
        label: 'Cuenta Principal',
        alias: 'cuenta.activa',
        cbu: '1111111111111111111111',
        isActive: true,
      },
      {
        _id: INACTIVE_ID,
        label: 'Cuenta de la sucursal',
        alias: 'cuenta.sucursal',
        cbu: '2222222222222222222222',
        isActive: false,
      },
    ],
  })
  location = await Location.create({
    tenantId: tenant._id,
    name: 'Sede Centro',
    slug: 'centro',
    address: 'Av. Siempreviva 742',
    settings: {},
  })
})

async function catalogForCurrentLocation() {
  const ctx = await loadPaymentMethodContext(SLUG, location._id.toString())
  return buildPaymentMethodCatalog(ctx, 'takeaway')
}

describe('catálogo de pago con cuenta de transferencia por sede', () => {
  it('override a una cuenta INACTIVA → el checkout usa esa cuenta (existence-wins)', async () => {
    await Location.updateOne(
      { _id: location._id },
      { $set: { 'settings.transferAccountId': INACTIVE_ID } }
    )
    const catalog = await catalogForCurrentLocation()
    expect(catalog.transfer).not.toBeNull()
    expect(catalog.transfer!.alias).toBe('cuenta.sucursal')
    expect(catalog.transfer!.cbu).toBe('2222222222222222222222')
    expect(transferMethod(catalog).enabled).toBe(true)
  })

  it('override a la cuenta activa → esa cuenta', async () => {
    await Location.updateOne(
      { _id: location._id },
      { $set: { 'settings.transferAccountId': ACTIVE_ID } }
    )
    const catalog = await catalogForCurrentLocation()
    expect(catalog.transfer!.alias).toBe('cuenta.activa')
  })

  it('override apuntando a una cuenta borrada → fallback a la cuenta activa del tenant', async () => {
    await Location.updateOne(
      { _id: location._id },
      { $set: { 'settings.transferAccountId': DELETED_ID } }
    )
    const catalog = await catalogForCurrentLocation()
    expect(catalog.transfer!.alias).toBe('cuenta.activa')
  })

  it('sin override → cuenta activa del tenant (regresión del comportamiento previo)', async () => {
    const catalog = await catalogForCurrentLocation()
    expect(catalog.transfer!.alias).toBe('cuenta.activa')
  })

  it('transferencias deshabilitadas globalmente → el override de la sede no la habilita', async () => {
    await Tenant.updateOne({ _id: tenant._id }, { $set: { 'transfer.enabled': false } })
    await Location.updateOne(
      { _id: location._id },
      { $set: { 'settings.transferAccountId': INACTIVE_ID } }
    )
    const catalog = await catalogForCurrentLocation()
    expect(transferMethod(catalog).enabled).toBe(false)
    expect(catalog.transfer).toBeNull()
  })

  it('sin transferAccounts[] → usa los datos legacy del tenant', async () => {
    await Tenant.updateOne({ _id: tenant._id }, { $set: { transferAccounts: [] } })
    const catalog = await catalogForCurrentLocation()
    expect(catalog.transfer!.alias).toBe('legacy.alias')
  })
})
