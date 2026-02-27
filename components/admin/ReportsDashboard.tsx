'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    DollarSign, ShoppingBag, TrendingUp, Users,
    History, ArrowUpRight, ArrowDownRight, Award,
    Package, FileSpreadsheet, FileText, Loader2, Calendar
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Props {
    stats: {
        revenue: number
        orders: number
        avgTicket: number
        growth: string
        lastMonthRevenue: number
        lastMonthOrders: number
    }
    topItems: any[]
    recentOrders: any[]
    tenantSlug: string
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

export default function ReportsDashboard({ stats, topItems, recentOrders, tenantSlug }: Props) {
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
