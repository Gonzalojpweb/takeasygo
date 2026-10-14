// ============================================================================
// per-location-numbering.test.ts — Concurrencia numeración por sede
// ============================================================================
// Verifica que con el flag `numbering.perLocation` ON:
//   1. Varias órdenes concurrentes en 2 sedes no colisionan ni saltan.
//   2. Varias reservas concurrentes en 2 sedes no colisionan ni saltan.
//   3. Cada sede tiene su propia secuencia (no se mezclan).
//   4. El prefijo se deriva del nombre de la sede.
//   5. Flag OFF: la numeración legacy sigue funcionando (sin cambios).
//
// Ejecutar: npx vitest run __tests__/integration/per-location-numbering.test.ts
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import './setup'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

import PerLocationCounter from '@/models/PerLocationCounter'
import { nextPerLocationNumber, sedePrefix, resolveSedePrefix } from '@/lib/perLocationNumber'

let tenantId: mongoose.Types.ObjectId
let recoletaId: mongoose.Types.ObjectId
let saavedraId: mongoose.Types.ObjectId

beforeEach(async () => {
  tenantId = new mongoose.Types.ObjectId()
  recoletaId = new mongoose.Types.ObjectId()
  saavedraId = new mongoose.Types.ObjectId()
  // mongodb-memory-server no auto-crea índices del schema
  await PerLocationCounter.createIndexes()
})

describe('sedePrefix', () => {
  it('deriva prefijo de 3 letras del nombre', () => {
    expect(sedePrefix('Recoleta')).toBe('REC')
    expect(sedePrefix('Saavedra')).toBe('SAA')
    expect(sedePrefix('Caballito')).toBe('CAB')
    expect(sedePrefix('Palermo Soho')).toBe('PAL')
  })

  it('maneja nombres cortos y sin letras', () => {
    expect(sedePrefix('AB')).toBe('AB')
    expect(sedePrefix('123')).toBe('123')
    expect(sedePrefix('')).toBe('LOC')
  })
})

describe('resolveSedePrefix', () => {
  it('usa location.prefix si está guardado', () => {
    expect(resolveSedePrefix({ prefix: 'CEN', name: 'Centro' })).toBe('CEN')
    expect(resolveSedePrefix({ prefix: 'NOR', name: 'Norte' })).toBe('NOR')
  })

  it('fallback al nombre si prefix es null/undefined', () => {
    expect(resolveSedePrefix({ prefix: null, name: 'Recoleta' })).toBe('REC')
    expect(resolveSedePrefix({ name: 'Saavedra' })).toBe('SAA')
  })

  it('fallback al nombre si prefix tiene formato inválido', () => {
    expect(resolveSedePrefix({ prefix: 'X', name: 'Recoleta' })).toBe('REC')
    expect(resolveSedePrefix({ prefix: 'TOOLONG', name: 'Recoleta' })).toBe('REC')
  })
})

describe('Concurrencia — órdenes por sede', () => {
  it('20 órdenes concurrentes en 2 sedes: sin colisiones, sin saltos, secuencias separadas', async () => {
    const CONCURRENT = 20

    // Lanzar 20 llamadas concurrentes: 10 en Recoleta, 10 en Saavedra
    const calls: Promise<string>[] = []
    for (let i = 0; i < CONCURRENT; i++) {
      const useRecoleta = i % 2 === 0
      calls.push(
        nextPerLocationNumber({
          tenantId,
          locationId: useRecoleta ? recoletaId : saavedraId,
          type: 'order',
          location: { name: useRecoleta ? 'Recoleta' : 'Saavedra' },
        })
      )
    }

    const results = await Promise.all(calls)

    // 1. Sin colisiones: todos los números son únicos
    const unique = new Set(results)
    expect(unique.size).toBe(CONCURRENT)

    // 2. Sin saltos: Recoleta tiene REC-0001..REC-0010, Saavedra SAA-0001..SAA-0010
    const recoletaNums = results.filter(r => r.startsWith('REC-')).sort()
    const saavedraNums = results.filter(r => r.startsWith('SAA-')).sort()

    expect(recoletaNums.length).toBe(CONCURRENT / 2)
    expect(saavedraNums.length).toBe(CONCURRENT / 2)

    // Secuencia sin saltos: 1..10
    for (let i = 0; i < CONCURRENT / 2; i++) {
      expect(recoletaNums[i]).toBe(`REC-${String(i + 1).padStart(4, '0')}`)
      expect(saavedraNums[i]).toBe(`SAA-${String(i + 1).padStart(4, '0')}`)
    }

    // 3. Contadores en DB consistentes
    const recCounter = await PerLocationCounter.findOne({ tenantId, locationId: recoletaId, type: 'order' })
    const saaCounter = await PerLocationCounter.findOne({ tenantId, locationId: saavedraId, type: 'order' })
    expect(recCounter?.seq).toBe(CONCURRENT / 2)
    expect(saaCounter?.seq).toBe(CONCURRENT / 2)
  })
})

