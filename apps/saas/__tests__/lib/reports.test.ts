import { describe, it, expect } from 'vitest'
import { buildTransferBreakdown, type TransferAggRow } from '@/lib/reports'

describe('buildTransferBreakdown', () => {
    it('calcula el total de comisión por transferencia (pago manual) del período', () => {
        const agg: TransferAggRow[] = [
            { _id: 1, revenue: 71050, baseRevenue: 70000, surcharge: 1050, platformFee: 700, orders: 1 },
            { _id: 2, revenue: 142100, baseRevenue: 140000, surcharge: 2100, platformFee: 1400, orders: 2 },
            { _id: 5, revenue: 35525, baseRevenue: 35000, surcharge: 525, platformFee: 350, orders: 1 },
        ]
        const { summary } = buildTransferBreakdown(agg, 31)

        expect(summary.totalRevenue).toBe(248675)
        expect(summary.totalBaseRevenue).toBe(245000)
        expect(summary.totalSurcharge).toBe(3675)
        // Esto es lo que el admin debe depositar a TakeasyGO por transferencia
        expect(summary.totalPlatformFee).toBe(2450)
        expect(summary.orders).toBe(4)
    })

    it('separa la comisión de transferencia del total (no la mezcla en recargos MP)', () => {
        const agg: TransferAggRow[] = [
            { _id: 3, revenue: 71050, baseRevenue: 70000, surcharge: 1050, platformFee: 700, orders: 1 },
        ]
        const { summary } = buildTransferBreakdown(agg, 31)

        // platformFee (lo que debe depositar) es DISTINTO de surcharge (markup total)
        expect(summary.totalPlatformFee).toBe(700)
        expect(summary.totalSurcharge).toBe(1050)
        expect(summary.totalPlatformFee).not.toBe(summary.totalSurcharge)
    })

    it('rellena los días sin órdenes con ceros y respeta la cantidad de días del mes', () => {
        const agg: TransferAggRow[] = [
            { _id: 10, revenue: 71050, baseRevenue: 70000, surcharge: 1050, platformFee: 700, orders: 1 },
        ]
        const { daily } = buildTransferBreakdown(agg, 30)

        expect(daily).toHaveLength(30)
        expect(daily[0]).toEqual({ day: 1, revenue: 0, baseRevenue: 0, surcharge: 0, platformFee: 0, orders: 0 })
        expect(daily[9]).toEqual({ day: 10, revenue: 71050, baseRevenue: 70000, surcharge: 1050, platformFee: 700, orders: 1 })
        expect(daily[29]).toEqual({ day: 30, revenue: 0, baseRevenue: 0, surcharge: 0, platformFee: 0, orders: 0 })
    })

    it('maneja mes sin órdenes por transferencia', () => {
        const { summary, daily } = buildTransferBreakdown([], 31)

        expect(summary.totalPlatformFee).toBe(0)
        expect(summary.orders).toBe(0)
        expect(daily).toHaveLength(31)
        expect(daily.every(d => d.orders === 0)).toBe(true)
    })

    it('agrupa correctamente cuando hay múltiples órdenes el mismo día', () => {
        const agg: TransferAggRow[] = [
            { _id: 4, revenue: 71050, baseRevenue: 70000, surcharge: 1050, platformFee: 700, orders: 1 },
            { _id: 4, revenue: 71050, baseRevenue: 70000, surcharge: 1050, platformFee: 700, orders: 1 },
        ]
        const { summary } = buildTransferBreakdown(agg, 31)

        expect(summary.orders).toBe(2)
        expect(summary.totalRevenue).toBe(142100)
        expect(summary.totalPlatformFee).toBe(1400)
    })
})
