import { redirect } from 'next/navigation'

export default function AppConsumersPage() {
  redirect('/superadmin/consumers?tab=app')
}