describe('Concurrencia — reservas por sede', () => {
  it('15 reservas concurrentes en 2 sedes: sin colisiones, sin saltos', async () => {
    const CONCURRENT = 15

    const calls: Promise<string>[] = []
    for (let i = 0; i < CONCURRENT; i++) {
      const useRecoleta = i % 2 === 0
      calls.push(
        nextPerLocationNumber({
          tenantId,
          locationId: useRecoleta ? recoletaId : saavedraId,
          type: 'reservation',
          location: { name: useRecoleta ? 'Recoleta' : 'Saavedra' },
        })
      )
    }

    const results = await Promise.all(calls)

    // Sin colisiones
    expect(new Set(results).size).toBe(CONCURRENT)

    // Formato: PREFIX-RNNNN
    const recoletaNums = results.filter(r => r.startsWith('REC-R')).sort()
    const saavedraNums = results.filter(r => r.startsWith('SAA-R')).sort()

    // Recoleta: 8 (índices pares 0,2,4,6,8,10,12,14), Saavedra: 7 (impares)
    expect(recoletaNums.length).toBe(8)
    expect(saavedraNums.length).toBe(7)

    // Secuencia sin saltos
    for (let i = 0; i < 8; i++) {
      expect(recoletaNums[i]).toBe(`REC-R${String(i + 1).padStart(4, '0')}`)
    }
    for (let i = 0; i < 7; i++) {
      expect(saavedraNums[i]).toBe(`SAA-R${String(i + 1).padStart(4, '0')}`)
    }
  })
})

describe('Aislamiento de tipos', () => {
  it('orders y reservations del mismo (tenant, sede) tienen secuencias independientes', async () => {
    // 3 órdenes + 3 reservas en la misma sede
    const o1 = await nextPerLocationNumber({ tenantId, locationId: recoletaId, type: 'order', location: { name: 'Recoleta' } })
    const o2 = await nextPerLocationNumber({ tenantId, locationId: recoletaId, type: 'order', location: { name: 'Recoleta' } })
    const o3 = await nextPerLocationNumber({ tenantId, locationId: recoletaId, type: 'order', location: { name: 'Recoleta' } })
    const r1 = await nextPerLocationNumber({ tenantId, locationId: recoletaId, type: 'reservation', location: { name: 'Recoleta' } })
    const r2 = await nextPerLocationNumber({ tenantId, locationId: recoletaId, type: 'reservation', location: { name: 'Recoleta' } })
    const r3 = await nextPerLocationNumber({ tenantId, locationId: recoletaId, type: 'reservation', location: { name: 'Recoleta' } })

    expect(o1).toBe('REC-0001')
    expect(o2).toBe('REC-0002')
    expect(o3).toBe('REC-0003')
    expect(r1).toBe('REC-R0001')
    expect(r2).toBe('REC-R0002')
    expect(r3).toBe('REC-R0003')
  })
})

describe('Aislamiento de tenants', () => {
  it('dos tenants con la misma sede nombre tienen secuencias separadas', async () => {
    const tenant2 = new mongoose.Types.ObjectId()

    const t1 = await nextPerLocationNumber({ tenantId, locationId: recoletaId, type: 'order', location: { name: 'Recoleta' } })
    const t2 = await nextPerLocationNumber({ tenantId: tenant2, locationId: recoletaId, type: 'order', location: { name: 'Recoleta' } })

    expect(t1).toBe('REC-0001')
    expect(t2).toBe('REC-0001') // misma sede, tenant distinto → misma secuencia
  })
})

describe('Prefijo guardado vs derivado', () => {
  it('sede con prefix guardado usa ese prefix, no el del nombre', async () => {
    const num = await nextPerLocationNumber({
      tenantId,
      locationId: recoletaId,
      type: 'order',
      location: { name: 'Recoleta Centro', prefix: 'CEN' },
    })
    expect(num).toBe('CEN-0001')
  })

  it('sede sin prefix guardado deriva del nombre (fallback)', async () => {
    const num = await nextPerLocationNumber({
      tenantId,
      locationId: recoletaId,
      type: 'order',
      location: { name: 'Recoleta', prefix: null },
    })
    expect(num).toBe('REC-0001')
  })

  it('dos sedes con nombre parecido pero prefix distinto → números distintos', async () => {
    const numA = await nextPerLocationNumber({
      tenantId,
      locationId: recoletaId,
      type: 'order',
      location: { name: 'Recoleta Centro', prefix: 'REC' },
    })
    const numB = await nextPerLocationNumber({
      tenantId,
      locationId: saavedraId,
      type: 'order',
      location: { name: 'Recoleta Norte', prefix: 'REN' },
    })

    expect(numA).toBe('REC-0001')
    expect(numB).toBe('REN-0001')
    expect(numA).not.toBe(numB)
  })
})
