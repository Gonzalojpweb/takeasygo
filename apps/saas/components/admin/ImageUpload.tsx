'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Upload, Link as LinkIcon, X, Image as ImageIcon } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
  accept?: string
  tenantSlug: string
}

export default function ImageUpload({ value, onChange, label, placeholder, accept = 'image/*', tenantSlug }: Props) {
  const [mode, setMode] = useState<'url' | 'upload'>('url')
  const [uploading, setUploading] = useState(false)
  
  // Ensure value is never undefined
  const safeValue = value ?? ''

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(`/api/${tenantSlug}/upload`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al subir imagen')
      onChange(data.url)
      toast.success('Imagen subida correctamente')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setUploading(false)
    }
  }

  function handleClear() {
    onChange('')
  }

  return (
    <div className="space-y-2">
      {label && <Label className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">{label}</Label>}
      
      {/* Mode Toggle */}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === 'url' ? 'default' : 'outline'}
          onClick={() => setMode('url')}
          className="flex-1"
        >
          <LinkIcon size={14} className="mr-2" />
          URL
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === 'upload' ? 'default' : 'outline'}
          onClick={() => setMode('upload')}
          className="flex-1"
        >
          <Upload size={14} className="mr-2" />
          Subir
        </Button>
      </div>

      {/* URL Mode */}
      {mode === 'url' ? (
        <div key="url-mode" className="relative">
          <Input
            type="url"
            value={safeValue}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder || 'https://...'}
            className="bg-muted/40 border-2 border-border/60 focus:border-primary/40 h-12 rounded-xl text-sm font-medium pr-10"
          />
          {safeValue && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6"
            >
              <X size={14} />
            </Button>
          )}
        </div>
      ) : (
        <div key="upload-mode" className="relative">
          <Input
            key={`file-input-${Date.now()}`}
            type="file"
            accept={accept}
            onChange={handleFileUpload}
            disabled={uploading}
            className="bg-muted/40 border-2 border-border/60 focus:border-primary/40 h-12 rounded-xl text-sm font-medium file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary/10 file:text-primary file:font-medium"
          />
          {uploading && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-xl">
              <span className="text-sm font-medium">Subiendo...</span>
            </div>
          )}
        </div>
      )}

      {/* Preview */}
      {safeValue && (
        <div className="relative mt-2">
          <img
            src={safeValue}
            alt="Preview"
            className="w-full h-32 object-cover rounded-xl border-2 border-border/60"
            onError={() => {
              toast.error('Error al cargar la imagen')
            }}
          />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            onClick={handleClear}
            className="absolute top-2 right-2 h-8 w-8 rounded-full"
          >
            <X size={14} />
          </Button>
        </div>
      )}
    </div>
  )
}
