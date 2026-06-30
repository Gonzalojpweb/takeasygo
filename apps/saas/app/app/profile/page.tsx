export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import ProfileContent from './ProfileContent'

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfileContent />
    </Suspense>
  )
}
