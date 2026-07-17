import { cookies } from 'next/headers'
import PosReturnBar from '@/components/PosReturnBar'

export default async function PosReturnBarWrapper() {
  const cookieStore = await cookies()
  const posOrigin = cookieStore.get('pos_origin')

  if (!posOrigin) return null

  return <PosReturnBar />
}
