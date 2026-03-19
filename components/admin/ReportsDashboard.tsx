'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    DollarSign, ShoppingBag, TrendingUp, Users,
    History, ArrowUpRight, ArrowDownRight, Award,
    Package, FileSpreadsheet, FileText, Loader2, Calendar,
    Clock, XCircle, Zap, RefreshCw, CreditCard, AlertCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import UpsellAnalytics from '@/components/admin/UpsellAnalytics'

interface Props {
    stats: {
        revenue: number
        orders: number
        avgTicket: number
        growth: string
        lastMonthRevenue: number
        lastMonthOrders: number
        // Cancelación
        cancRate: number
        cancTotal: number
        cancCount: number
        cancRatePrev: number | null
        cancTrend: 'better' | 'worse' | 'same' | null
        // Distribución horaria
        hourlyDistribution: { hour: number; count: number }[]
        peakHour: { hour: number; count: number } | null
        // TPP
        tppMinutes: number | null
        tppStdMin: number | null
        tppSampleSize: number
        // Pedidos en tiempo
        onTimePct: number | null
        // Conversión MP
        payConvPct: number | null
        // Recompra
        recompraPct: number | null
        recompraClients: number
        recompraBreakdown: { once: number; twice: number; thrice: number } | null
        // Nuevos KPIs Fase 1
        revenueByCategory: { category: string; revenue: number; quantity: number }[]
        dailyTrend: { day: number; revenue: number; orders: number }[]
        revenueByLocation: { locationName: string; revenue: number; orders: number }[]
        // Upselling analytics
        upsellRows: { name: string; source: string; adds: number; conversions: number; conversionRate: number; revenue: number }[]
        upsellTotalAdds: number
        upsellTotalConversions: number
        upsellTotalRevenue: number
        upsellOverallConvRate: number
    }
    topItems: any[]
    recentOrders: any[]
    tenantSlug: string
    plan?: string
}

function getDefaultDates() {
    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return {
        from: from.toISOString().split('T')[0],
        to: to.toISOString().split('T')[0],
    }
}

