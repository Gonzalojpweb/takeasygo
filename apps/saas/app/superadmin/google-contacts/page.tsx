'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Users,
  Plug,
  PlugZap,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Mail,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface ConnectionStatus {
  isConnected: boolean
  connectedEmail: string | null
  authorizedAt: string | null
}

interface SyncResult {
  tenantId: string
  tenantName: string
  created: number
  skipped: number
  total: number
  errors: number
  error: string | null
}

interface SyncResponse {
  results: Record<string, { created: number; skipped: number; total: number; errors: number }>
  dryRun: boolean
}

export default function SuperadminGoogleContactsPage() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<ConnectionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const oauthResult = searchParams.get('googleContacts')

  useEffect(() => {
    fetch('/api/superadmin/google-contacts/status')
      .then(r => r.json())
      .then(data => {
        setStatus(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [oauthResult])

  const handleConnect = () => {
    window.location.href = '/api/superadmin/google-contacts/auth'
  }

  const handleSync = async (dryRun = false) => {
    setSyncing(true)
    setSyncResult(null)
    setError(null)

    try {
      const res = await fetch('/api/superadmin/google-contacts/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantIds: [], // Empty = sync all assigned tenants
          dryRun,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error al sincronizar')
      } else {
        setSyncResult(data)
      }
    } catch (err) {
      setError('Error de conexión')
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-10 w-64 bg-muted rounded" />
          <div className="h-32 bg-muted rounded-xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Users size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-foreground text-3xl font-bold tracking-tight">Google Contacts</h1>
            <p className="text-muted-foreground text-sm font-medium">
              Sincronización de contactos de tenants con Google Contacts
            </p>
          </div>
        </div>
      </div>

      {/* OAuth result toast */}
      {oauthResult === 'success' && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-700">
          <CheckCircle2 size={18} />
          <span className="text-sm font-medium">Google account conectado exitosamente.</span>
        </div>
      )}
      {oauthResult === 'error' && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-700">
          <XCircle size={18} />
          <span className="text-sm font-medium">Error al conectar con Google. Intentá de nuevo.</span>
        </div>
      )}

      {/* Connection Status Card */}
      <Card className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              {status?.isConnected ? (
                <PlugZap size={20} className="text-green-500" />
              ) : (
                <Plug size={20} className="text-muted-foreground" />
              )}
              Estado de conexión
            </h2>
            {status?.isConnected ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Mail size={14} />
                  {status.connectedEmail}
                </p>
                {status.authorizedAt && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Clock size={12} />
                    Conectado el {new Date(status.authorizedAt).toLocaleDateString('es-AR')}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No hay cuenta de Google conectada. Conectá una cuenta para sincronizar contactos.
              </p>
            )}
          </div>

          <div className="flex gap-2">
            {status?.isConnected ? (
              <Button
                variant="outline"
                onClick={handleConnect}
                className="gap-2"
              >
                <RefreshCw size={14} />
                Reconectar
              </Button>
            ) : (
              <Button onClick={handleConnect} className="gap-2">
                <Plug size={14} />
                Conectar Google
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Sync Controls */}
      {status?.isConnected && (
        <Card className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Sincronizar contactos</h2>
                <p className="text-sm text-muted-foreground">
                  Exportá consumidores de todos tus tenants asignados a Google Contacts
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleSync(true)}
                  disabled={syncing}
                  className="gap-2"
                >
                  {syncing ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <AlertTriangle size={14} />
                  )}
                  Dry Run
                </Button>
                <Button
                  onClick={() => handleSync(false)}
                  disabled={syncing}
                  className="gap-2"
                >
                  {syncing ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  Sincronizar
                </Button>
              </div>
            </div>

            {/* Sync Results */}
            {syncResult && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {syncResult.dryRun ? 'Dry Run' : 'Resultado'}
                  </span>
                </div>
                <div className="grid gap-2">
                  {Object.entries(syncResult.results).map(([tenantId, result]) => (
                    <div
                      key={tenantId}
                      className="flex items-center justify-between p-3 rounded-lg border border-border/50"
                    >
                      <span className="text-sm font-medium">{tenantId.slice(0, 8)}...</span>
                      <div className="flex gap-4 text-xs">
                        <span className="text-green-600">{result.created} creados</span>
                        <span className="text-muted-foreground">{result.skipped} omitidos</span>
                        <span className="text-muted-foreground">{result.total} total</span>
                        {result.errors > 0 && (
                          <span className="text-red-600">{result.errors} errores</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-700">
                <XCircle size={14} />
                <span className="text-sm">{error}</span>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
