'use client'

import { useState, useEffect } from 'react'
import { Save, Palette, Layout, MousePointer2, Percent } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export default function SuperadminQrPromoStyles() {
  const [styles, setStyles] = useState({
    primaryColor: '#F74211',
    backgroundColor: '#FFF5F0',
    badgeColor: '#F74211',
    borderRadius: '24px',
    buttonColor: '#F74211',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchStyles()
  }, [])

  const fetchStyles = async () => {
    try {
      const res = await fetch('/api/superadmin/qr-promo-defaults')
      const data = await res.json()
      if (data.qrPromoStyles) {
        setStyles(data.qrPromoStyles)
      }
    } catch (e) {
      console.error('Error fetching styles:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/superadmin/qr-promo-defaults', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(styles),
      })
      if (!res.ok) throw new Error('Error al guardar')
      toast.success('Estilos globales actualizados')
    } catch (e) {
      toast.error('Error al guardar los cambios')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null

  return (
    <div className="bg-card border-2 border-border/60 rounded-2xl overflow-hidden">
      <div className="p-6 border-b border-border/60 bg-muted/30">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Palette size={20} className="text-primary" />
          Estilos Globales: Marketing QR
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Define la estética base que verán todos los clientes al escanear un QR.
        </p>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Colores */}
          <div className="space-y-4">
            <div>
              <label className="text-sm font-bold block mb-2">Color Primario (Acentos)</label>
              <div className="flex gap-2">
                <input 
                  type="color" 
                  value={styles.primaryColor}
                  onChange={e => setStyles(s => ({ ...s, primaryColor: e.target.value }))}
                  className="w-12 h-10 rounded-lg cursor-pointer bg-transparent"
                />
                <input 
                  type="text" 
                  value={styles.primaryColor}
                  onChange={e => setStyles(s => ({ ...s, primaryColor: e.target.value }))}
                  className="flex-1 bg-muted/50 border-none rounded-lg px-3 text-sm font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-bold block mb-2">Color Botón CTA</label>
              <div className="flex gap-2">
                <input 
                  type="color" 
                  value={styles.buttonColor}
                  onChange={e => setStyles(s => ({ ...s, buttonColor: e.target.value }))}
                  className="w-12 h-10 rounded-lg cursor-pointer bg-transparent"
                />
                <input 
                  type="text" 
                  value={styles.buttonColor}
                  onChange={e => setStyles(s => ({ ...s, buttonColor: e.target.value }))}
                  className="flex-1 bg-muted/50 border-none rounded-lg px-3 text-sm font-mono"
                />
              </div>
            </div>
          </div>

          {/* Otros ajustes */}
          <div className="space-y-4">
            <div>
              <label className="text-sm font-bold block mb-2">Border Radius (Esquinas)</label>
              <select 
                value={styles.borderRadius}
                onChange={e => setStyles(s => ({ ...s, borderRadius: e.target.value }))}
                className="w-full bg-muted/50 border-none rounded-lg px-3 py-2 text-sm"
              >
                <option value="0px">Sharp (0px)</option>
                <option value="8px">Soft (8px)</option>
                <option value="16px">Rounded (16px)</option>
                <option value="24px">Extra Rounded (24px)</option>
                <option value="999px">Pill (999px)</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-bold block mb-2">Fondo del Card (Gradiente base)</label>
              <div className="flex gap-2">
                <input 
                  type="color" 
                  value={styles.backgroundColor}
                  onChange={e => setStyles(s => ({ ...s, backgroundColor: e.target.value }))}
                  className="w-12 h-10 rounded-lg cursor-pointer bg-transparent"
                />
                <input 
                  type="text" 
                  value={styles.backgroundColor}
                  onChange={e => setStyles(s => ({ ...s, backgroundColor: e.target.value }))}
                  className="flex-1 bg-muted/50 border-none rounded-lg px-3 text-sm font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="pt-6 border-t border-border/60">
          <label className="text-xs font-black uppercase tracking-widest text-muted-foreground block mb-4">Vista Previa Real</label>
          <div className="flex justify-center bg-muted/20 p-8 rounded-xl border border-dashed border-border/60">
            <div 
              className="w-full max-w-xs shadow-xl overflow-hidden transition-all duration-300"
              style={{ 
                background: `linear-gradient(135deg, ${styles.backgroundColor} 0%, #FFFFFF 50%, ${styles.backgroundColor} 100%)`,
                borderRadius: styles.borderRadius,
              }}
            >
              <div className="h-1.5 w-full" style={{ backgroundColor: styles.primaryColor }} />
              <div className="p-5 text-center flex flex-col items-center">
                <div 
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full mb-3 text-[10px] font-bold"
                  style={{ backgroundColor: styles.badgeColor, color: 'white' }}
                >
                  <Percent size={10} /> 15% OFF
                </div>
                <h4 className="font-bold text-zinc-900 leading-tight">Título de Ejemplo</h4>
                <p className="text-xs text-zinc-500 mt-2 mb-4">Este es un subtítulo para ver el contraste.</p>
                <div 
                  className="w-full py-2.5 rounded-lg text-white text-xs font-bold flex items-center justify-center gap-2"
                  style={{ backgroundColor: styles.buttonColor }}
                >
                  Botón CTA
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button 
            onClick={handleSave} 
            disabled={saving}
            className="gap-2"
          >
            {saving ? 'Guardando...' : <><Save size={16} /> Guardar Configuración Global</>}
          </Button>
        </div>
      </div>
    </div>
  )
}
