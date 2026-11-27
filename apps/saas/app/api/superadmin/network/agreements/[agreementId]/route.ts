import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { endAgreement } from '@/lib/network/admin'
import { networkContext, networkError } from '@/lib/network/http'

// DELETE — termina el acuerdo vigente (queda en el historial; no se borra).
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ agreementId: string }> }) {
  const ctx = await networkContext(request)
  if (!ctx.ok) return ctx.response
  try {
    const { agreementId } = await params
    await connectDB()
    return NextResponse.json({ agreement: await endAgreement(agreementId, ctx.actor) })
  } catch (err) {
    return networkError(err, 'agreement_end')
  }
}
