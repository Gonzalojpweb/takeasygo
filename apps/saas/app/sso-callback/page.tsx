'use client'

import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, Suspense } from 'react'

function SsoCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const code = searchParams.get('code')
    const callbackUrl = searchParams.get('callbackUrl') || '/admin'

    if (!code) {
      setError('Missing auth code')
      return
    }

    signIn('credentials', {
      ssoCode: code,
      redirect: false,
    }).then((result) => {
      if (result?.error) {
        setError(result.error)
        return
      }
      router.push(callbackUrl)
    })
  }, [searchParams, router])

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h1>Error de autenticación</h1>
        <p>{error}</p>
        <a href="/login">Ir al login</a>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <p>Autenticando...</p>
    </div>
  )
}

export default function SsoCallbackPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <p>Autenticando...</p>
      </div>
    }>
      <SsoCallbackContent />
    </Suspense>
  )
}
