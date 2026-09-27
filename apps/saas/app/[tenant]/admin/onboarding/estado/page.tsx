import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { redirect } from 'next/navigation'

export default async function OnboardingEstadoPage({ params }: { params: Promise<{ tenant: string }> }) {
  await connectDB()
  const { tenant: tenantSlug } = await params
  const tenant = await Tenant.findOne({ slug: tenantSlug })

  if (!tenant) {
    redirect('/login')
  }

  const { status, rejectionReason } = tenant.onboarding

  if (status === 'approved') {
    redirect(`/${tenant.slug}/admin`)
  }

  return (
    <div className="max-w-xl mx-auto py-12 px-4 text-center">
      <div className="bg-white rounded-lg shadow p-8 border border-gray-100">
        
        {status === 'pending_review' && (
          <>
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 mb-6">
              <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2">Revisión en curso</h1>
            <p className="text-gray-600 mb-6">
              Recibimos tu solicitud y estamos configurando los últimos detalles de tu menú. Te enviaremos un email en cuanto esté listo.
            </p>
            <p className="text-sm text-gray-400">Esto suele tomar menos de 24 horas hábiles.</p>
          </>
        )}

        {status === 'rejected' && (
          <>
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-6">
              <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2 text-red-900">Revisión rechazada</h1>
            <p className="text-gray-600 mb-4">Hubo un problema con tu solicitud.</p>
            {rejectionReason && (
              <div className="bg-red-50 p-4 rounded-md text-red-700 text-sm mb-6 text-left">
                <strong>Motivo:</strong> {rejectionReason}
              </div>
            )}
            <a href={`/${tenant.slug}/admin/onboarding`} className="text-blue-600 hover:underline text-sm font-medium">
              Volver a editar mi perfil
            </a>
          </>
        )}

        {status === 'draft' && (
          <>
            <h1 className="text-2xl font-bold mb-2">Solicitud incompleta</h1>
            <p className="text-gray-600 mb-6">Todavía no enviaste tu perfil a revisión.</p>
            <a href={`/${tenant.slug}/admin/onboarding`} className="inline-block bg-black text-white px-6 py-2 rounded-md font-medium">
              Continuar configurando
            </a>
          </>
        )}
      </div>
    </div>
  )
}
