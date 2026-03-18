import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { Globe, ShieldCheck, TrendingUp, CircleDot } from 'lucide-react'

export default async function RedPage() {
    await connectDB()

    const raw = await Tenant.find({ isActive: true })
        .select('name slug plan profile.social.instagram cachedScores mercadopago.isConfigured createdAt')
        .sort({ createdAt: -1 })
        .lean()

    const data = raw.map((t: any) => ({
        _id:          String(t._id),
        name:         t.name,
        slug:         t.slug,
        plan:         t.plan as string,
        instagram:    t.profile?.social?.instagram || '',
        icoScore:     t.cachedScores?.icoScore ?? null,
        capacityScore:t.cachedScores?.capacityScore ?? null,
        mpConfigured: t.mercadopago?.isConfigured ?? false,
        createdAt:    t.createdAt?.toISOString?.() ?? String(t.createdAt),
    }))

    const PLAN_LABEL: Record<string, string> = {
        try:   'Inicial',
        buy:   'Crecimiento',
        full:  'Premium',
        trial: 'Trial',
    }

    const PLAN_COLOR: Record<string, string> = {
        try:   'bg-zinc-100 text-zinc-500',
        buy:   'bg-blue-50 text-blue-600',
        full:  'bg-amber-50 text-amber-600',
        trial: 'bg-zinc-100 text-zinc-400',
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">

            {/* Header */}
            <div>
                <h1 className="text-foreground text-3xl font-bold tracking-tight">Red</h1>
                <p className="text-muted-foreground mt-1 font-medium">
                    Restaurantes activos en la plataforma TakeasyGO.
                </p>
            </div>

            {/* KPIs */}
            <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2.5 px-4 py-2 rounded-full border-2 text-sm font-bold bg-primary/10 text-primary border-primary/20">
                    <Globe size={14} />
                    <span>Activos:</span>
                    <span className="text-lg leading-none">{data.length}</span>
                </div>
                <div className="flex items-center gap-2.5 px-4 py-2 rounded-full border-2 text-sm font-bold bg-emerald-50 text-emerald-700 border-emerald-200">
                    <ShieldCheck size={14} />
                    <span>Con MercadoPago:</span>
                    <span className="text-lg leading-none">{data.filter(t => t.mpConfigured).length}</span>
                </div>
                <div className="flex items-center gap-2.5 px-4 py-2 rounded-full border-2 text-sm font-bold bg-amber-50 text-amber-700 border-amber-200">
                    <TrendingUp size={14} />
                    <span>ICO promedio:</span>
                    <span className="text-lg leading-none">
                        {data.filter(t => t.icoScore !== null).length > 0
                            ? Math.round(
                                data.filter(t => t.icoScore !== null)
                                    .reduce((s, t) => s + (t.icoScore as number), 0) /
                                data.filter(t => t.icoScore !== null).length
                              )
                            : '—'}
                    </span>
                </div>
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-zinc-200 overflow-hidden bg-white">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-zinc-100 bg-zinc-50/80">
                                <th className="text-left px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Restaurante</th>
                                <th className="text-left px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hidden md:table-cell">Slug / URL</th>
                                <th className="text-left px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hidden md:table-cell">Instagram</th>
                                <th className="text-left px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Plan</th>
                                <th className="text-left px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hidden lg:table-cell">ICO</th>
                                <th className="text-left px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hidden lg:table-cell">MercadoPago</th>
                                <th className="text-left px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Alta</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="text-center py-20 text-zinc-400 font-medium">
                                        No hay restaurantes activos aún.
                                    </td>
                                </tr>
                            )}
                            {data.map((t) => (
                                <tr
                                    key={t._id}
                                    className="border-b border-zinc-50 hover:bg-zinc-50/70 transition-colors"
                                >
                                    {/* Nombre */}
                                    <td className="px-5 py-4 font-semibold text-zinc-900">
                                        <div className="flex items-center gap-2">
                                            <CircleDot size={10} className="text-emerald-500 shrink-0" />
                                            {t.name}
                                        </div>
                                    </td>

                                    {/* Slug */}
                                    <td className="px-5 py-4 text-zinc-500 hidden md:table-cell">
                                        <a
                                            href={`/${t.slug}/menu`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="font-mono text-xs hover:text-primary transition-colors"
                                        >
                                            /{t.slug}
                                        </a>
                                    </td>

                                    {/* Instagram */}
                                    <td className="px-5 py-4 text-zinc-500 hidden md:table-cell">
                                        {t.instagram
                                            ? <a
                                                href={`https://instagram.com/${t.instagram.replace('@', '')}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="hover:text-primary transition-colors"
                                              >
                                                {t.instagram.startsWith('@') ? t.instagram : `@${t.instagram}`}
                                              </a>
                                            : <span className="text-zinc-300">—</span>
                                        }
                                    </td>

                                    {/* Plan */}
                                    <td className="px-5 py-4">
                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${PLAN_COLOR[t.plan] ?? 'bg-zinc-100 text-zinc-500'}`}>
                                            {PLAN_LABEL[t.plan] ?? t.plan}
                                        </span>
                                    </td>

                                    {/* ICO */}
                                    <td className="px-5 py-4 hidden lg:table-cell">
                                        {t.icoScore !== null ? (
                                            <span className={`font-bold text-sm ${
                                                t.icoScore >= 75 ? 'text-emerald-600' :
                                                t.icoScore >= 50 ? 'text-amber-500' :
                                                'text-red-500'
                                            }`}>
                                                {t.icoScore}
                                            </span>
                                        ) : (
                                            <span className="text-zinc-300 text-xs">Sin datos</span>
                                        )}
                                    </td>

                                    {/* MercadoPago */}
                                    <td className="px-5 py-4 hidden lg:table-cell">
                                        {t.mpConfigured
                                            ? <span className="text-emerald-600 text-xs font-semibold">✓ Configurado</span>
                                            : <span className="text-zinc-400 text-xs">—</span>
                                        }
                                    </td>

                                    {/* Alta */}
                                    <td className="px-5 py-4 text-zinc-400 text-xs whitespace-nowrap">
                                        {new Date(t.createdAt).toLocaleDateString('es-AR', {
                                            day: '2-digit', month: 'short', year: 'numeric'
                                        })}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
