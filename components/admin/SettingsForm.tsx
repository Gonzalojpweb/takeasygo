'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import MercadoPagoSettings from './MercadoPagoSettings'


interface Props {
  tenant: any
  locations: any[]
  tenantSlug: string
}

export default function SettingsForm({ tenant, locations, tenantSlug }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [branding, setBranding] = useState(tenant.branding)

  async function handleSaveBranding() {
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/settings/branding`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branding }),
      })
      if (!res.ok) throw new Error()
      toast.success('Branding guardado')
      router.refresh()
    } catch {
      toast.error('Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Tabs defaultValue="branding">
      <TabsList className="bg-zinc-800 border border-zinc-700 mb-6">
        <TabsTrigger value="branding" className="data-[state=active]:bg-zinc-700 text-zinc-400 data-[state=active]:text-white">
          Branding
        </TabsTrigger>
        <TabsTrigger value="locations" className="data-[state=active]:bg-zinc-700 text-zinc-400 data-[state=active]:text-white">
          Sedes
        </TabsTrigger>
        <TabsTrigger value="general" className="data-[state=active]:bg-zinc-700 text-zinc-400 data-[state=active]:text-white">
          General
        </TabsTrigger>
        <TabsTrigger value="mercadopago" className="data-[state=active]:bg-zinc-700 text-zinc-400 data-[state=active]:text-white">
  MercadoPago
</TabsTrigger>
      </TabsList>

      {/* Branding */}
      <TabsContent value="branding">
        <Card className="bg-zinc-800 border-zinc-700">
          <CardHeader>
            <CardTitle className="text-white text-base">Apariencia del menú</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-zinc-400 text-sm block mb-1.5">Color primario</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={branding.primaryColor}
                    onChange={e => setBranding((p: any) => ({ ...p, primaryColor: e.target.value }))}
                    className="w-10 h-10 rounded-lg border border-zinc-600 bg-transparent cursor-pointer" />
                  <span className="text-zinc-400 text-sm">{branding.primaryColor}</span>
                </div>
              </div>
              <div>
                <label className="text-zinc-400 text-sm block mb-1.5">Color de fondo</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={branding.backgroundColor}
                    onChange={e => setBranding((p: any) => ({ ...p, backgroundColor: e.target.value }))}
                    className="w-10 h-10 rounded-lg border border-zinc-600 bg-transparent cursor-pointer" />
                  <span className="text-zinc-400 text-sm">{branding.backgroundColor}</span>
                </div>
              </div>
              <div>
                <label className="text-zinc-400 text-sm block mb-1.5">Color de texto</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={branding.textColor}
                    onChange={e => setBranding((p: any) => ({ ...p, textColor: e.target.value }))}
                    className="w-10 h-10 rounded-lg border border-zinc-600 bg-transparent cursor-pointer" />
                  <span className="text-zinc-400 text-sm">{branding.textColor}</span>
                </div>
              </div>
              <div>
                <label className="text-zinc-400 text-sm block mb-1.5">Color secundario</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={branding.secondaryColor}
                    onChange={e => setBranding((p: any) => ({ ...p, secondaryColor: e.target.value }))}
                    className="w-10 h-10 rounded-lg border border-zinc-600 bg-transparent cursor-pointer" />
                  <span className="text-zinc-400 text-sm">{branding.secondaryColor}</span>
                </div>
              </div>
            </div>

            <div>
              <label className="text-zinc-400 text-sm block mb-1.5">Layout del menú</label>
              <div className="flex gap-2">
                {['grid', 'list'].map(layout => (
                  <button key={layout}
                    onClick={() => setBranding((p: any) => ({ ...p, menuLayout: layout }))}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      branding.menuLayout === layout
                        ? 'bg-white text-zinc-900'
                        : 'bg-zinc-700 text-zinc-400 hover:text-white'
                    }`}>
                    {layout === 'grid' ? '⊞ Grid' : '☰ Lista'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-zinc-400 text-sm block mb-1.5">Bordes</label>
              <div className="flex gap-2">
                {[
                  { value: 'sharp', label: 'Recto' },
                  { value: 'rounded', label: 'Redondeado' },
                  { value: 'pill', label: 'Pill' },
                ].map(opt => (
                  <button key={opt.value}
                    onClick={() => setBranding((p: any) => ({ ...p, borderRadius: opt.value }))}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      branding.borderRadius === opt.value
                        ? 'bg-white text-zinc-900'
                        : 'bg-zinc-700 text-zinc-400 hover:text-white'
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-zinc-400 text-sm block mb-1.5">URL del logo</label>
              <input
                value={branding.logoUrl}
                onChange={e => setBranding((p: any) => ({ ...p, logoUrl: e.target.value }))}
                placeholder="https://..."
                className="w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-zinc-400"
              />
            </div>

            {/* Preview */}
            <div className="rounded-xl p-4 border border-zinc-600">
              <p className="text-zinc-500 text-xs mb-3">Preview</p>
              <div className="rounded-xl p-4" style={{ backgroundColor: branding.backgroundColor }}>
                <p className="font-bold text-lg mb-3" style={{ color: branding.primaryColor }}>
                  {tenant.name}
                </p>
                <div className={`grid gap-2 ${branding.menuLayout === 'grid' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {[1, 2].map(i => (
                    <div key={i} className="border p-3"
                      style={{
                        borderColor: branding.primaryColor + '30',
                        borderRadius: branding.borderRadius === 'sharp' ? '0' : branding.borderRadius === 'pill' ? '16px' : '8px',
                        color: branding.textColor,
                      }}>
                      <p className="text-sm font-medium">Plato ejemplo {i}</p>
                      <p className="text-xs opacity-50">Descripción del plato</p>
                      <p className="text-sm font-bold mt-1" style={{ color: branding.primaryColor }}>$1.500</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <Button onClick={handleSaveBranding} disabled={loading} className="w-full">
              {loading ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Sedes */}
      <TabsContent value="locations">
        <Card className="bg-zinc-800 border-zinc-700">
          <CardHeader>
            <CardTitle className="text-white text-base">Sedes</CardTitle>
          </CardHeader>
          <CardContent>
            {locations.length === 0 ? (
              <p className="text-zinc-500 text-sm">No hay sedes configuradas</p>
            ) : (
              <div className="space-y-3">
                {locations.map((loc: any) => (
                  <div key={loc._id} className="flex items-center justify-between p-3 rounded-lg bg-zinc-700/50">
                    <div>
                      <p className="text-white text-sm font-medium">{loc.name}</p>
                      <p className="text-zinc-400 text-xs">{loc.address}</p>
                      <p className="text-zinc-500 text-xs mt-1">
                        Modos: {loc.settings?.orderModes?.join(', ')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-zinc-500 text-xs font-mono">{loc.slug}</p>
                      <p className="text-xs mt-1" style={{ color: loc.isActive ? '#4ade80' : '#f87171' }}>
                        {loc.isActive ? 'Activa' : 'Inactiva'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* General */}
      <TabsContent value="general">
        <Card className="bg-zinc-800 border-zinc-700">
          <CardHeader>
            <CardTitle className="text-white text-base">Información general</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-zinc-400 text-sm block mb-1.5">Nombre del restaurante</label>
              <p className="text-white text-sm bg-zinc-700 rounded-xl px-4 py-2.5">{tenant.name}</p>
            </div>
            <div>
              <label className="text-zinc-400 text-sm block mb-1.5">Slug (URL)</label>
              <p className="text-white text-sm bg-zinc-700 rounded-xl px-4 py-2.5 font-mono">{tenant.slug}</p>
            </div>
            <div>
              <label className="text-zinc-400 text-sm block mb-1.5">Plan</label>
              <p className="text-white text-sm bg-zinc-700 rounded-xl px-4 py-2.5 capitalize">{tenant.plan}</p>
            </div>
            <p className="text-zinc-600 text-xs">Para modificar estos datos contactá al administrador de la plataforma.</p>
          </CardContent>
        </Card>
      </TabsContent>
      {/* MercadoPago */}
<TabsContent value="mercadopago">
  <MercadoPagoSettings tenantSlug={tenantSlug} isConfigured={tenant.mercadopago?.isConfigured} />
</TabsContent>
    </Tabs>
  )
}