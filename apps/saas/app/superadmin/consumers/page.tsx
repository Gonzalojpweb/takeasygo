'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ShoppingCart, Smartphone, Shield, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import CompradoresTab from '@/components/superadmin/consumers/CompradoresTab'
import AppConsumersTab from '@/components/superadmin/consumers/AppConsumersTab'
import StaffTab from '@/components/superadmin/consumers/StaffTab'

const TABS = [
  { id: 'compradores', label: 'Compradores', icon: ShoppingCart, description: 'Compradores de tenants (auto-creados por pedidos)' },
  { id: 'app', label: 'App Registrados', icon: Smartphone, description: 'Usuarios que se registraron en la app TakeasyGO' },
  { id: 'staff', label: 'Staff / Interno', icon: Shield, description: 'Admin, manager, staff, caja, vendedor, superadmin' },
]

export default function SuperadminConsumersPage() {
  const searchParams = useSearchParams()
  const initialTab = TABS.find(t => t.id === searchParams.get('tab')) ? searchParams.get('tab')! : 'compradores'
  const [activeTab, setActiveTab] = useState(initialTab)

  return (
    <div className="p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Users size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-foreground text-3xl font-bold tracking-tight">Consumidores</h1>
            <p className="text-muted-foreground text-sm font-medium">
              Gestión de compradores, usuarios de app y staff
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-col sm:flex-row gap-2 border-b-2 border-border/40 pb-0">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-5 py-3 rounded-t-xl text-sm font-bold transition-all border-2 border-b-0",
                isActive
                  ? "bg-card border-border/60 text-foreground shadow-sm"
                  : "bg-transparent border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/20"
              )}
            >
              <Icon size={16} className={isActive ? "text-primary" : ""} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab description */}
      <p className="text-xs text-muted-foreground -mt-2">
        {TABS.find(t => t.id === activeTab)?.description}
      </p>

      {/* Tab content */}
      <div>
        {activeTab === 'compradores' && <CompradoresTab />}
        {activeTab === 'app' && <AppConsumersTab />}
        {activeTab === 'staff' && <StaffTab />}
      </div>
    </div>
  )
}
