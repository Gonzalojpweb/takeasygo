import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { createAgreementVersion } from '@/lib/network/admin'
import { networkContext, networkError, readBody } from '@/lib/network/http'

// POST — acuerdo nuevo o nueva versión (cierra la vigente del mismo alcance sin pisarla).
export async function POST(request: NextRequest) {
  const ctx = await networkContext(request)
  if (!ctx.ok) return ctx.response
  try {
    await connectDB()
    return NextResponse.json({ agreement: await createAgreementVersion(await readBody(request), ctx.actor) }, { status: 201 })
  } catch (err) {
    return networkError(err, 'agreement_create')
  }
}
