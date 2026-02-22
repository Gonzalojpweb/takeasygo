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

const inputCls = 'w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-zinc-400'
const textareaCls = `${inputCls} resize-none`

export default function SettingsForm({ tenant, locations, tenantSlug }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [branding, setBranding] = useState(tenant.branding)

  // Profile state
  const [profileLoading, setProfileLoading] = useState(false)
  const [profile, setProfile] = useState({
    menuDescription: tenant.profile?.menuDescription ?? '',
    about: tenant.profile?.about ?? '',
    social: {
      instagram: tenant.profile?.social?.instagram ?? '',
      facebook: tenant.profile?.social?.facebook ?? '',
      twitter: tenant.profile?.social?.twitter ?? '',
    },
  })

  // Location hours state: { [locationId]: hours }
  const [hoursMap, setHoursMap] = useState<Record<string, string>>(
    Object.fromEntries(locations.map((l: any) => [l._id, l.hours ?? '']))
  )
  const [hoursLoading, setHoursLoading] = useState<string | null>(null)

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

  async function handleSaveProfile() {
    setProfileLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/settings/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
      if (!res.ok) throw new Error()
      toast.success('Perfil guardado')
      router.refresh()
    } catch {
      toast.error('Error al guardar perfil')
    } finally {
      setProfileLoading(false)
    }
  }

  async function handleSaveHours(locationId: string) {
    setHoursLoading(locationId)
    try {
      const res = await fetch(`/api/${tenantSlug}/locations/${locationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours: hoursMap[locationId] }),
      })
      if (!res.ok) throw new Error()
      toast.success('Horarios guardados')
    } catch {
      toast.error('Error al guardar horarios')
    } finally {
      setHoursLoading(null)
    }
  }

  return (
    <Tabs defaultValue="branding">
      <TabsList className="bg-zinc-800 border border-zinc-700 mb-6 flex-wrap h-auto gap-1">
        <TabsTrigger value="branding" className="data-[state=active]:bg-zinc-700 text-zinc-400 data-[state=active]:text-white">Branding</TabsTrigger>
        <TabsTrigger value="profile" className="data-[state=active]:bg-zinc-700 text-zinc-400 data-[state=active]:text-white">Perfil</TabsTrigger>
        <TabsTrigger value="locations" className="data-[state=active]:bg-zinc-700 text-zinc-400 data-[state=active]:text-white">Sedes</TabsTrigger>
        <TabsTrigger value="general" className="data-[state=active]:bg-zinc-700 text-zinc-400 data-[state=active]:text-white">General</TabsTrigger>
        <TabsTrigger value="mercadopago" className="data-[state=active]:bg-zinc-700 text-zinc-400 data-[state=active]:text-white">MercadoPago</TabsTrigger>
      </TabsList>

      {/* ── Branding ─────────────────────────────────────────────── */}
      <TabsContent value="branding">
        <Card className="bg-zinc-800 border-zinc-700">
          <CardHeader><CardTitle className="text-white text-base">Apariencia del menú</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Color primario', key: 'primaryColor' },
                { label: 'Color de fondo', key: 'backgroundColor' },
                { label: 'Color de texto', key: 'textColor' },
                { label: 'Color secundario', key: 'secondaryColor' },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="text-zinc-400 text-sm block mb-1.5">{label}</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={branding[key]}
                      onChange={e => setBranding((p: any) => ({ ...p, [key]: e.target.value }))}
                      className="w-10 h-10 rounded-lg border border-zinc-600 bg-transparent cursor-pointer" />
                    <span className="text-zinc-400 text-sm">{branding[key]}</span>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <label className="text-zinc-400 text-sm block mb-1.5">Layout del menú</label>
              <div className="flex gap-2">
                {['grid', 'list'].map(layout => (
                  <button key={layout} onClick={() => setBranding((p: any) => ({ ...p, menuLayout: layout }))}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${branding.menuLayout === layout ? 'bg-white text-zinc-900' : 'bg-zinc-700 text-zinc-400 hover:text-white'}`}>
                    {layout === 'grid' ? '⊞ Grid' : '☰ Lista'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-zinc-400 text-sm block mb-1.5">Bordes</label>
              <div className="flex gap-2">
                {[{ value: 'sharp', label: 'Recto' }, { value: 'rounded', label: 'Redondeado' }, { value: 'pill', label: 'Pill' }].map(opt => (
                  <button key={opt.value} onClick={() => setBranding((p: any) => ({ ...p, borderRadius: opt.value }))}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${branding.borderRadius === opt.value ? 'bg-white text-zinc-900' : 'bg-zinc-700 text-zinc-400 hover:text-white'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-zinc-400 text-sm block mb-1.5">URL del logo</label>
              <input value={branding.logoUrl}
                onChange={e => setBranding((p: any) => ({ ...p, logoUrl: e.target.value }))}
                placeholder="https://..." className={inputCls} />
            </div>

            <div className="rounded-xl p-4 border border-zinc-600">
              <p className="text-zinc-500 text-xs mb-3">Preview</p>
              <div className="rounded-xl p-4" style={{ backgroundColor: branding.backgroundColor }}>
                <p className="font-bold text-lg mb-3" style={{ color: branding.primaryColor }}>{tenant.name}</p>
                <div className={`grid gap-2 ${branding.menuLayout === 'grid' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {[1, 2].map(i => (
                    <div key={i} className="border p-3" style={{
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

      {/* ── Perfil ───────────────────────────────────────────────── */}
      <TabsContent value="profile">
        <Card className="bg-zinc-800 border-zinc-700">
          <CardHeader><CardTitle className="text-white text-base">Perfil del restaurante</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-zinc-400 text-sm block mb-1.5">Descripción del menú</label>
              <p className="text-zinc-600 text-xs mb-2">Aparece debajo de "Nuestra Carta" en el menú público.</p>
              <textarea rows={3} value={profile.menuDescription}
                onChange={e => setProfile(p => ({ ...p, menuDescription: e.target.value }))}
                placeholder="Luces cálidas, conversaciones íntimas..."
                className={textareaCls} />
            </div>

            <div>
              <label className="text-zinc-400 text-sm block mb-1.5">Nuestra Historia</label>
              <p className="text-zinc-600 text-xs mb-2">Aparece en el footer del menú público.</p>
              <textarea rows={4} value={profile.about}
                onChange={e => setProfile(p => ({ ...p, about: e.target.value }))}
                placeholder="En el corazón de Palermo, redefine la experiencia gastronómica..."
                className={textareaCls} />
            </div>

            <div className="border-t border-zinc-700 pt-4">
              <p className="text-zinc-400 text-sm font-medium mb-3">Redes sociales</p>
              <div className="space-y-3">
                {[
                  { key: 'instagram', label: 'Instagram', placeholder: '@mirestaurante' },
                  { key: 'facebook', label: 'Facebook', placeholder: 'facebook.com/mirestaurante' },
                  { key: 'twitter', label: 'Twitter / X', placeholder: '@mirestaurante' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label className="text-zinc-500 text-xs block mb-1">{label}</label>
                    <input value={profile.social[key as keyof typeof profile.social]}
                      onChange={e => setProfile(p => ({ ...p, social: { ...p.social, [key]: e.target.value } }))}
                      placeholder={placeholder} className={inputCls} />
                  </div>
                ))}
              </div>
            </div>

            <Button onClick={handleSaveProfile} disabled={profileLoading} className="w-full">
              {profileLoading ? 'Guardando...' : 'Guardar perfil'}
            </Button>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── Sedes ────────────────────────────────────────────────── */}
      <TabsContent value="locations">
        <div className="space-y-4">
          {locations.length === 0 ? (
            <Card className="bg-zinc-800 border-zinc-700">
              <CardContent className="py-8 text-center">
                <p className="text-zinc-500 text-sm">No hay sedes configuradas</p>
              </CardContent>
            </Card>
          ) : (
            locations.map((loc: any) => (
              <Card key={loc._id} className="bg-zinc-800 border-zinc-700">
                <CardHeader>
                  <CardTitle className="text-white text-base">{loc.name}</CardTitle>
                  <p className="text-zinc-500 text-xs">{loc.address} · Modos: {loc.settings?.orderModes?.join(', ')}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <label className="text-zinc-400 text-sm block mb-1.5">Horarios</label>
                    <p className="text-zinc-600 text-xs mb-2">Aparece en el footer del menú. Ej: Lun - Dom: 12:00 pm - 5:00 am</p>
                    <input
                      value={hoursMap[loc._id] ?? ''}
                      onChange={e => setHoursMap(p => ({ ...p, [loc._id]: e.target.value }))}
                      placeholder="Lun - Dom: 12:00 pm - 5:00 am"
                      className={inputCls}
                    />
                  </div>
                  <Button size="sm"
                    onClick={() => handleSaveHours(loc._id)}
                    disabled={hoursLoading === loc._id}>
                    {hoursLoading === loc._id ? 'Guardando...' : 'Guardar horarios'}
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </TabsContent>

      {/* ── General ──────────────────────────────────────────────── */}
      <TabsContent value="general">
        <Card className="bg-zinc-800 border-zinc-700">
          <CardHeader><CardTitle className="text-white text-base">Información general</CardTitle></CardHeader>
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

      {/* ── MercadoPago ──────────────────────────────────────────── */}
      <TabsContent value="mercadopago">
        <MercadoPagoSettings tenantSlug={tenantSlug} isConfigured={tenant.mercadopago?.isConfigured} />
      </TabsContent>
    </Tabs>
  )
}
