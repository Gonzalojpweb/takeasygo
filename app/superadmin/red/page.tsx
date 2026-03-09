import { connectDB } from '@/lib/mongoose'
import NetworkRestaurant from '@/models/NetworkRestaurant'
import { Globe } from 'lucide-react'

export default async function RedPage() {
    await connectDB()
    const raw = await NetworkRestaurant.find().sort({ createdAt: -1 }).lean()

    const data = raw.map((r: any) => ({
        _id:             String(r._id),
        nombre:          r.nombre,
        instagram:       r.instagram || '',
        email:           r.email,
        telefono:        r.telefono,
        tipoRestaurante: r.tipoRestaurante,
        createdAt:       r.createdAt?.toISOString?.() ?? String(r.createdAt),
    }))

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-foreground text-3xl font-bold tracking-tight">Red</h1>
                    <p className="text-muted-foreground mt-1 font-medium">
                        Restaurantes registrados desde la landing — captación orgánica.
                    </p>
                </div>
            </div>

            {/* Summary chip */}
            <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2.5 px-4 py-2 rounded-full border-2 text-sm font-bold bg-primary/10 text-primary border-primary/20">
                    <Globe size={14} />
                    <span>Registros totales:</span>
                    <span className="text-lg leading-none">{data.length}</span>
                </div>
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-zinc-200 overflow-hidden bg-white">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-zinc-100 bg-zinc-50/80">
                                <th className="text-left px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Restaurante</th>
                                <th className="text-left px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hidden md:table-cell">Instagram</th>
                                <th className="text-left px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Email</th>
                                <th className="text-left px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hidden lg:table-cell">Teléfono</th>
                                <th className="text-left px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hidden lg:table-cell">Tipo</th>
                                <th className="text-left px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Registrado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center py-20 text-zinc-400 font-medium">
                                        Ningún restaurante registrado aún.
                                    </td>
                                </tr>
                            )}
                            {data.map((r) => (
                                <tr
                                    key={r._id}
                                    className="border-b border-zinc-50 hover:bg-zinc-50/70 transition-colors"
                                >
                                    <td className="px-5 py-4 font-semibold text-zinc-900">{r.nombre}</td>
                                    <td className="px-5 py-4 text-zinc-500 hidden md:table-cell">
                                        {r.instagram
                                            ? <a href={`https://instagram.com/${r.instagram.replace('@', '')}`} target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">{r.instagram}</a>
                                            : <span className="text-zinc-300">—</span>
                                        }
                                    </td>
                                    <td className="px-5 py-4">
                                        <a href={`mailto:${r.email}`} className="text-zinc-500 hover:text-primary transition-colors">{r.email}</a>
                                    </td>
                                    <td className="px-5 py-4 text-zinc-500 hidden lg:table-cell">{r.telefono}</td>
                                    <td className="px-5 py-4 hidden lg:table-cell">
                                        <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wide">
                                            {r.tipoRestaurante}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4 text-zinc-400 text-xs whitespace-nowrap">
                                        {new Date(r.createdAt).toLocaleDateString('es-AR', {
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
