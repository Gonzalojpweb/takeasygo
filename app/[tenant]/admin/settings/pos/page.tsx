'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { 
  Settings, 
  Database, 
  Key, 
  RefreshCw, 
  Save, 
  CheckCircle2, 
  AlertCircle,
  Copy,
  Trash2,
  Plus
} from 'lucide-react'
import { toast } from 'sonner'

export default function POSSettingsPage() {
  const { tenant } = useParams()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  
  // State for Section 1: Config
  const [config, setConfig] = useState({
    provider: 'none',
    enabled: false,
    clientId: '',
    clientSecret: '',
    webhookSecret: '',
    apiEndpoint: '',
    hasClientId: false,
    hasClientSecret: false,
    hasWebhookSecret: false
  })

  // State for Section 2: Mapping
  const [catalog, setCatalog] = useState<any[]>([])
  const [menuItems, setMenuItems] = useState<any[]>([])
  const [mapping, setMapping] = useState<any[]>([])
  const [syncingCatalog, setSyncingCatalog] = useState(false)

  // State for Section 3: API Keys
  const [apiKeys, setApiKeys] = useState<any[]>([])
  const [newKeyLabel, setNewKeyLabel] = useState('')
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
  }, [tenant])

  async function fetchData() {
    setLoading(true)
    try {
      const [confRes, mapRes, menuRes, keysRes] = await Promise.all([
        fetch(`/api/${tenant}/settings/pos`),
        fetch(`/api/${tenant}/settings/pos/mapping`),
        fetch(`/api/${tenant}/menu`),
        fetch(`/api/${tenant}/settings/api-keys`)
      ])

      const conf = await confRes.json()
      const maps = await mapRes.json()
      const menu = await menuRes.json()
      const keys = await keysRes.json()

      setConfig(prev => ({ 
        ...prev, 
        ...conf, 
        clientId: '', 
        clientSecret: '', 
        webhookSecret: '' 
      }))
      setMapping(maps.mapping || [])
      
      // Flatten menu items for mapping
      const items: any[] = []
      if (menu.menu && menu.menu.categories) {
        menu.menu.categories.forEach((cat: any) => {
          if (cat.items) {
            cat.items.forEach((item: any) => {
              items.push({ ...item, categoryName: cat.name })
            })
          }
        })
      }
      setMenuItems(items)
      setApiKeys(keys.keys || [])

    } catch (error) {
      toast.error('Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveConfig() {
    setSaving(true)
    try {
      const res = await fetch(`/api/${tenant}/settings/pos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })
      if (!res.ok) throw new Error()
      toast.success('Configuración guardada')
      fetchData()
    } catch (error) {
      toast.error('Error al guardar configuración')
    } finally {
      setSaving(false)
    }
  }

  async function handleTestConnection() {
    setTesting(true)
    try {
      const res = await fetch(`/api/${tenant}/settings/pos/test`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        toast.success(data.message)
      } else {
        toast.error(data.error || 'Error de conexión')
      }
    } catch (error) {
      toast.error('Error al probar conexión')
    } finally {
      setTesting(false)
    }
  }

  async function handleSyncCatalog() {
    setSyncingCatalog(true)
    try {
      const res = await fetch(`/api/${tenant}/settings/pos/catalog`)
      const data = await res.json()
      if (res.ok) {
        setCatalog(data.catalog)
        toast.success(`${data.catalog.length} productos sincronizados desde el POS`)
      } else {
        toast.error(data.error || 'Error al sincronizar catálogo')
      }
    } catch (error) {
      toast.error('Error de red al sincronizar')
    } finally {
      setSyncingCatalog(false)
    }
  }

  async function handleSaveMapping() {
    setSaving(true)
    try {
      const res = await fetch(`/api/${tenant}/settings/pos/mapping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapping })
      })
      if (res.ok) {
        toast.success('Mapeo guardado')
      } else {
        throw new Error()
      }
    } catch (error) {
      toast.error('Error al guardar mapeo')
    } finally {
      setSaving(false)
    }
  }

  async function handleGenerateKey() {
    if (!newKeyLabel) return toast.error('Ingresa un nombre para la llave')
    try {
      const res = await fetch(`/api/${tenant}/settings/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newKeyLabel })
      })
      const data = await res.json()
      if (res.ok) {
        setGeneratedKey(data.rawKey)
        setNewKeyLabel('')
        fetchData()
      }
    } catch (error) {
      toast.error('Error al generar llave')
    }
  }

  async function handleRevokeKey(preview: string) {
    if (!confirm('¿Estás seguro de revocar esta llave? Los sistemas externos que la usen dejarán de funcionar.')) return
    try {
      const res = await fetch(`/api/${tenant}/settings/api-keys`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyHashPreview: preview.split('...')[1] })
      })
      if (res.ok) {
        toast.success('Llave revocada')
        fetchData()
      }
    } catch (error) {
      toast.error('Error al revocar llave')
    }
  }

  if (loading) return <div className="p-8 text-center">Cargando configuración...</div>

  return (
    <div className="max-w-6xl mx-auto p-4 lg:p-8 space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="w-6 h-6 text-primary" />
            Integración POS
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Conecta TakeasyGO con tu sistema de gestión FUDO o BISTROSOFT
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* COLUMNA 1: CONFIGURACIÓN */}
        <div className="lg:col-span-1 space-y-6">
          <section className="bg-card border rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b bg-muted/30 font-semibold flex items-center gap-2">
              <Database className="w-4 h-4" />
              Proveedor y Credenciales
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Sistema POS</label>
                <select 
                  className="w-full mt-1 p-2 rounded-lg border bg-background"
                  value={config.provider}
                  onChange={e => setConfig({...config, provider: e.target.value})}
                >
                  <option value="none">Seleccionar...</option>
                  <option value="fudo">FUDO</option>
                  <option value="bistrosoft">BISTROSOFT (Próximamente)</option>
                </select>
              </div>

              {config.provider !== 'none' && (
                <>
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-primary/5">
                    <span className="text-sm font-medium">Activar integración</span>
                    <input 
                      type="checkbox" 
                      className="w-5 h-5 accent-primary"
                      checked={config.enabled}
                      onChange={e => setConfig({...config, enabled: e.target.checked})}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex justify-between">
                      Client ID
                      {config.hasClientId && <span className="text-[10px] text-emerald-600">Configurado</span>}
                    </label>
                    <input 
                      type="text" 
                      className="w-full mt-1 p-2 rounded-lg border bg-background text-sm"
                      placeholder={config.hasClientId ? '••••••••••••••••' : 'Ingresa tu Client ID'}
                      value={config.clientId}
                      onChange={e => setConfig({...config, clientId: e.target.value})}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex justify-between">
                      Client Secret
                      {config.hasClientSecret && <span className="text-[10px] text-emerald-600">Configurado</span>}
                    </label>
                    <input 
                      type="password" 
                      className="w-full mt-1 p-2 rounded-lg border bg-background text-sm"
                      placeholder={config.hasClientSecret ? '••••••••••••••••' : 'Ingresa tu Client Secret'}
                      value={config.clientSecret}
                      onChange={e => setConfig({...config, clientSecret: e.target.value})}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex justify-between">
                      Webhook Secret
                      {config.hasWebhookSecret && <span className="text-[10px] text-emerald-600">Configurado</span>}
                    </label>
                    <input 
                      type="password" 
                      className="w-full mt-1 p-2 rounded-lg border bg-background text-sm"
                      placeholder={config.hasWebhookSecret ? '••••••••••••••••' : 'Secreto de firma del POS'}
                      value={config.webhookSecret}
                      onChange={e => setConfig({...config, webhookSecret: e.target.value})}
                    />
                  </div>

                  <div className="pt-4 flex flex-col gap-2">
                    <button 
                      onClick={handleSaveConfig}
                      disabled={saving}
                      className="w-full py-2 rounded-lg bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Guardar Configuración
                    </button>
                    <button 
                      onClick={handleTestConnection}
                      disabled={testing || !config.hasClientId}
                      className="w-full py-2 rounded-lg border border-primary text-primary font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Probar Conexión
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="bg-card border rounded-xl overflow-hidden shadow-sm p-6 space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Key className="w-4 h-4" />
              API Keys Externas
            </h3>
            <p className="text-xs text-muted-foreground">
              Usa estas llaves para integrar sistemas externos o el Panel de Cocina PWA.
            </p>

            <div className="space-y-3">
              {apiKeys.map((k, idx) => (
                <div key={idx} className="p-3 border rounded-lg flex items-center justify-between text-sm group">
                  <div>
                    <div className="font-medium">{k.label}</div>
                    <code className="text-[10px] text-muted-foreground">{k.keyPreview}</code>
                  </div>
                  <button 
                    onClick={() => handleRevokeKey(k.keyPreview)}
                    className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}

              <div className="pt-2">
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Nombre (ej: App Cocina)"
                    className="flex-1 p-2 rounded-lg border text-sm"
                    value={newKeyLabel}
                    onChange={e => setNewKeyLabel(e.target.value)}
                  />
                  <button 
                    onClick={handleGenerateKey}
                    className="p-2 bg-muted hover:bg-muted/80 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {generatedKey && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg space-y-2 animate-in zoom-in-95 duration-300">
                <div className="text-[10px] font-bold text-amber-600 uppercase flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Llave generada - Cópiala ahora
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-1 bg-background border rounded text-[10px] break-all">{generatedKey}</code>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(generatedKey)
                      toast.success('Copiado')
                    }}
                    className="p-1 hover:bg-background rounded transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[9px] text-muted-foreground">Esta llave no se volverá a mostrar por seguridad.</p>
                <button 
                  onClick={() => setGeneratedKey(null)}
                  className="w-full py-1 text-[10px] font-bold underline"
                >
                  Entendido
                </button>
              </div>
            )}
          </section>
        </div>

        {/* COLUMNA 2-3: MAPEO DE PRODUCTOS */}
        <div className="lg:col-span-2">
          <section className="bg-card border rounded-xl overflow-hidden shadow-sm h-full flex flex-col">
            <div className="p-4 border-b bg-muted/30 font-semibold flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Mapeo de Productos
              </div>
              <button 
                onClick={handleSyncCatalog}
                disabled={syncingCatalog || config.provider === 'none'}
                className="text-xs py-1 px-3 rounded-lg bg-background border hover:bg-muted flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                {syncingCatalog ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Sincronizar Catálogo POS
              </button>
            </div>
            
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="p-4 text-left font-semibold text-xs uppercase tracking-wider">Producto TakeasyGO</th>
                    <th className="p-4 text-left font-semibold text-xs uppercase tracking-wider">Categoría</th>
                    <th className="p-4 text-left font-semibold text-xs uppercase tracking-wider">Vincular con Producto en POS ({config.provider.toUpperCase()})</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {menuItems.map((item) => {
                    const currentMap = mapping.find(m => m.takeasyGoItemId === item._id)
                    return (
                      <tr key={item._id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-4 flex items-center gap-3">
                          {item.image && (
                            <img src={item.image} className="w-10 h-10 rounded-lg object-cover bg-muted" alt="" />
                          )}
                          <span className="font-medium">{item.name}</span>
                        </td>
                        <td className="p-4">
                          <span className="text-[10px] bg-muted px-2 py-1 rounded-full">{item.categoryName}</span>
                        </td>
                        <td className="p-4">
                          <select 
                            className={`w-full p-2 rounded-lg border bg-background text-xs ${!currentMap ? 'border-amber-500/50 bg-amber-500/5' : ''}`}
                            value={currentMap?.posItemId || ''}
                            onChange={(e) => {
                              const posItemId = e.target.value
                              const posItemName = catalog.find(c => c.posItemId === posItemId)?.name || ''
                              
                              const newMapping = mapping.filter(m => m.takeasyGoItemId !== item._id)
                              if (posItemId) {
                                newMapping.push({
                                  takeasyGoItemId: item._id,
                                  posItemId,
                                  posItemName
                                })
                              }
                              setMapping(newMapping)
                            }}
                          >
                            <option value="">No vinculado (Inyectar por nombre)</option>
                            {catalog.map((c) => (
                              <option key={c.posItemId} value={c.posItemId}>
                                {c.name} - ${c.price}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                  {menuItems.length === 0 && (
                    <tr>
                      <td colSpan={3} className="p-12 text-center text-muted-foreground italic">
                        Carga productos en tu menú antes de realizar el mapeo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-6 border-t bg-muted/30 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <AlertCircle className="w-4 h-4" />
                Los productos no vinculados se inyectarán usando su nombre de TakeasyGO.
              </div>
              <button 
                onClick={handleSaveMapping}
                disabled={saving || menuItems.length === 0}
                className="py-2 px-8 rounded-lg bg-primary text-primary-foreground font-semibold flex items-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar Mapeo
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
