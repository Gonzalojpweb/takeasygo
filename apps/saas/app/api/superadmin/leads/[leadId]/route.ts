import { connectDB } from '@/lib/mongoose'
import Lead from '@/models/Lead'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { safeDecrypt } from '@/lib/crypto'

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ leadId: string }> }
) {
    try {
        const authError = await requireSuperAdmin()
        if (authError) return authError

        const { leadId } = await params
        const body = await request.json()

        // Only allow updating status and notes
        const allowedFields: Record<string, unknown> = {}
        if (body.status !== undefined) allowedFields.status = body.status
        if (body.notes !== undefined) allowedFields.notes = body.notes

        await connectDB()
        const lead = await Lead.findByIdAndUpdate(
            leadId,
            { $set: allowedFields },
            { new: true, runValidators: true }
        )

        if (!lead) {
            return NextResponse.json({ error: 'Lead no encontrado.' }, { status: 404 })
        }

        const plain = lead.toObject()
        return NextResponse.json({
            lead: {
                ...plain,
                name:  safeDecrypt(plain.name),
                email: safeDecrypt(plain.email),
                phone: safeDecrypt(plain.phone),
            },
        })
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 })
    }
}
