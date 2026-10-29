import SwaggerViewer from '@/components/superadmin/SwaggerViewer'

// ============================================================================
// /superadmin/api-docs — Swagger UI de la API de TakeasyGO (solo superadmin;
// el layout de /superadmin ya lo exige). El spec sale del código.
// ============================================================================

export const metadata = { title: 'API — Swagger | TakeasyGO' }

export default function ApiDocsPage() {
  return (
    <div className="p-6 space-y-4 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold">API de TakeasyGO</h1>
        <p className="text-sm text-muted-foreground mt-1">
          POS online (SaaS), asistente TEO y Sync (EC2). Generado desde el código con{' '}
          <code className="text-xs">apps/saas/scripts/build-openapi.mjs</code>. Para probar una ruta del POS, tocá «Authorize» y pegá
          un JWT del POS de un comercio de prueba — nunca uno de producción.
        </p>
      </div>
      <SwaggerViewer specUrl="/api/superadmin/openapi" />
    </div>
  )
}
