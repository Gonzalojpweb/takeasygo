import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Store, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { signOut } from '@/lib/auth'

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session || session.user.role !== 'seller') redirect('/login')

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Store className="text-primary" size={20} />
            <span className="font-bold text-foreground">TakeasyGo</span>
            <span className="text-xs font-medium text-muted-foreground bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full">
              Setter
            </span>
          </div>
          <form action={async () => {
            'use server'
            await signOut({ redirectTo: '/login' })
          }}>
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
              <LogOut size={16} className="mr-1" />
              Salir
            </Button>
          </form>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  )
}
