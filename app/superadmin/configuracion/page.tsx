import { connectDB } from '@/lib/mongoose'
import PlatformConfig from '@/models/PlatformConfig'
import { decrypt } from '@/lib/crypto'
import PlatformMPSettings from '@/components/superadmin/PlatformMPSettings'
import { Settings } from 'lucide-react'

export default async function SuperAdminConfigPage() {
  await connectDB()
  const config = await PlatformConfig.findById('platform').lean() as any
  const mp = config?.mercadopago ?? {}

  function hint(encrypted: string | null | undefined) {
    if (!encrypted) return null
    try { return '••••••••' + decrypt(encrypted).slice(-6) } catch { return null }
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <Settings size={22} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configuración de la plataforma</h1>
          <p className="text-xs text-muted-foreground font-medium">Credenciales globales del sistema</p>
        </div>
      </div>

      <PlatformMPSettings
        isConfigured={!!mp.isConfigured}
        hasAccessToken={!!mp.accessToken}
        hasWebhookSecret={!!mp.webhookSecret}
        accessTokenHint={hint(mp.accessToken)}
        webhookSecretHint={hint(mp.webhookSecret)}
      />
    </div>
  )
}
