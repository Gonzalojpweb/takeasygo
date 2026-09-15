import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens, getConnectedEmail, saveUserTokens, disconnectUser } from '@/lib/google-contacts'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state') // "user:{userId}"
  const error = req.nextUrl.searchParams.get('error')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  if (error) {
    return NextResponse.redirect(`${baseUrl}/superadmin?googleContacts=error&reason=${error}`)
  }

  if (!code || !state?.startsWith('user:')) {
    return NextResponse.redirect(`${baseUrl}/superadmin?googleContacts=error&reason=missing_params`)
  }

  const userId = state.replace('user:', '')
  if (!userId) {
    return NextResponse.redirect(`${baseUrl}/superadmin?googleContacts=error&reason=invalid_state`)
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const tokens = await exchangeCodeForTokens(code, `${baseUrl}/api/superadmin/google-contacts/callback`)

    const connectedEmail = tokens.access_token
      ? await getConnectedEmail(tokens.access_token)
      : null

    await saveUserTokens(userId, tokens, connectedEmail)

    return NextResponse.redirect(`${baseUrl}/superadmin?googleContacts=success`)
  } catch (err: any) {
    console.error('[superadmin-google-contacts] callback error:', err)

    try {
      await disconnectUser(userId)
    } catch {}

    return NextResponse.redirect(`${baseUrl}/superadmin?googleContacts=error&reason=token_exchange_failed`)
  }
}
