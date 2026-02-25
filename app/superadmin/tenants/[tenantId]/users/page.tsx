import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import TenantUsersManager from '@/components/superadmin/TenantUsersManager'
import { Types } from 'mongoose'

interface Props {
    params: Promise<{ tenantId: string }>
}

export default async function TenantUsersPage({ params }: Props) {
    const { tenantId } = await params
    await connectDB()

    const tenant = await Tenant.findById(tenantId).lean<{
        _id: Types.ObjectId
        name: string
        slug: string
    }>()
    if (!tenant) notFound()

    const users = await User.find({ tenantId })
        .select('-password')
        .sort({ createdAt: 1 })
        .lean<Array<{
            _id: Types.ObjectId
            name: string
            email: string
            role: string
            isActive: boolean
            createdAt: Date
        }>>()

    const serializedUsers = users.map(u => ({
        _id: u._id.toString(),
        name: u.name,
        email: u.email,
        role: u.role as 'admin' | 'manager' | 'staff' | 'cashier',
        isActive: u.isActive,
        createdAt: u.createdAt.toISOString(),
    }))

    return (
        <div className="max-w-2xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Link
                href="/superadmin/tenants"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm transition-colors w-fit"
            >
                <ChevronLeft size={14} /> Volver a tenants
            </Link>

            <div>
                <h1 className="text-foreground text-2xl font-bold tracking-tight">Usuarios</h1>
                <p className="text-muted-foreground text-sm mt-1">
                    {tenant.name}{' '}
                    <span className="font-mono text-xs">— {tenant.slug}</span>
                </p>
            </div>

            <TenantUsersManager
                tenantId={tenantId}
                initialUsers={serializedUsers}
            />
        </div>
    )
}
