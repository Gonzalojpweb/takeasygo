'use client'

import { useState, useRef } from 'react'
import { X, Upload, FileJson, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface Props {
  tenantSlug: string
  locationId: string
  locationName: string
  onSuccess: () => void
  onClose: () => void
}

interface ParsedCategory {
  name: string
  items: { name: string; price: number }[]
}

const EXAMPLE_JSON = `{
  "categories": [
    {
      "name": "Entradas",
      "items": [
        {
          "name": "Empanadas de carne",
          "description": "Masa casera, jugosas",
          "price": 1500,
          "tags": ["Popular"],
          "isFeatured": true
        },
        {
          "name": "Tabla de fiambres",
          "description": "",
          "price": 3200,
          "tags": [],
          "isFeatured": false
        }
      ]
    },
    {
      "name": "Principales",
      "items": [
        {
          "name": "Asado mixto",
          "description": "Para 2 personas",
          "price": 8500,
          "tags": ["Para compartir"],
          "isFeatured": true
        }
      ]
    }
  ]
}`

export default function ImportMenuModal({ tenantSlug, locationId, locationName, onSuccess, onClose }: Props) {
  const [raw, setRaw] = useState('')
  const [mode, setMode] = useState<'replace' | 'append'>('replace')
  const [preview, setPreview] = useState<ParsedCategory[] | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showExample, setShowExample] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function parseRaw(text: string) {
    setParseError(null)
    setPreview(null)
    if (!text.trim()) return

    try {
      const parsed = JSON.parse(text)
      const categories = parsed.categories ?? parsed

      if (!Array.isArray(categories)) {
        setParseError('El JSON debe tener una propiedad "categories" con un array.')
        return
      }

      const result: ParsedCategory[] = []
      for (const cat of categories) {
        if (!cat.name || typeof cat.name !== 'string') {
          setParseError(`Una categoría no tiene "name" válido.`)
          return
        }
        if (!Array.isArray(cat.items)) {
          setParseError(`La categoría "${cat.name}" no tiene "items".`)
          return
        }
        for (const item of cat.items) {
          if (!item.name || typeof item.name !== 'string') {
            setParseError(`Un ítem en "${cat.name}" no tiene "name" válido.`)
            return
          }
          if (typeof item.price !== 'number' || item.price < 0) {
            setParseError(`El ítem "${item.name}" en "${cat.name}" necesita un "price" numérico.`)
            return
          }
        }
        result.push({ name: cat.name, items: cat.items.map((i: any) => ({ name: i.name, price: i.price })) })
      }

      setPreview(result)
    } catch {
      setParseError('JSON inválido. Verificá que la sintaxis sea correcta.')
    }
  }

  function handleTextChange(value: string) {
    setRaw(value)
    parseRaw(value)
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      setRaw(text)
      parseRaw(text)
    }
    reader.readAsText(file)
  }

  function useExample() {
    setRaw(EXAMPLE_JSON)
    parseRaw(EXAMPLE_JSON)
    setShowExample(false)
  }

  async function handleImport() {
    if (!preview) return
    setLoading(true)
    try {
      const parsed = JSON.parse(raw)
      const categories = parsed.categories ?? parsed

      const res = await fetch(`/api/${tenantSlug}/menu/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId, categories, mode }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al importar')

      toast.success(
        `Menú importado: ${data.imported.categories} categorías, ${data.imported.items} ítems`
      )
      onSuccess()
      onClose()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const totalItems = preview?.reduce((sum, cat) => sum + cat.items.length, 0) ?? 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div>
            <h2 className="text-white font-bold text-base">Importar menú desde JSON</h2>
            <p className="text-zinc-500 text-xs mt-0.5">{locationName}</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Mode selector */}
          <div>
            <p className="text-zinc-400 text-xs font-medium mb-2 uppercase tracking-wider">Modo de importación</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'replace', label: 'Reemplazar todo', desc: 'Borra el menú actual y carga el nuevo' },
                { value: 'append', label: 'Agregar categorías', desc: 'Añade al final sin borrar lo existente' },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setMode(opt.value)}
                  className={`text-left p-3 rounded-xl border transition-colors ${
                    mode === opt.value
                      ? 'border-white bg-white/10 text-white'
                      : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                  }`}>
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs opacity-60 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* File upload + example */}
          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFileUpload}
            />
            <Button
              size="sm"
              variant="outline"
              className="border-zinc-700 text-zinc-400 hover:text-white"
              onClick={() => fileRef.current?.click()}>
              <Upload size={13} className="mr-1.5" /> Subir archivo .json
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-zinc-500 hover:text-white"
              onClick={() => setShowExample(p => !p)}>
              <FileJson size={13} className="mr-1.5" />
              {showExample ? 'Ocultar ejemplo' : 'Ver formato de ejemplo'}
            </Button>
          </div>

          {/* Example */}
          {showExample && (
            <div className="bg-zinc-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-zinc-400 text-xs font-medium">Formato esperado</p>
                <button
                  onClick={useExample}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                  Usar este ejemplo
                </button>
              </div>
              <pre className="text-zinc-300 text-xs overflow-x-auto">{EXAMPLE_JSON}</pre>
            </div>
          )}

          {/* Textarea */}
          <div>
            <label className="text-zinc-400 text-xs font-medium block mb-2">Pegá tu JSON aquí</label>
            <textarea
              value={raw}
              onChange={e => handleTextChange(e.target.value)}
              rows={10}
              placeholder={`{\n  "categories": [\n    {\n      "name": "Entradas",\n      "items": [...]\n    }\n  ]\n}`}
              className="w-full bg-zinc-800 border border-zinc-700 text-white text-xs font-mono rounded-xl px-4 py-3 focus:outline-none focus:border-zinc-500 resize-none placeholder-zinc-600"
            />
          </div>

          {/* Parse error */}
          {parseError && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
              <AlertCircle size={15} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-xs">{parseError}</p>
            </div>
          )}

          {/* Preview */}
          {preview && !parseError && (
            <div className="bg-zinc-800/60 border border-zinc-700 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-700">
                <CheckCircle2 size={14} className="text-green-400" />
                <p className="text-green-400 text-xs font-medium">
                  JSON válido — {preview.length} categorías, {totalItems} ítems
                </p>
              </div>
              <div className="divide-y divide-zinc-700/50">
                {preview.map((cat, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                    <span className="text-white text-sm">{cat.name}</span>
                    <span className="text-zinc-500 text-xs">{cat.items.length} ítem{cat.items.length !== 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-between gap-3">
          <p className="text-zinc-600 text-xs">
            {mode === 'replace'
              ? '⚠️ Reemplazar borra todo el menú actual'
              : '✚ Las categorías se añadirán al final'}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="text-zinc-400" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleImport}
              disabled={!preview || !!parseError || loading}
              className="min-w-24">
              {loading ? 'Importando...' : `Importar ${mode === 'replace' ? 'y reemplazar' : 'categorías'}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