function fmt(n: number) {
    return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d: string | Date) {
    return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const STATUS_LABELS: Record<string, string> = {
    pending: 'Pendiente', confirmed: 'Confirmado', preparing: 'En preparación',
    ready: 'Listo', delivered: 'Entregado', cancelled: 'Cancelado',
}
const PAYMENT_LABELS: Record<string, string> = {
    pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado', cancelled: 'Cancelado',
}

export default function ReportsDashboard({ stats, topItems, recentOrders, tenantSlug, plan }: Props) {
    const isPositive = Number(stats.growth) >= 0
    const defaults = getDefaultDates()
    const [from, setFrom] = useState(defaults.from)
    const [to, setTo] = useState(defaults.to)
    const [loadingExcel, setLoadingExcel] = useState(false)
    const [loadingPdf, setLoadingPdf] = useState(false)

    // ── Download Excel ────────────────────────────────────────────────────────
    async function handleDownloadExcel() {
        setLoadingExcel(true)
        try {
            const url = `/api/${tenantSlug}/reports/download?format=excel&from=${from}&to=${to}`
            const res = await fetch(url)
            if (!res.ok) throw new Error('Error al generar el reporte')
            const blob = await res.blob()
            const link = document.createElement('a')
            link.href = URL.createObjectURL(blob)
            link.download = `reporte-${tenantSlug}-${from}-al-${to}.xlsx`
            link.click()
            URL.revokeObjectURL(link.href)
            toast.success('Reporte Excel descargado')
        } catch {
            toast.error('Error al descargar el reporte Excel')
        } finally {
            setLoadingExcel(false)
        }
    }

    // ── Download PDF ──────────────────────────────────────────────────────────
    async function handleDownloadPdf() {
        setLoadingPdf(true)
        try {
            // 1. Fetch data
            const res = await fetch(`/api/${tenantSlug}/reports/download?format=data&from=${from}&to=${to}`)
            if (!res.ok) throw new Error()
            const { orders }: { orders: any[] } = await res.json()

            // 2. Dynamic imports (avoids SSR issues)
            const { default: jsPDF } = await import('jspdf')
            const { default: autoTable } = await import('jspdf-autotable')

            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
            const pageW = doc.internal.pageSize.getWidth()
            const PR = 99, PG = 102, PB = 241   // primary color rgb

            // ── Header ─────────────────────────────────────────────────────
            doc.setFillColor(30, 27, 75)
            doc.rect(0, 0, pageW, 28, 'F')
            doc.setTextColor(255, 255, 255)
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(18)
            doc.text('Reporte de Ventas', 14, 12)
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(10)
            doc.text(tenantSlug.toUpperCase(), 14, 19)
            doc.text(`Período: ${from} → ${to}`, pageW - 14, 12, { align: 'right' })
            doc.setFontSize(8)
            doc.setTextColor(180, 180, 255)
            doc.text(`Generado: ${new Date().toLocaleDateString('es-AR')}`, pageW - 14, 19, { align: 'right' })

            let y = 36

            // ── Summary boxes ──────────────────────────────────────────────
            const activeOrders = orders.filter(o => o.status !== 'cancelled')
            const cancelledOrders = orders.filter(o => o.status === 'cancelled')
            const totalRevenue = activeOrders.reduce((s, o) => s + o.total, 0)
            const avgTicket = activeOrders.length > 0 ? totalRevenue / activeOrders.length : 0

            const boxes = [
                { label: 'Órdenes totales', value: orders.length.toString() },
                { label: 'Órdenes activas', value: activeOrders.length.toString() },
                { label: 'Canceladas', value: cancelledOrders.length.toString() },
                { label: 'Ventas netas', value: `$${fmt(totalRevenue)}` },
                { label: 'Ticket promedio', value: `$${fmt(avgTicket)}` },
            ]

            const boxW = (pageW - 28) / boxes.length
            boxes.forEach((box, i) => {
                const x = 14 + i * boxW
                doc.setFillColor(240, 239, 255)
                doc.roundedRect(x, y, boxW - 4, 18, 3, 3, 'F')
                doc.setTextColor(PR, PG, PB)
                doc.setFont('helvetica', 'bold')
                doc.setFontSize(13)
                doc.text(box.value, x + (boxW - 4) / 2, y + 9, { align: 'center' })
                doc.setFont('helvetica', 'normal')
                doc.setFontSize(7)
                doc.setTextColor(100, 100, 120)
                doc.text(box.label, x + (boxW - 4) / 2, y + 14, { align: 'center' })
            })

            y += 26

            // ── Orders table ───────────────────────────────────────────────
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(11)
            doc.setTextColor(30, 27, 75)
            doc.text('Detalle de Órdenes', 14, y)
            y += 4

            autoTable(doc, {
                startY: y,
                head: [['#', 'N° Orden', 'Fecha', 'Cliente', 'Teléfono', 'Items', 'Total', 'Estado', 'Pago']],
                body: orders.map((o, i) => [
                    i + 1,
                    o.orderNumber,
                    fmtDate(o.createdAt),
                    o.customer?.name || '—',
                    o.customer?.phone || '—',
                    o.items.map((it: any) => `${it.quantity}x ${it.name}`).join(', '),
                    `$${fmt(o.total)}`,
                    STATUS_LABELS[o.status] || o.status,
                    PAYMENT_LABELS[o.payment?.status] || o.payment?.status || '—',
                ]),
                headStyles: { fillColor: [30, 27, 75], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
                bodyStyles: { fontSize: 7.5, cellPadding: 2 },
                alternateRowStyles: { fillColor: [245, 244, 255] },
                didParseCell(data) {
                    if (data.section === 'body') {
                        const row = orders[data.row.index]
                        if (row?.status === 'cancelled') {
                            data.cell.styles.textColor = [160, 160, 160]
                            data.cell.styles.fontStyle = 'italic'
                        }
                        if (data.column.index === 6) {
                            data.cell.styles.fontStyle = 'bold'
                            data.cell.styles.textColor = [PR, PG, PB]
                        }
                    }
                },
                columnStyles: {
                    0: { cellWidth: 8 }, 1: { cellWidth: 22 }, 2: { cellWidth: 30 },
                    3: { cellWidth: 30 }, 4: { cellWidth: 22 }, 5: { cellWidth: 'auto' },
                    6: { cellWidth: 22 }, 7: { cellWidth: 22 }, 8: { cellWidth: 20 },
                },
                margin: { left: 14, right: 14 },
                showFoot: 'lastPage',
                foot: [['', '', '', '', '', 'TOTAL', `$${fmt(totalRevenue)}`, '', '']],
                footStyles: { fillColor: [PR, PG, PB], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
            })

            // ── Top items — nueva página ────────────────────────────────────
            const itemMap: Record<string, { quantity: number; revenue: number }> = {}
            activeOrders.forEach(o => {
                o.items.forEach((it: any) => {
                    if (!itemMap[it.name]) itemMap[it.name] = { quantity: 0, revenue: 0 }
                    itemMap[it.name].quantity += it.quantity
                    itemMap[it.name].revenue += it.subtotal
                })
            })
            const topItemsData = Object.entries(itemMap).sort((a, b) => b[1].quantity - a[1].quantity)

            if (topItemsData.length > 0) {
                doc.addPage()
                doc.setFillColor(30, 27, 75)
                doc.rect(0, 0, pageW, 16, 'F')
                doc.setTextColor(255, 255, 255)
                doc.setFont('helvetica', 'bold')
                doc.setFontSize(12)
                doc.text('Items más Vendidos', 14, 11)

                autoTable(doc, {
                    startY: 24,
                    head: [['#', 'Producto', 'Cantidad', 'Ingresos generados']],
                    body: topItemsData.map(([name, data], i) => [i + 1, name, data.quantity, `$${fmt(data.revenue)}`]),
                    headStyles: { fillColor: [30, 27, 75], textColor: [255, 255, 255], fontStyle: 'bold' },
                    bodyStyles: { fontSize: 9 },
                    alternateRowStyles: { fillColor: [245, 244, 255] },
                    columnStyles: {
                        0: { cellWidth: 12 },
                        2: { halign: 'center' },
                        3: { halign: 'right', fontStyle: 'bold', textColor: [PR, PG, PB] },
                    },
                    margin: { left: 14, right: 14 },
                })
            }

            // ── Page numbers ───────────────────────────────────────────────
            const totalPages = (doc as any).internal.getNumberOfPages()
            for (let i = 1; i <= totalPages; i++) {
                doc.setPage(i)
                doc.setFontSize(7)
                doc.setTextColor(160)
                doc.text(
                    `Página ${i} de ${totalPages}  —  TakeAsyGo`,
                    pageW / 2, doc.internal.pageSize.getHeight() - 6,
                    { align: 'center' }
                )
            }

            doc.save(`reporte-${tenantSlug}-${from}-al-${to}.pdf`)
            toast.success('Reporte PDF descargado')
        } catch (err) {
            console.error(err)
            toast.error('Error al generar el PDF')
        } finally {
            setLoadingPdf(false)
        }
    }

    return (
        <div className="space-y-10 pb-10">

            {/* ── Download Panel ──────────────────────────────────────────── */}
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="border-2 border-primary/20 bg-primary/5 rounded-3xl shadow-lg">
                    <CardContent className="p-6">
                        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end justify-between">
                            <div>
                                <p className="text-[10px] uppercase font-black tracking-widest text-primary mb-1">Descargar reporte</p>
                                <p className="text-sm text-muted-foreground font-medium">Seleccioná el período y el formato de exportación.</p>
                            </div>

                            <div className="flex flex-wrap items-end gap-3 w-full sm:w-auto">
                                {/* Date range */}
                                <div className="flex items-center gap-2 bg-white border-2 border-border/80 rounded-xl px-4 py-2.5 shadow-sm">
                                    <Calendar size={14} className="text-primary shrink-0" />
                                    <input
                                        type="date"
                                        value={from}
                                        max={to}
                                        onChange={e => setFrom(e.target.value)}
                                        className="text-sm font-medium text-foreground outline-none bg-transparent"
                                    />
                                    <span className="text-muted-foreground text-sm">→</span>
                                    <input
                                        type="date"
                                        value={to}
                                        min={from}
                                        onChange={e => setTo(e.target.value)}
                                        className="text-sm font-medium text-foreground outline-none bg-transparent"
                                    />
                                </div>

                                {/* Excel */}
                                <Button
                                    onClick={handleDownloadExcel}
                                    disabled={loadingExcel || loadingPdf}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl px-5 h-11 shadow-md shadow-emerald-600/20 gap-2 transition-all active:scale-95"
                                >
                                    {loadingExcel
                                        ? <Loader2 size={16} className="animate-spin" />
                                        : <FileSpreadsheet size={16} />
                                    }
                                    Excel (.xlsx)
                                </Button>

                                {/* PDF */}
                                <Button
                                    onClick={handleDownloadPdf}
                                    disabled={loadingExcel || loadingPdf}
                                    className="bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl px-5 h-11 shadow-md shadow-rose-600/20 gap-2 transition-all active:scale-95"
                                >
                                    {loadingPdf
                                        ? <Loader2 size={16} className="animate-spin" />
                                        : <FileText size={16} />
                                    }
                                    PDF
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* ── Primary Stats Grid ─────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Ventas del Mes"
                    value={`$${stats.revenue.toLocaleString('es-AR')}`}
                    desc={`${isPositive ? '+' : ''}${stats.growth}% vs mes anterior`}
                    icon={<DollarSign size={20} />}
                    trend={isPositive ? 'up' : 'down'}
                    color="bg-primary/10 text-primary"
                    index={0}
                />
                <StatCard
                    title="Pedidos Totales"
                    value={stats.orders.toString()}
                    desc={`${stats.lastMonthOrders} el mes pasado`}
                    icon={<ShoppingBag size={20} />}
                    color="bg-blue-500/10 text-blue-500"
                    index={1}
                />
                <StatCard
                    title="Ticket Promedio"
                    value={`$${stats.avgTicket.toLocaleString('es-AR')}`}
                    desc="Basado en pedidos confirmados"
                    icon={<TrendingUp size={20} />}
                    color="bg-amber-500/10 text-amber-500"
                    index={2}
                />
                <StatCard
                    title="Mes Anterior"
                    value={`$${stats.lastMonthRevenue.toLocaleString('es-AR')}`}
                    desc={`${stats.lastMonthOrders} pedidos`}
                    icon={<History size={20} />}
                    color="bg-purple-500/10 text-purple-500"
                    index={3}
                />
            </div>

            {/* ── KPIs Operativos ─────────────────────────────────────── */}
            {plan !== 'full' && (
                <div className="flex items-start gap-4 p-6 rounded-2xl border-2 border-dashed border-border/60 bg-muted/20">
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                        <Zap size={18} className="text-muted-foreground" />
                    </div>
                    <div>
                        <p className="font-bold text-sm text-foreground">Analytics avanzados — Plan Premium</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Con Premium accedés a métricas de performance operativa: tiempo de preparación, cumplimiento de tiempos, tasa de cancelación con tendencia, recompra de clientes y distribución horaria de pedidos.
                        </p>
                    </div>
                </div>
            )}
            {plan === 'full' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
                <div className="mb-4">
                    <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Inteligencia operativa</p>
                    <h2 className="text-xl font-bold text-foreground">KPIs del Mes</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    {/* Tasa de cancelación — con tendencia vs mes anterior */}
                    <OperKpi
                        label="Cancelación"
                        value={`${stats.cancRate}%`}
                        sub={
                            stats.cancTrend !== null
                                ? `${stats.cancCount}/${stats.cancTotal} · ${stats.cancTrend === 'better' ? '↓' : stats.cancTrend === 'worse' ? '↑' : '='} ${Math.abs(stats.cancRate - (stats.cancRatePrev ?? 0))}pp vs mes ant.`
                                : `${stats.cancCount} de ${stats.cancTotal} pedidos`
                        }
                        icon={<XCircle size={18} />}
                        color={stats.cancRate > 15 ? 'text-destructive bg-destructive/10' : stats.cancRate > 5 ? 'text-amber-500 bg-amber-500/10' : 'text-emerald-500 bg-emerald-500/10'}
                        alert={stats.cancRate > 15}
                        trendColor={
                            stats.cancTrend === 'better' ? 'text-emerald-500'
                            : stats.cancTrend === 'worse' ? 'text-destructive'
                            : undefined
                        }
                    />
                    {/* TPP */}
                    <OperKpi
                        label="Tiempo prep."
                        value={stats.tppMinutes !== null ? `${stats.tppMinutes} min` : '—'}
                        sub={stats.tppMinutes !== null ? `σ ± ${stats.tppStdMin} min · n=${stats.tppSampleSize}` : 'Sin datos aún'}
                        icon={<Clock size={18} />}
                        color="text-blue-500 bg-blue-500/10"
                    />
                    {/* % en tiempo */}
                    <OperKpi
                        label="En tiempo"
                        value={stats.onTimePct !== null ? `${stats.onTimePct}%` : '—'}
                        sub={stats.onTimePct !== null ? 'pedidos listos a tiempo' : 'Sin datos aún'}
                        icon={<Zap size={18} />}
                        color={stats.onTimePct === null ? 'text-muted-foreground bg-muted/40' : stats.onTimePct >= 80 ? 'text-emerald-500 bg-emerald-500/10' : stats.onTimePct >= 60 ? 'text-amber-500 bg-amber-500/10' : 'text-destructive bg-destructive/10'}
                    />
                    {/* Recompra — card custom con breakdown de frecuencia */}
                    <RecompraKpi stats={stats} />
                    {/* Conversión MP */}
                    <OperKpi
                        label="Conv. pago"
                        value={stats.payConvPct !== null ? `${stats.payConvPct}%` : '—'}
                        sub={stats.payConvPct !== null ? 'pagos aprobados MP' : 'Sin pagos MP'}
                        icon={<CreditCard size={18} />}
                        color={stats.payConvPct === null ? 'text-muted-foreground bg-muted/40' : stats.payConvPct >= 85 ? 'text-emerald-500 bg-emerald-500/10' : 'text-amber-500 bg-amber-500/10'}
                    />
                    {/* Hora pico */}
                    <OperKpi
                        label="Hora pico"
                        value={stats.peakHour ? `${stats.peakHour.hour}:00` : '—'}
                        sub={stats.peakHour ? `${stats.peakHour.count} pedidos esa hora` : 'Sin datos'}
                        icon={<TrendingUp size={18} />}
                        color="text-amber-500 bg-amber-500/10"
                    />
                </div>
            </motion.div>

            )} {/* end plan === 'full' KPIs block */}

            {/* ── Distribución Horaria ─────────────────────────────────────── */}
            {plan === 'full' && stats.hourlyDistribution.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }}>
                    <Card className="bg-card border-border/60 shadow-xl rounded-[2.5rem] overflow-hidden">
                        <CardHeader className="p-8 border-b border-border/40 bg-muted/10">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                                        <Clock size={24} strokeWidth={2.5} />
                                    </div>
                                    <div>
                                        <CardTitle className="text-xl font-bold tracking-tight">Órdenes por Hora</CardTitle>
                                        <p className="text-xs text-muted-foreground font-medium">Distribución horaria del mes actual · madrugada <span className="inline-block w-2 h-2 rounded-sm bg-slate-400 align-middle" /> mañana <span className="inline-block w-2 h-2 rounded-sm bg-blue-400 align-middle" /> tarde <span className="inline-block w-2 h-2 rounded-sm bg-amber-400 align-middle" /> noche <span className="inline-block w-2 h-2 rounded-sm bg-purple-400 align-middle" /></p>
                                    </div>
                                </div>
                                {stats.peakHour && (
                                    <div className="text-right shrink-0">
                                        <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Hora pico</p>
                                        <p className="text-2xl font-black tabular-nums text-amber-500">{stats.peakHour.hour}:00</p>
                                        <p className="text-xs font-bold text-muted-foreground/70">{stats.peakHour.count} pedidos</p>
                                    </div>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="p-8 pt-6">
                            <HourlyChart distribution={stats.hourlyDistribution} />
                        </CardContent>
                    </Card>
                </motion.div>
            )}

            {/* ── Tendencia Diaria ─────────────────────────────────────── */}
            {plan === 'full' && stats.dailyTrend.some(d => d.orders > 0) && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.40 }}>
                    <Card className="bg-card border-border/60 shadow-xl rounded-[2.5rem] overflow-hidden">
                        <CardHeader className="p-8 border-b border-border/40 bg-muted/10">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                                        <TrendingUp size={24} strokeWidth={2.5} />
                                    </div>
                                    <div>
                                        <CardTitle className="text-xl font-bold tracking-tight">Tendencia Diaria</CardTitle>
                                        <p className="text-xs text-muted-foreground font-medium">Órdenes y ventas por día — mes actual</p>
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Pico del mes</p>
                                    {(() => {
                                        const peak = stats.dailyTrend.reduce((a, b) => b.orders > a.orders ? b : a, stats.dailyTrend[0])
                                        return peak && peak.orders > 0 ? (
                                            <>
                                                <p className="text-2xl font-black tabular-nums text-blue-500">Día {peak.day}</p>
                                                <p className="text-xs font-bold text-muted-foreground/70">{peak.orders} pedidos</p>
                                            </>
                                        ) : null
                                    })()}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-8 pt-6">
                            <DailyTrendChart trend={stats.dailyTrend} />
                        </CardContent>
                    </Card>
                </motion.div>
            )}

            {/* ── Revenue por Categoría + Revenue por Sede ──────────────── */}
            {plan === 'full' && (stats.revenueByCategory.length > 0 || stats.revenueByLocation.length > 1) && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.42 }}>
                    <div className={stats.revenueByCategory.length > 0 && stats.revenueByLocation.length > 1
                        ? 'grid grid-cols-1 lg:grid-cols-2 gap-8'
                        : 'grid grid-cols-1 gap-8'
                    }>
                        {/* Revenue por Categoría */}
                        {stats.revenueByCategory.length > 0 && (
                            <Card className="bg-card border-border/60 shadow-xl rounded-[2.5rem] overflow-hidden">
                                <CardHeader className="p-8 border-b border-border/40 bg-muted/10">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                                            <Package size={24} strokeWidth={2.5} />
                                        </div>
                                        <div>
                                            <CardTitle className="text-xl font-bold tracking-tight">Ventas por Categoría</CardTitle>
                                            <p className="text-xs text-muted-foreground font-medium">Ingresos netos del mes por categoría de menú</p>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-8">
                                    <CategoryRevenueChart categories={stats.revenueByCategory} />
                                </CardContent>
                            </Card>
                        )}

                        {/* Revenue por Sede */}
                        {stats.revenueByLocation.length > 1 && (
                            <Card className="bg-card border-border/60 shadow-xl rounded-[2.5rem] overflow-hidden">
                                <CardHeader className="p-8 border-b border-border/40 bg-muted/10">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-500">
                                            <Users size={24} strokeWidth={2.5} />
                                        </div>
                                        <div>
                                            <CardTitle className="text-xl font-bold tracking-tight">Ventas por Sede</CardTitle>
                                            <p className="text-xs text-muted-foreground font-medium">Comparativa de ingresos entre sucursales</p>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-8">
                                    <LocationRevenueChart locations={stats.revenueByLocation} />
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </motion.div>
            )}

            {/* ── Upselling Analytics ──────────────────────────────────── */}
            {plan === 'full' && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
                    <div className="mb-4">
                        <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
                            <Zap size={18} className="text-amber-500" />
                            Analytics de Upselling
                        </h2>
                        <p className="text-xs text-muted-foreground mt-0.5">Productos sugeridos · últimos 90 días</p>
                    </div>
                    <UpsellAnalytics
                        totalAdds={stats.upsellTotalAdds}
                        totalConversions={stats.upsellTotalConversions}
                        totalRevenue={stats.upsellTotalRevenue}
                        overallConversionRate={stats.upsellOverallConvRate}
                        windowDays={90}
                        rows={stats.upsellRows}
                    />
                </motion.div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8">
                {/* ── Top Product Rankings ──────────────────────────────── */}
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
                    <Card className="bg-card border-border/60 shadow-xl rounded-[2.5rem] overflow-hidden h-full">
                        <CardHeader className="p-8 border-b border-border/40 bg-muted/10">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                                    <Award size={24} strokeWidth={2.5} />
                                </div>
                                <div>
                                    <CardTitle className="text-xl font-bold tracking-tight">Items más Vendidos</CardTitle>
                                    <p className="text-xs text-muted-foreground font-medium">Top 5 productos con mayor rotación</p>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-8">
                            {topItems.length === 0 ? (
                                <div className="py-20 text-center opacity-50">
                                    <Package className="mx-auto mb-4 text-muted-foreground" size={40} />
                                    <p className="font-bold">Sin datos de ventas</p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {topItems.map((item: any, index: number) => (
                                        <div key={item._id} className="flex items-center justify-between group transition-all">
                                            <div className="flex items-center gap-5">
                                                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-sm font-black text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                                    {index + 1}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-foreground group-hover:translate-x-1 transition-transform">{item._id}</p>
                                                    <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">
                                                        {item.total} unidades
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-lg font-black tracking-tighter text-foreground tabular-nums">{item.total}</p>
                                                <p className="text-[10px] font-bold text-muted-foreground/70">${item.revenue.toLocaleString('es-AR')}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>

                {/* ── Recent Activity Feed ──────────────────────────────── */}
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }}>
                    <Card className="bg-card border-border/60 shadow-xl rounded-[2.5rem] overflow-hidden">
                        <CardHeader className="p-8 border-b border-border/40 bg-muted/10">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                                    <History size={24} strokeWidth={2.5} />
                                </div>
                                <div>
                                    <CardTitle className="text-xl font-bold tracking-tight">Actividad Reciente</CardTitle>
                                    <p className="text-xs text-muted-foreground font-medium">Últimas 10 órdenes procesadas</p>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-8">
                            <div className="space-y-6">
                                {recentOrders.map((order: any) => (
                                    <div key={order._id} className="flex items-center justify-between py-1 border-b border-border/40 last:border-0 pb-4 last:pb-0">
                                        <div>
                                            <p className="text-sm font-bold text-foreground">#{order.orderNumber}</p>
                                            <p className="text-[10px] font-medium text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                                <Users size={10} /> {order.customer.name}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-black tabular-nums text-foreground">${order.total.toLocaleString('es-AR')}</p>
                                            <p className="text-[10px] font-bold text-primary/70 uppercase tracking-tighter">Completado</p>
                                        </div>
                                    </div>
                                ))}
                                {recentOrders.length === 0 && (
                                    <p className="text-center text-muted-foreground text-sm py-10">No hay pedidos recientes</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        </div>
    )
}

function OperKpi({ label, value, sub, icon, color, alert, trendColor }: {
    label: string; value: string; sub: string; icon: React.ReactNode; color: string; alert?: boolean; trendColor?: string
}) {
    return (
        <Card className="bg-card border-2 border-border/60 rounded-2xl overflow-hidden relative">
            {alert && (
                <div className="absolute top-2 right-2">
                    <AlertCircle size={14} className="text-destructive" />
                </div>
            )}
            <CardContent className="p-4">
                <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center mb-3', color)}>
                    {icon}
                </div>
                <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 mb-0.5">{label}</p>
                <p className="text-2xl font-black tracking-tighter text-foreground tabular-nums leading-none">{value}</p>
                <p className={cn('text-[10px] font-bold mt-1 leading-tight', trendColor ?? 'text-muted-foreground/70')}>{sub}</p>
            </CardContent>
        </Card>
    )
}

function RecompraKpi({ stats }: { stats: Props['stats'] }) {
    const { recompraPct, recompraClients, recompraBreakdown } = stats
    return (
        <Card className="bg-card border-2 border-border/60 rounded-2xl overflow-hidden">
            <CardContent className="p-4">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3 text-purple-500 bg-purple-500/10">
                    <RefreshCw size={18} />
                </div>
                <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 mb-0.5">Recompra</p>
                <p className="text-2xl font-black tracking-tighter text-foreground tabular-nums leading-none">
                    {recompraPct !== null ? `${recompraPct}%` : '—'}
                </p>
                <p className="text-[10px] font-bold text-muted-foreground/70 mt-1 leading-tight">
                    {recompraClients > 0 ? `${recompraClients} clientes · 90 días` : 'Sin datos aún'}
                </p>
                {recompraBreakdown && recompraClients > 0 && (
                    <div className="mt-3 space-y-1.5">
                        <MiniBar label="1 compra" value={recompraBreakdown.once} total={recompraClients} color="bg-purple-300" />
                        <MiniBar label="2 compras" value={recompraBreakdown.twice} total={recompraClients} color="bg-purple-500" />
                        <MiniBar label="3+ compras" value={recompraBreakdown.thrice} total={recompraClients} color="bg-purple-700" />
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

function MiniBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
    const pct = total > 0 ? Math.round((value / total) * 100) : 0
    return (
        <div>
            <div className="flex justify-between text-[9px] font-bold text-muted-foreground/60 mb-0.5">
                <span>{label}</span>
                <span>{value}</span>
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden">
                <div
                    className={cn('h-full rounded-full', color)}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    )
}

function HourlyChart({ distribution }: { distribution: { hour: number; count: number }[] }) {
    const map = Object.fromEntries(distribution.map(d => [d.hour, d.count]))
    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: (map[h] ?? 0) as number }))
    const maxCount = Math.max(...hours.map(h => h.count), 1)

    function barColor(hour: number): string {
        if (hour < 6) return 'bg-slate-400'
        if (hour < 12) return 'bg-blue-400'
        if (hour < 18) return 'bg-amber-400'
        return 'bg-purple-400'
    }

    return (
        <div className="relative pb-5">
            <div
                className="flex items-end gap-[3px] h-32"
                role="img"
                aria-label="Distribución horaria de órdenes del mes actual"
            >
                {hours.map(({ hour, count }) => (
                    <div key={hour} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                        {/* Tooltip */}
                        {count > 0 && (
                            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-foreground text-background text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                {hour}:00 · {count} ped.
                            </div>
                        )}
                        {/* Barra */}
                        <div
                            className={cn('w-full rounded-t-[3px] transition-all duration-300', count > 0 ? barColor(hour) : 'bg-muted/40')}
                            style={{
                                height: count > 0
                                    ? `${Math.max(4, Math.round((count / maxCount) * 100))}%`
                                    : '2px'
                            }}
                        />
                    </div>
                ))}
            </div>
            {/* Eje X — labels cada 3 horas */}
            <div className="flex mt-1.5">
                {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="flex-1 text-center">
                        {h % 3 === 0 && (
                            <span className="text-[8px] font-bold text-muted-foreground/50">{h}h</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

function DailyTrendChart({ trend }: { trend: { day: number; revenue: number; orders: number }[] }) {
    const maxOrders = Math.max(...trend.map(d => d.orders), 1)
    const maxRevenue = Math.max(...trend.map(d => d.revenue), 1)
    const today = new Date().getDate()

    return (
        <div className="space-y-4">
            {/* Bars — orders */}
            <div>
                <p className="text-[9px] uppercase font-black tracking-widest text-muted-foreground/50 mb-2">Pedidos por día</p>
                <div className="flex items-end gap-[2px] h-24" role="img" aria-label="Tendencia de pedidos diarios">
                    {trend.map(({ day, orders }) => (
                        <div key={day} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                            {orders > 0 && (
                                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-foreground text-background text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                    Día {day} · {orders} ped.
                                </div>
                            )}
                            <div
                                className={cn(
                                    'w-full rounded-t-[3px] transition-all duration-300',
                                    day === today ? 'bg-blue-500' : orders > 0 ? 'bg-blue-400/70' : 'bg-muted/30'
                                )}
                                style={{ height: orders > 0 ? `${Math.max(4, Math.round((orders / maxOrders) * 100))}%` : '2px' }}
                            />
                        </div>
                    ))}
                </div>
                {/* Day labels every 5 */}
                <div className="flex mt-1">
                    {trend.map(({ day }) => (
                        <div key={day} className="flex-1 text-center">
                            {(day === 1 || day % 5 === 0) && (
                                <span className="text-[8px] font-bold text-muted-foreground/50">{day}</span>
                            )}
                        </div>
                    ))}
                </div>
            </div>
            {/* Bars — revenue */}
            <div>
                <p className="text-[9px] uppercase font-black tracking-widest text-muted-foreground/50 mb-2">Ventas por día ($)</p>
                <div className="flex items-end gap-[2px] h-16" role="img" aria-label="Tendencia de ventas diarias">
                    {trend.map(({ day, revenue }) => (
                        <div key={day} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                            {revenue > 0 && (
                                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-foreground text-background text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                    Día {day} · ${revenue.toLocaleString('es-AR')}
                                </div>
                            )}
                            <div
                                className={cn(
                                    'w-full rounded-t-[3px] transition-all duration-300',
                                    day === today ? 'bg-emerald-500' : revenue > 0 ? 'bg-emerald-400/70' : 'bg-muted/30'
                                )}
                                style={{ height: revenue > 0 ? `${Math.max(4, Math.round((revenue / maxRevenue) * 100))}%` : '2px' }}
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

function CategoryRevenueChart({ categories }: { categories: { category: string; revenue: number; quantity: number }[] }) {
    const maxRevenue = Math.max(...categories.map(c => c.revenue), 1)
    const totalRevenue = categories.reduce((s, c) => s + c.revenue, 0)
    const COLORS = ['bg-emerald-500', 'bg-blue-500', 'bg-amber-500', 'bg-purple-500', 'bg-rose-500', 'bg-teal-500', 'bg-indigo-500', 'bg-orange-500']

    return (
        <div className="space-y-4">
            {categories.map((cat, i) => {
                const pct = totalRevenue > 0 ? Math.round((cat.revenue / totalRevenue) * 100) : 0
                const barPct = Math.round((cat.revenue / maxRevenue) * 100)
                return (
                    <div key={cat.category}>
                        <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                                <div className={cn('w-2 h-2 rounded-full shrink-0', COLORS[i % COLORS.length])} />
                                <span className="text-sm font-bold text-foreground truncate max-w-[180px]">{cat.category}</span>
                                <span className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-widest">{cat.quantity} uds.</span>
                            </div>
                            <div className="text-right shrink-0 ml-4">
                                <span className="text-sm font-black tabular-nums text-foreground">${cat.revenue.toLocaleString('es-AR')}</span>
                                <span className="text-[10px] font-bold text-muted-foreground/60 ml-1.5">{pct}%</span>
                            </div>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                                className={cn('h-full rounded-full transition-all duration-500', COLORS[i % COLORS.length])}
                                style={{ width: `${barPct}%` }}
                            />
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

function LocationRevenueChart({ locations }: { locations: { locationName: string; revenue: number; orders: number }[] }) {
    const maxRevenue = Math.max(...locations.map(l => l.revenue), 1)
    const totalRevenue = locations.reduce((s, l) => s + l.revenue, 0)
    const COLORS = ['bg-purple-500', 'bg-blue-500', 'bg-amber-500', 'bg-emerald-500', 'bg-rose-500']

    return (
        <div className="space-y-4">
            {locations.map((loc, i) => {
                const pct = totalRevenue > 0 ? Math.round((loc.revenue / totalRevenue) * 100) : 0
                const barPct = Math.round((loc.revenue / maxRevenue) * 100)
                return (
                    <div key={loc.locationName}>
                        <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                                <div className={cn('w-2 h-2 rounded-full shrink-0', COLORS[i % COLORS.length])} />
                                <span className="text-sm font-bold text-foreground truncate max-w-[180px]">{loc.locationName}</span>
                                <span className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-widest">{loc.orders} pedidos</span>
                            </div>
                            <div className="text-right shrink-0 ml-4">
                                <span className="text-sm font-black tabular-nums text-foreground">${loc.revenue.toLocaleString('es-AR')}</span>
                                <span className="text-[10px] font-bold text-muted-foreground/60 ml-1.5">{pct}%</span>
                            </div>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                                className={cn('h-full rounded-full transition-all duration-500', COLORS[i % COLORS.length])}
                                style={{ width: `${barPct}%` }}
                            />
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

function StatCard({ title, value, desc, icon, trend, color, index }: any) {
    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }}>
            <Card className="bg-card border-2 border-border/60 shadow-lg hover:shadow-2xl hover:border-primary/30 transition-all duration-500 rounded-[2rem] overflow-hidden group relative">
                <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:scale-150 group-hover:rotate-12 transition-transform duration-700 pointer-events-none">
                    {icon}
                </div>
                <CardContent className="p-7">
                    <div className="flex items-center justify-between mb-5">
                        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center group-hover:bg-primary transition-all duration-500 shadow-sm", color)}>
                            <div className="group-hover:text-white transition-colors">
                                {icon}
                            </div>
                        </div>
                        {trend && (
                            <div className={cn(
                                "flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border-2",
                                trend === 'up' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-destructive/10 text-destructive border-destructive/20"
                            )}>
                                {trend === 'up' ? <ArrowUpRight size={12} strokeWidth={3} /> : <ArrowDownRight size={12} strokeWidth={3} />}
                                {trend === 'up' ? 'Creciendo' : 'Bajando'}
                            </div>
                        )}
                    </div>
                    <div>
                        <p className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50 mb-1">{title}</p>
                        <h3 className="text-3xl font-black tracking-tighter text-foreground tabular-nums mb-1">{value}</h3>
                        <p className="text-xs font-bold text-muted-foreground/70">{desc}</p>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    )
}
