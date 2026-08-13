export interface TransferAggRow {
    _id: number
    revenue: number
    baseRevenue: number
    surcharge: number
    platformFee: number
    orders: number
}

export interface TransferDailyRow {
    day: number
    revenue: number
    baseRevenue: number
    surcharge: number
    platformFee: number
    orders: number
}

export interface TransferSummary {
    totalRevenue: number
    totalBaseRevenue: number
    totalSurcharge: number
    totalPlatformFee: number
    orders: number
}

/**
 * Builds the transfer-commission summary and per-day breakdown from the
 * MongoDB aggregation rows (grouped by $dayOfMonth).
 *
 * The transfer commission is paid MANUALLY by the admin to TakeasyGO, so it
 * must be reported separately from the MP/Kripton commissions (which are
 * auto-debited via split). `totalPlatformFee` is the exact amount the admin
 * owes for the period.
 */
export function buildTransferBreakdown(
    transferAgg: TransferAggRow[],
    daysInMonth: number,
): { summary: TransferSummary; daily: TransferDailyRow[] } {
    const totalRevenue = transferAgg.reduce((s, d) => s + d.revenue, 0)
    const totalBaseRevenue = transferAgg.reduce((s, d) => s + (d.baseRevenue || 0), 0)
    const totalSurcharge = transferAgg.reduce((s, d) => s + (d.surcharge || 0), 0)
    const totalPlatformFee = transferAgg.reduce((s, d) => s + (d.platformFee || 0), 0)
    const totalOrders = transferAgg.reduce((s, d) => s + d.orders, 0)

    const transferMap = Object.fromEntries(transferAgg.map(d => [d._id, d]))
    const daily: TransferDailyRow[] = Array.from({ length: daysInMonth }, (_, i) => {
        const d = transferMap[i + 1]
        return {
            day: i + 1,
            revenue: d?.revenue ?? 0,
            baseRevenue: d?.baseRevenue ?? 0,
            surcharge: d?.surcharge ?? 0,
            platformFee: d?.platformFee ?? 0,
            orders: d?.orders ?? 0,
        }
    })

    const summary: TransferSummary = {
        totalRevenue,
        totalBaseRevenue,
        totalSurcharge,
        totalPlatformFee,
        orders: totalOrders,
    }

    return { summary, daily }
}
