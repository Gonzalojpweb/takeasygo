import { connectDB } from '@/lib/mongoose'
import Lead from '@/models/Lead'
import LeadsTable from '@/components/superadmin/LeadsTable'
import { Users } from 'lucide-react'

export default async function LeadsPage() {
    await connectDB()
    const leads = await Lead.find().sort({ createdAt: -1 }).lean()

    // Serialize for client component
    const serialized = leads.map((l: any) => ({
        _id: String(l._id),
        name: l.name,
        business: l.business,
        email: l.email,
        phone: l.phone,
        plan: l.plan,
        planId: l.planId,
        status: l.status,
        notes: l.notes || '',
        createdAt: l.createdAt?.toISOString?.() ?? String(l.createdAt),
    }))

    const counts = {
        total:     serialized.length,
        new:       serialized.filter(l => l.status === 'new').length,
        contacted: serialized.filter(l => l.status === 'contacted').length,
        closed:    serialized.filter(l => l.status === 'closed').length,
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-foreground text-3xl font-bold tracking-tight">Leads</h1>
                    <p className="text-muted-foreground mt-1 font-medium">
                        Consultas recibidas desde la landing page.
                    </p>
                </div>
            </div>

            {/* Summary chips */}
            <div className="flex flex-wrap gap-3">
                {[
                    { label: 'Total',       value: counts.total,     color: 'bg-primary/10 text-primary border-primary/20' },
                    { label: 'Nuevos',      value: counts.new,       color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
                    { label: 'Contactados', value: counts.contacted,  color: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
                    { label: 'Cerrados',    value: counts.closed,    color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
                ].map(({ label, value, color }) => (
                    <div key={label} className={`flex items-center gap-2.5 px-4 py-2 rounded-full border-2 text-sm font-bold ${color}`}>
                        <Users size={14} />
                        <span>{label}:</span>
                        <span className="text-lg leading-none">{value}</span>
                    </div>
                ))}
            </div>

            {/* Interactive table (client component) */}
            <LeadsTable leads={serialized} />
        </div>
    )
}
