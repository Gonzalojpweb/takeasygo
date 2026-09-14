import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens, getConnectedEmail, saveTokens, disconnect } from '@/lib/google-contacts'
import Tenant from '@/models/Tenant'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state') // tenantId
  const error = req.nextUrl.searchParams.get('error')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  if (error) {
    return NextResponse.redirect(`${baseUrl}/superadmin?googleContacts=error&reason=${error}`)
  }

  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/superadmin?googleContacts=error&reason=missing_params`)
  }

  try {
    const tenant = await Tenant.findById(state).lean()
    if (!tenant) {
      return NextResponse.redirect(`${baseUrl}/superadmin?googleContacts=error&reason=tenant_not_found`)
    }

    const tokens = await exchangeCodeForTokens(code)

    const connectedEmail = tokens.access_token
      ? await getConnectedEmail(tokens.access_token)
      : null

    await saveTokens(state, tokens, connectedEmail)

    return NextResponse.redirect(`${baseUrl}/superadmin?googleContacts=success`)
  } catch (err: any) {
    console.error('[google-contacts] callback error:', err)

    try {
      await disconnect(state)
    } catch {}

    return NextResponse.redirect(`${baseUrl}/superadmin?googleContacts=error&reason=token_exchange_failed`)
  }
}
