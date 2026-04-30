'use client'

import { useEffect, useState } from 'react'
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
    setIsAuthenticated(!!session?.user)
  }, [session])

  return (
    <TenantProvider>
      <MenuContent tenantSlug={tenantSlug}>
        {children}
      </MenuContent>
      {isAuthenticated && <BottomNav />}
    </TenantProvider>
  )
}
