'use client'

import { useState, useEffect } from 'react'
import { MessageCircle, Building2, Loader2, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import WhatsappRewardAdvanceDialog from '@/components/WhatsappRewardAdvanceDialog'

interface EligibleTenant {
  tenantId: string
  name: string
  slug: string
  plan: string
  clubName: string
  sosLimit: number
}

export default function SuperadminWhatsappRewardAdvancePage() {
  const [tenants, setTenants] = useState<EligibleTenant[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTenant, setSelectedTenant] = useState<EligibleTenant | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    fetchTenants()
  }, [])

  async function fetchTenants() {
    try {
      const res = await fetch('/api/superadmin/club/whatsapp-reward-advance?action=list-tenants')
      const data = await res.json()
      if (res.ok) {
        setTenants(data.tenants || [])
      } else {
        toast.error(data.error)
      }
    } catch {
      toast.error('Error al cargar tenants elegibles')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenDialog = (tenant: EligibleTenant) => {
    setSelectedTenant(tenant)
    setDialogOpen(true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageCircle className="text-emerald-500" />
          WhatsApp Reward Advance
        </h1>
        <p className="text-zinc-500 text-sm mt-1">
          Enviá mensajes de WhatsApp a miembros elegibles para promover el canje de Reward Advance.
        </p>
      </div>

      {tenants.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-200 p-12 text-center">
          <Building2 size={40} className="mx-auto text-zinc-300 mb-4" />
          <p className="text-zinc-500 text-sm">
            No hay tenants elegibles. Se requiere plan Crecimiento o Premium con push de TGO activado.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
          <div className="p-4 border-b border-zinc-100">
            <p className="text-sm text-zinc-500">
              Seleccioná un tenant para ver miembros elegibles y enviar mensajes.
            </p>
          </div>

          <table className="w-full text-sm text-left">
            <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase border-b border-zinc-200">
              <tr>
                <th className="px-6 py-4 font-medium">Tenant</th>
                <th className="px-6 py-4 font-medium">Plan</th>
                <th className="px-6 py-4 font-medium">Club</th>
                <th className="px-6 py-4 font-medium">SOS Limit</th>
                <th className="px-6 py-4 font-medium text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {tenants.map((t) => (
                <tr key={t.tenantId} className="hover:bg-zinc-50/50 transition">
                  <td className="px-6 py-4">
                    <div>
                      <span className="font-medium text-zinc-900">{t.name}</span>
                      <p className="text-zinc-400 text-xs">{t.slug}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                      t.plan === 'full'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {t.plan === 'full' ? 'Premium' : 'Crecimiento'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-zinc-600 text-xs">{t.clubName}</td>
                  <td className="px-6 py-4 font-mono text-sm">{t.sosLimit}</td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleOpenDialog(t)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition"
                    >
                      <MessageCircle size={14} />
                      Enviar WhatsApp
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedTenant && (
        <WhatsappRewardAdvanceDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          tenantSlug={selectedTenant.slug}
          apiPath="superadmin"
          defaultMessageType="superadmin"
        />
      )}
    </div>
  )
}
