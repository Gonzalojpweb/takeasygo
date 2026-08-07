'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import BottomNav from '@/components/explore/BottomNav'
import { TenantProvider, useTenant } from '@/contexts/TenantContext'

interface Props {
  tenantSlug: string
  children: React.ReactNode
}

function MenuContent({ tenantSlug, children }: Props) {
  const { setTenantSlug } = useTenant()

  useEffect(() => {
    setTenantSlug(tenantSlug)
  }, [tenantSlug, setTenantSlug])

  return <>{children}</>
}

export default function MenuWithExploreNav({ tenantSlug, children }: Props) {
  const { data: session, status } = useSession()
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    setIsAuthenticated(status === 'authenticated' && !!session?.user)
  }, [session, status])

  return (
    <TenantProvider>
      <MenuContent tenantSlug={tenantSlug}>
        <div className={isAuthenticated ? 'has-nav' : ''}>
          {children}
        </div>
      </MenuContent>
      {isAuthenticated && (
        <Suspense fallback={null}>
          <BottomNav />
        </Suspense>
      )}
    </TenantProvider>
  )
}
